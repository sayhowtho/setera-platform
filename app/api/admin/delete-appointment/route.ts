export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { cancelCalendarEvent } from '@/lib/google-calendar';

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { appointmentId } = await req.json().catch(() => ({}));
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });

  const { data: appt, error: fetchError } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

  const { error: deleteError } = await admin.from('appointments').delete().eq('id', appointmentId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  // Reopen the slot. Direct/calendar bookings have no availability_id, so fall
  // back to matching the slot by date + time.
  let slotQuery = admin.from('setter_availability').update({ is_booked: false });
  slotQuery = appt.availability_id
    ? slotQuery.eq('id', appt.availability_id)
    : slotQuery.eq('date', appt.scheduled_date).eq('time_slot', appt.scheduled_time).eq('is_blocked', false); // never touch a blocked slot (migrations/031)
  const { error: slotError } = await slotQuery;

  let calendarWarning: string | null = null;
  if (appt.meet_link) {
    try {
      await cancelCalendarEvent(appt.meet_link, appt.scheduled_date);
    } catch (e: any) {
      console.error('Delete appointment: calendar cancel failed:', e);
      calendarWarning = 'Appointment deleted, but the Google Calendar event could not be cancelled (' + (e?.message || 'unknown error') + '). Remove it from Google Calendar manually.';
    }
  }

  return NextResponse.json({
    success: true,
    calendarWarning,
    slotWarning: slotError ? 'Appointment deleted, but its time slot could not be reopened: ' + slotError.message : null,
  });
}
