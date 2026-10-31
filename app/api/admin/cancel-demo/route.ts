export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requireRole, QUICK_ADD_ROLES } from '@/lib/server-auth';
import { demosCalendar, findEventsByMeetLink, googleError, NO_EVENT_MESSAGE } from '@/lib/google-calendar';
import { REBOOK_URL, canManageDemo } from '@/lib/slots';

// High Table → Calendar → Booked slot → Cancel demo (Alex, 2026-10-03).
//
// Unlike Delete appointment, this keeps the record (status 'Cancelled') and
// reopens the slot. Google comes first: if any Google call fails, nothing is
// changed in Setera and the error goes back to Alex, so the two never drift
// apart. "Notify the prospect" = Google's own cancellation email to whoever
// is on the invite (sendUpdates 'all'); there is no other email/SMS sender.
// Before deleting, the event description gets a line with the rebook link.
// Used by High Table, the setter portal and the rep portal: admins can cancel
// any demo, setters and reps only one they booked or are assigned to
// (canManageDemo in lib/slots.ts).

// GET ?appointmentId= — who is on the Google invite, so the popover can warn
// when nobody will be notified.
export async function GET(req: Request) {
  const auth = await requireRole(req, QUICK_ADD_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const appointmentId = new URL(req.url).searchParams.get('appointmentId');
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
  const { data: appt, error } = await auth.admin.from('appointments').select('meet_link, scheduled_date, setter_id, assigned_to').eq('id', appointmentId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!appt || !canManageDemo(auth.user, appt)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (!appt.meet_link) return NextResponse.json({ hasMeetLink: false, eventFound: false, inviteEmails: [] });

  try {
    const events = await findEventsByMeetLink(appt.meet_link, appt.scheduled_date);
    const inviteEmails = Array.from(new Set(events.flatMap(e => (e.attendees || []).filter(a => !a.self && !a.organizer && a.email).map(a => a.email!))));
    return NextResponse.json({ hasMeetLink: true, eventFound: events.length > 0, inviteEmails });
  } catch (e) {
    return NextResponse.json({ hasMeetLink: true, eventFound: false, inviteEmails: [], lookupError: googleError(e).message });
  }
}

// POST { appointmentId, notify, force? } — force = Alex saw "no Google event
// found" and chose to cancel in Setera anyway.
export async function POST(req: Request) {
  const auth = await requireRole(req, QUICK_ADD_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { appointmentId, notify = true, force = false } = await req.json().catch(() => ({}));
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });

  const { data: appt, error: fetchError } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!appt || !canManageDemo(auth.user, appt)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (appt.status !== 'Scheduled') return NextResponse.json({ error: 'This demo is already ' + (appt.status || 'not scheduled') + '.' }, { status: 409 });

  const warnings: string[] = [];
  let googleEventDeleted = false;
  let notifiedEmails: string[] = [];

  if (appt.meet_link) {
    const unchanged = ' Nothing was changed in Setera; the demo is still booked.';
    let events;
    try {
      events = await findEventsByMeetLink(appt.meet_link, appt.scheduled_date);
    } catch (e) {
      return NextResponse.json({ error: 'Google Calendar error: ' + googleError(e).message + '.' + unchanged }, { status: 502 });
    }
    if (events.length === 0 && !force) {
      return NextResponse.json({ error: NO_EVENT_MESSAGE + unchanged, code: 'event_not_found' }, { status: 409 });
    }
    const { calendar, calendarId } = demosCalendar();
    for (const e of events) {
      if (notify) {
        try {
          await calendar.events.patch({
            calendarId, eventId: e.id!, sendUpdates: 'none',
            requestBody: { description: 'This demo has been cancelled. To pick a new time: ' + REBOOK_URL + (e.description ? '\n\n' + e.description : '') },
          });
        } catch (err) {
          warnings.push('Could not add the rebook link to the invite (' + googleError(err).message + '); the cancellation email was still sent.');
        }
      }
      try {
        await calendar.events.delete({ calendarId, eventId: e.id!, sendUpdates: notify ? 'all' : 'none' });
      } catch (err) {
        const g = googleError(err);
        if (g.code !== 404 && g.code !== 410) {
          return NextResponse.json({ error: 'Google Calendar could not delete the event: ' + g.message + '.' + unchanged }, { status: 502 });
        }
      }
      googleEventDeleted = true;
      if (notify) notifiedEmails.push(...(e.attendees || []).filter(a => !a.self && !a.organizer && a.email).map(a => a.email!));
    }
  }
  notifiedEmails = Array.from(new Set(notifiedEmails));

  const { data: updated, error: updateError } = await admin.from('appointments').update({ status: 'Cancelled' }).eq('id', appointmentId).eq('status', 'Scheduled').select('id');
  if (updateError || (updated?.length ?? 0) === 0) {
    const why = updateError?.message || 'its status changed while cancelling';
    return NextResponse.json({
      error: (googleEventDeleted ? 'The Google event was deleted, but ' : '') + 'Setera could not mark the demo cancelled (' + why + '). Mark it cancelled from Appointment Detail.',
    }, { status: 500 });
  }

  // Free the slot back to Open. Only a booked (not blocked) slot.
  if (appt.availability_id) {
    const { error: slotError } = await admin.from('setter_availability').update({ is_booked: false }).eq('id', appt.availability_id).eq('is_blocked', false);
    if (slotError) warnings.push('Demo cancelled, but its slot could not be reopened: ' + slotError.message);
  }
  if (!appt.meet_link) warnings.push('This demo had no Google event, so there was nothing to delete and nobody was emailed.');

  return NextResponse.json({ success: true, googleEventDeleted, notifiedEmails, warnings });
}
