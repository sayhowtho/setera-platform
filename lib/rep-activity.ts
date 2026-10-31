// High Table → Rep Activity: per-rep summary and the "quiet rep" flag.
// Pure functions (no DB); /api/admin/rep-activity feeds them, the UI renders
// them. Times are Regina (fixed UTC-6, no DST), like Setter Activity.

const REGINA_OFFSET_MS = 6 * 3600 * 1000;
export const WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri
export const WORK_START_HOUR = 8;  // 8am Regina
export const WORK_END_HOUR = 18;   // 6pm Regina

export const reginaDayStartMs = (dateStr: string) => Date.parse(dateStr + 'T00:00:00-06:00');
export const reginaDateOf = (ms: number) => new Date(ms - REGINA_OFFSET_MS).toISOString().slice(0, 10);

export type Activity = { id: string; rep_id: string; prospect_id: string | null; type: string; outcome: string | null; notes: string | null; follow_up_date: string | null; created_at: string };
export type OwnedProspect = { id: string; rep_id: string; status: string; follow_up_date: string | null };
export type Allocation = { prospect_id: string; to_rep_id: string; moved_at: string };

export type RepSummary = {
  allocated: number;          // allocations to the rep in the period
  touched: number;            // prospects they own now that have logged activity
  untouched: number;          // prospects they own now: Not Contacted, no logged activity
  activities: number;         // activities they logged in the period
  calls: number; emails: number; otherTypes: number;
  noOutcome: number; noNotes: number; // quality: activities in the period missing either
  followUpsScheduled: number; // period activities (not Demo) that set a follow-up date
  followUpsOverdue: number;   // now: open prospects they own whose follow-up date has passed with nothing logged since
  firstTouch: { allocations: number; touched: number; avgHours: number | null }; // allocations in the period -> first activity by the rep
};

const blank = (s: string | null | undefined) => !(s || '').trim();
const CLOSED = ['Closed Won', 'Closed Lost'];

// periodActs: the rep's activities in the period. allActsOnOwned: every
// activity (any actor, any time) on prospects the rep owns now.
// repActsOnAllocated: the rep's own activities (any time) on prospects
// allocated to them in the period.
export function summarizeRep(args: {
  periodActs: Activity[];
  owned: OwnedProspect[];
  allActsOnOwned: Activity[];
  allocationsInPeriod: Allocation[];
  repActsOnAllocated: Activity[];
  todayStr: string;
}): RepSummary {
  const { periodActs, owned, allActsOnOwned, allocationsInPeriod, repActsOnAllocated, todayStr } = args;
  const actsByProspect = new Map<string, Activity[]>();
  for (const a of allActsOnOwned) if (a.prospect_id) (actsByProspect.get(a.prospect_id) ?? actsByProspect.set(a.prospect_id, []).get(a.prospect_id)!).push(a);

  const touched = owned.filter(p => actsByProspect.has(p.id)).length;
  const untouched = owned.filter(p => p.status === 'Not Contacted' && !actsByProspect.has(p.id)).length;

  const todayStart = reginaDayStartMs(todayStr);
  const followUpsOverdue = owned.filter(p => {
    if (!p.follow_up_date || CLOSED.includes(p.status)) return false;
    const dueStart = reginaDayStartMs(p.follow_up_date);
    if (dueStart >= todayStart) return false; // due today or later: not overdue yet
    return !(actsByProspect.get(p.id) || []).some(a => Date.parse(a.created_at) >= dueStart);
  }).length;

  let touchedCount = 0, totalHours = 0;
  for (const al of allocationsInPeriod) {
    const t0 = Date.parse(al.moved_at);
    const first = repActsOnAllocated
      .filter(a => a.prospect_id === al.prospect_id && Date.parse(a.created_at) >= t0)
      .reduce<number | null>((m, a) => { const t = Date.parse(a.created_at); return m === null || t < m ? t : m; }, null);
    if (first !== null) { touchedCount++; totalHours += (first - t0) / 3600000; }
  }

  return {
    allocated: allocationsInPeriod.length,
    touched, untouched,
    activities: periodActs.length,
    calls: periodActs.filter(a => a.type === 'Call').length,
    emails: periodActs.filter(a => a.type === 'Email').length,
    otherTypes: periodActs.filter(a => a.type !== 'Call' && a.type !== 'Email').length,
    noOutcome: periodActs.filter(a => blank(a.outcome)).length,
    noNotes: periodActs.filter(a => blank(a.notes)).length,
    followUpsScheduled: periodActs.filter(a => a.type !== 'Demo' && !!a.follow_up_date).length,
    followUpsOverdue,
    firstTouch: { allocations: allocationsInPeriod.length, touched: touchedCount, avgHours: touchedCount ? totalHours / touchedCount : null },
  };
}

// Working-hours check and the quiet flag. Flags only during working hours, and
// only once `hours` of today's working time have passed (so nobody is flagged
// at 8:05am for not having logged anything since yesterday).
export function isWorkingTime(nowMs: number): boolean {
  const local = new Date(nowMs - REGINA_OFFSET_MS);
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  return WORK_DAYS.includes(local.getUTCDay()) && h >= WORK_START_HOUR && h < WORK_END_HOUR;
}

export function quietFlag(lastActivityAt: string | null, nowMs: number, hours: number): string | null {
  if (!isWorkingTime(nowMs) || !(hours > 0)) return null;
  const today = reginaDateOf(nowMs);
  const workStart = reginaDayStartMs(today) + WORK_START_HOUR * 3600000;
  if (nowMs - workStart < hours * 3600000) return null;
  const last = lastActivityAt ? Date.parse(lastActivityAt) : null;
  if (last === null || last < reginaDayStartMs(today)) return 'No activity today';
  if (nowMs - last >= hours * 3600000) return `Nothing logged in ${hours}h+`;
  return null;
}

// "2:14pm today", "9:03am yesterday", "Sep 28, 4:40pm"
export function feedTime(iso: string, nowMs: number): string {
  const ms = Date.parse(iso);
  const local = new Date(ms - REGINA_OFFSET_MS);
  let h = local.getUTCHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const time = `${h}:${String(local.getUTCMinutes()).padStart(2, '0')}${ampm}`;
  const day = reginaDateOf(ms), today = reginaDateOf(nowMs), yesterday = reginaDateOf(reginaDayStartMs(today) - 1);
  if (day === today) return time + ' today';
  if (day === yesterday) return time + ' yesterday';
  const label = local.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  return `${label}, ${time}`;
}

export function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
  if (h < 48) return (Math.round(h * 10) / 10) + 'h';
  return Math.round(h / 24) + 'd';
}
