export const runtime = 'nodejs';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, QUICK_ADD_ROLES } from '@/lib/server-auth';

// All four legitimate callers (High Table, rep portal, setter portal,
// BookNowModal) already run inside an authenticated session — this had no
// auth check at all, unlike its sibling /api/admin/delete-appointment, so
// anyone who found the URL could create real Google Calendar events on the
// Setera Demos calendar. QUICK_ADD_ROLES matches the broadest set of roles
// that legitimately book a demo (same set /api/overflow/rep-add uses).
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, QUICK_ADD_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { title, date, time, attendeeName, attendeeEmail, notes } = await req.json();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!clientId || !clientSecret || !refreshToken || !calendarId) {
      return NextResponse.json({ error: 'Missing Google credentials' }, { status: 500 });
    }
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth });
    const [year, month, day] = date.split('-').map(Number);
    const [hourStr, minuteStr] = time.split(':');
    const hour12 = parseInt(hourStr);
    const minuteRaw = minuteStr || '0';
    const minute = parseInt(minuteRaw);
    const isPM = minuteRaw.toLowerCase().includes('pm');
    const isAM = minuteRaw.toLowerCase().includes('am');
    let hour = hour12;
    if (isPM && hour12 !== 12) hour = hour12 + 12;
    if (isAM && hour12 === 12) hour = 0;
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDateTime = date + 'T' + pad(hour) + ':' + pad(minute) + ':00-06:00';
    const endDateTime = date + 'T' + pad(hour + 1) + ':' + pad(minute) + ':00-06:00';
    const event = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: title || 'Setera Demo',
        description: notes || '',
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Regina',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Regina',
        },
        conferenceData: {
          createRequest: {
            requestId: 'setera-' + Date.now(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName }] : [],
      },
    });
    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    )?.uri;
    return NextResponse.json({ meetLink, eventId: event.data.id });
  } catch (error: any) {
    console.error('Create Meet error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}