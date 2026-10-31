import { google, type calendar_v3 } from 'googleapis';

// Server-only. The Setera Demos Google calendar, shared by
// /api/admin/delete-appointment and /api/admin/cancel-demo.
//
// Appointments don't store the Google event id (create-meet returns it but no
// booking flow persists it), so the event is located by its Meet link, which is
// unique per event, within the appointment's day.

export function demosCalendar(): { calendar: calendar_v3.Calendar; calendarId: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!clientId || !clientSecret || !refreshToken || !calendarId) throw new Error('Missing Google credentials');
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

export async function findEventsByMeetLink(meetLink: string, date: string): Promise<calendar_v3.Schema$Event[]> {
  const { calendar, calendarId } = demosCalendar();
  // Bookings are created in -06:00 (America/Regina); pad a day either side.
  const day = new Date(date + 'T12:00:00-06:00').getTime();
  const { data } = await calendar.events.list({
    calendarId,
    timeMin: new Date(day - 36 * 3600 * 1000).toISOString(),
    timeMax: new Date(day + 36 * 3600 * 1000).toISOString(),
    singleEvents: true,
    maxResults: 250,
  });
  return (data.items || []).filter(
    (e) => e.hangoutLink === meetLink || e.conferenceData?.entryPoints?.some((ep) => ep.uri === meetLink)
  );
}

// Google API errors carry the HTTP status in code (sometimes as a string),
// status or response.status; anything else just has a message.
export function googleError(e: unknown): { message: string; code?: number } {
  const err = e as { message?: string; code?: number | string; status?: number; response?: { status?: number } } | null;
  const code = Number(err?.response?.status ?? err?.status ?? err?.code);
  return { message: err?.message || 'unknown error', code: Number.isFinite(code) ? code : undefined };
}

export const NO_EVENT_MESSAGE = 'No calendar event found for this Meet link (it may already be deleted).';

// Delete every event with this Meet link. sendUpdates 'all' has Google email
// the attendees a cancellation; 'none' cancels silently.
export async function cancelCalendarEvent(meetLink: string, date: string, sendUpdates: 'all' | 'none' = 'all'): Promise<void> {
  const { calendar, calendarId } = demosCalendar();
  const matches = await findEventsByMeetLink(meetLink, date);
  if (matches.length === 0) throw new Error(NO_EVENT_MESSAGE);
  for (const e of matches) {
    try {
      await calendar.events.delete({ calendarId, eventId: e.id!, sendUpdates });
    } catch (err) {
      // Already gone is the outcome we wanted.
      const { code } = googleError(err);
      if (code !== 404 && code !== 410) throw err;
    }
  }
}
