export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import type { calendar_v3 } from 'googleapis';
import { requireRole, QUICK_ADD_ROLES } from '@/lib/server-auth';
import { demosCalendar, findEventsByMeetLink, googleError, NO_EVENT_MESSAGE } from '@/lib/google-calendar';
import { canManageDemo, movedEventTimes, slotLabel, SLOT_TAKEN_MESSAGE } from '@/lib/slots';

// Rep portal → Reschedule (Alex, 2026-10-03). Moves the SAME Google event to
// the new slot (patch, not delete + recreate) so the Meet link stays the same;
// Google emails the invitee the new time (sendUpdates 'all').
//
// Order, so Setera and Google never drift apart:
//   1. claim the new slot (open -> booked), so nobody books it meanwhile;
//   2. move the Google event; any Google failure releases the new slot and
//      changes nothing else;
//   3. move the appointment; if that fails, the Google event is moved back;
//   4. reopen the old slot.
// Same access as cancel-demo: admins any demo, setters/reps only their own.

export async function POST(req: Request) {
  const auth = await requireRole(req, QUICK_ADD_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { appointmentId, newSlotId, force = false } = await req.json().catch(() => ({}));
  if (!appointmentId || !newSlotId) return NextResponse.json({ error: 'appointmentId and newSlotId required' }, { status: 400 });

  const { data: appt, error: fetchError } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!appt || !canManageDemo(auth.user, appt)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (appt.status !== 'Scheduled') return NextResponse.json({ error: 'This demo is ' + (appt.status || 'not scheduled') + ', so it can\'t be rescheduled.' }, { status: 409 });

  const { data: slot, error: slotFetchError } = await admin.from('setter_availability').select('*').eq('id', newSlotId).maybeSingle();
  if (slotFetchError) return NextResponse.json({ error: slotFetchError.message }, { status: 500 });
  if (!slot) return NextResponse.json({ error: 'That slot no longer exists. Pick another time.' }, { status: 404 });
  if (slot.id === appt.availability_id) return NextResponse.json({ error: 'The demo is already in that slot.' }, { status: 400 });
  if (appt.assigned_to && slot.owned_by !== appt.assigned_to) return NextResponse.json({ error: "That slot is on someone else's calendar." }, { status: 400 });
  const times = movedEventTimes(slot.date, slot.time_slot);
  if (!times) return NextResponse.json({ error: 'Could not read the time of that slot (' + slot.time_slot + ').' }, { status: 400 });

  // 1. Claim the new slot.
  const { data: claimed, error: claimError } = await admin.from('setter_availability').update({ is_booked: true }).eq('id', slot.id).eq('is_booked', false).select('id');
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if ((claimed?.length ?? 0) === 0) return NextResponse.json({ error: SLOT_TAKEN_MESSAGE }, { status: 409 });
  const releaseNew = () => admin.from('setter_availability').update({ is_booked: false }).eq('id', slot.id).eq('is_blocked', false);
  const unchanged = ' Nothing was changed in Setera; the demo is still at ' + slotLabel({ date: appt.scheduled_date, time_slot: appt.scheduled_time }) + '.';

  // 2. Move the Google event(s).
  const warnings: string[] = [];
  const moved: { id: string; start: calendar_v3.Schema$EventDateTime; end: calendar_v3.Schema$EventDateTime }[] = [];
  let notifiedEmails: string[] = [];
  let calendar: calendar_v3.Calendar | null = null, calendarId = '';
  if (appt.meet_link) {
    let events: calendar_v3.Schema$Event[];
    try {
      ({ calendar, calendarId } = demosCalendar());
      events = await findEventsByMeetLink(appt.meet_link, appt.scheduled_date);
    } catch (e) {
      await releaseNew();
      return NextResponse.json({ error: 'Google Calendar error: ' + googleError(e).message + '.' + unchanged }, { status: 502 });
    }
    if (events.length === 0 && !force) {
      await releaseNew();
      return NextResponse.json({ error: NO_EVENT_MESSAGE + unchanged, code: 'event_not_found' }, { status: 409 });
    }
    for (const e of events) {
      const t = movedEventTimes(slot.date, slot.time_slot, e.start?.dateTime, e.end?.dateTime)!;
      try {
        await calendar!.events.patch({
          calendarId, eventId: e.id!, sendUpdates: 'all',
          requestBody: { start: { dateTime: t.start, timeZone: 'America/Regina' }, end: { dateTime: t.end, timeZone: 'America/Regina' } },
        });
      } catch (err) {
        const reverted = await revert(calendar!, calendarId, moved);
        await releaseNew();
        return NextResponse.json({ error: 'Google Calendar could not move the event: ' + googleError(err).message + '.' + unchanged + (reverted ? '' : ' An earlier copy of the event may have moved; check Google Calendar.') }, { status: 502 });
      }
      moved.push({ id: e.id!, start: e.start || {}, end: e.end || {} });
      notifiedEmails.push(...(e.attendees || []).filter(a => !a.self && !a.organizer && a.email).map(a => a.email!));
    }
  }
  notifiedEmails = Array.from(new Set(notifiedEmails));

  // 3. Move the appointment.
  const { data: updated, error: moveError } = await admin.from('appointments')
    .update({ scheduled_date: slot.date, scheduled_time: slot.time_slot, availability_id: slot.id })
    .eq('id', appointmentId).eq('status', 'Scheduled').select('id');
  if (moveError || (updated?.length ?? 0) === 0) {
    const why = moveError?.message || 'its status changed while rescheduling';
    const reverted = calendar ? await revert(calendar, calendarId, moved) : true;
    await releaseNew();
    return NextResponse.json({
      error: 'Setera could not move the demo (' + why + ').' + (moved.length === 0 ? unchanged
        : reverted ? ' The Google event was moved back to the original time (the invitee may get two update emails).'
        : ' The Google event could NOT be moved back. Fix the time in Google Calendar by hand.'),
    }, { status: 500 });
  }

  // 4. Reopen the old slot.
  if (appt.availability_id) {
    const { error: oldError } = await admin.from('setter_availability').update({ is_booked: false }).eq('id', appt.availability_id).eq('is_blocked', false);
    if (oldError) warnings.push('Demo moved, but the old slot could not be reopened: ' + oldError.message);
  }
  if (!appt.meet_link) warnings.push('This demo has no Google event, so nobody was emailed the new time.');
  else if (moved.length === 0) warnings.push('No Google event was found, so nobody was emailed the new time.');

  return NextResponse.json({ success: true, googleEventMoved: moved.length > 0, notifiedEmails, newDate: slot.date, newTime: slot.time_slot, warnings });
}

// Put moved events back where they were. true = all reverted.
async function revert(calendar: calendar_v3.Calendar, calendarId: string, moved: { id: string; start: calendar_v3.Schema$EventDateTime; end: calendar_v3.Schema$EventDateTime }[]): Promise<boolean> {
  let ok = true;
  for (const m of moved) {
    try {
      await calendar.events.patch({ calendarId, eventId: m.id, sendUpdates: 'all', requestBody: { start: m.start, end: m.end } });
    } catch (e) {
      console.error('Reschedule: could not revert Google event ' + m.id + ':', e);
      ok = false;
    }
  }
  return ok;
}
