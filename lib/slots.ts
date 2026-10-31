// setter_availability helpers shared by High Table, /setter and /rep
// (Alex, 2026-10-02). time_slot is text like "10:00 AM", so:
//   - lists are sorted by date, then real clock time (a text sort puts
//     "1:00 PM" before "10:00 AM");
//   - Generate / Add slot never create a slot at a time that already has one
//     that day for that owner, booked or open (migrations/030 backs this with
//     a unique index);
//   - booking claims the slot first (open -> booked in one conditional
//     update), so two people booking the same slot can't both win;
//   - a blocked slot (migrations/031) is booked + blocked, so it is hidden
//     wherever open slots are listed, and blocking races booking safely.

import type { SupabaseClient } from '@supabase/supabase-js';

export type SlotLike = { date: string; time_slot: string; owned_by?: string | null };

// "10:00 AM" -> 600, "1:00 PM" -> 780, "12:00 PM" -> 720, "12:00 AM" -> 0.
// Anything unparseable sorts last.
export function timeSlotMins(t: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*$/i.exec(t || '');
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === 'P' ? 12 : 0);
  return h * 60 + Number(m[2]);
}

export function compareSlots(a: SlotLike, b: SlotLike): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : timeSlotMins(a.time_slot) - timeSlotMins(b.time_slot);
}

export function sortSlots<T extends SlotLike>(slots: T[]): T[] {
  return [...slots].sort(compareSlots);
}

const normTime = (t: string) => (t || '').trim().toUpperCase().replace(/\s+/g, ' ');
export const slotKey = (s: SlotLike) => `${s.owned_by ?? ''}|${s.date}|${normTime(s.time_slot)}`;

// The wanted slots that don't already exist (booked OR open), without
// duplicates among themselves.
export function newSlotsOnly<T extends SlotLike>(wanted: T[], existing: SlotLike[]): T[] {
  const seen = new Set(existing.map(slotKey));
  return wanted.filter(w => { const k = slotKey(w); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Mark the slot booked only if it is still open. false = someone else got it.
export async function claimSlot(client: SupabaseClient, slotId: string): Promise<boolean> {
  const { data, error } = await client.from('setter_availability').update({ is_booked: true }).eq('id', slotId).eq('is_booked', false).select('id');
  return !error && (data?.length ?? 0) === 1;
}

export async function releaseSlot(client: SupabaseClient, slotId: string): Promise<void> {
  await client.from('setter_availability').update({ is_booked: false }).eq('id', slotId);
}

// Blocked slots (migrations/031): a blocked slot is is_booked = true AND
// is_blocked = true, so every "show open slots" query already hides it.
// Blocking uses the same open -> taken conditional update as claimSlot, so a
// block and a booking racing for one slot can't both win.
export type CalendarSlot = SlotLike & { id: string; is_booked: boolean; is_blocked?: boolean | null; blocked_note?: string | null };
export type SlotState = 'open' | 'booked' | 'blocked';

export function slotState(s: { is_booked: boolean; is_blocked?: boolean | null }): SlotState {
  return s.is_blocked ? 'blocked' : s.is_booked ? 'booked' : 'open';
}

// Every slot from `fromId` to `toId` inclusive, in date + clock order (either
// end may come first), split into what a range block would block and what it
// skips (booked demos, already-blocked slots).
export function planRangeBlock<T extends CalendarSlot>(slots: T[], fromId: string, toId: string): { range: T[]; toBlock: T[]; skippedBooked: T[]; alreadyBlocked: T[] } {
  const sorted = sortSlots(slots);
  const a = sorted.findIndex(s => s.id === fromId), b = sorted.findIndex(s => s.id === toId);
  if (a < 0 || b < 0) return { range: [], toBlock: [], skippedBooked: [], alreadyBlocked: [] };
  const range = sorted.slice(Math.min(a, b), Math.max(a, b) + 1);
  return {
    range,
    toBlock: range.filter(s => slotState(s) === 'open'),
    skippedBooked: range.filter(s => slotState(s) === 'booked'),
    alreadyBlocked: range.filter(s => slotState(s) === 'blocked'),
  };
}

// Block the given slots, each only if it is still open. Returns the ids that
// were blocked; any other id was taken (booked or blocked) in the meantime.
export async function blockSlots(client: SupabaseClient, slotIds: string[], note: string): Promise<{ blocked: string[]; error: string | null }> {
  if (slotIds.length === 0) return { blocked: [], error: null };
  const { data, error } = await client.from('setter_availability')
    .update({ is_booked: true, is_blocked: true, blocked_note: note.trim() || null })
    .in('id', slotIds).eq('is_booked', false).select('id');
  return { blocked: (data || []).map((r: { id: string }) => r.id), error: error?.message ?? null };
}

// Back to open: booked false, blocked false, note cleared. Only touches a slot
// that is actually blocked, so it can never free a real booking.
export async function unblockSlot(client: SupabaseClient, slotId: string): Promise<boolean> {
  const { data, error } = await client.from('setter_availability')
    .update({ is_booked: false, is_blocked: false, blocked_note: null })
    .eq('id', slotId).eq('is_blocked', true).select('id');
  return !error && (data?.length ?? 0) === 1;
}

export async function updateBlockNote(client: SupabaseClient, slotId: string, note: string): Promise<boolean> {
  const { data, error } = await client.from('setter_availability')
    .update({ blocked_note: note.trim() || null })
    .eq('id', slotId).eq('is_blocked', true).select('id');
  return !error && (data?.length ?? 0) === 1;
}

// "Sun Oct 4 · 10:00 AM"
export function slotLabel(s: SlotLike): string {
  return new Date(s.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + s.time_slot;
}

// Who may cancel or reschedule a demo (/api/admin/cancel-demo,
// /api/admin/reschedule-demo): admins any demo;
// setters and reps only one they booked (setter_id) or are assigned to.
export function canManageDemo(user: { id: string; role: string }, appt: { setter_id?: string | null; assigned_to?: string | null }): boolean {
  if (['admin', 'owner'].includes(user.role)) return true;
  return !!user.id && (appt.setter_id === user.id || appt.assigned_to === user.id);
}

// Regina is fixed UTC-6 (no DST), the same offset /api/create-meet books with.
// "2026-10-04" + "1:30 PM" -> epoch ms of that Regina wall-clock time; null if
// the time doesn't parse.
export function reginaSlotStartMs(date: string, timeSlot: string): number | null {
  const mins = timeSlotMins(timeSlot);
  if (mins === Number.MAX_SAFE_INTEGER || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Date.parse(date + 'T00:00:00-06:00') + mins * 60_000;
}

// Epoch ms -> "2026-10-04T13:30:00-06:00" (Regina wall clock).
export function reginaIso(ms: number): string {
  return new Date(ms - 6 * 3_600_000).toISOString().slice(0, 19) + '-06:00';
}

// New start/end for a demo moved to another slot, keeping the event's own
// length (falls back to 60 min, what create-meet books).
export function movedEventTimes(date: string, timeSlot: string, oldStart?: string | null, oldEnd?: string | null): { start: string; end: string } | null {
  const startMs = reginaSlotStartMs(date, timeSlot);
  if (startMs === null) return null;
  const len = oldStart && oldEnd ? Date.parse(oldEnd) - Date.parse(oldStart) : NaN;
  const durationMs = Number.isFinite(len) && len > 0 ? len : 3_600_000;
  return { start: reginaIso(startMs), end: reginaIso(startMs + durationMs) };
}

export const REBOOK_URL = 'https://heysetera.com/demo';

// Generate's dates are Regina calendar dates (fixed UTC-6, no DST), not the
// UTC date: generating after 6 pm Regina used to start from tomorrow because
// toISOString() had already rolled over (Alex, 2026-10-02).
export function reginaToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The next `days` Regina dates, starting today.
export function generationDates(days: number, now: Date = new Date()): string[] {
  const today = reginaToday(now);
  return Array.from({ length: Math.max(0, days) }, (_, i) => addDaysToDate(today, i));
}

export const SLOT_TAKEN_MESSAGE = 'That slot was just booked by someone else. Pick another time.';
