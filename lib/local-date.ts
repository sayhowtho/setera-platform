// Dates and times in the viewer's own timezone. Our users are in Regina
// (UTC-6, no DST), where UTC-based helpers go wrong every evening:
// toISOString() is already tomorrow from 6 pm, and new Date('YYYY-MM-DD') is
// UTC midnight, which is 6 pm the evening before.

// d (default now) as YYYY-MM-DD on the local calendar.
export function localDateStr(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// Local calendar days from timestamp `iso` to `now`: 0 = same day, 1 =
// yesterday (even 10 minutes before midnight). Not 24-hour periods.
export function localDaysAgo(iso: string, now: Date = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(now) - day(new Date(iso))) / 86400000);
}

// "Last Contact": Today / 1d ago / Nd ago on the local calendar.
export function lastContactLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const n = Math.max(0, localDaysAgo(iso, now));
  return n === 0 ? 'Today' : n + 'd ago';
}

// A date-only 'YYYY-MM-DD' as local midnight of that day.
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Has an appointment on scheduledDate at scheduledTime ('2:30 PM'; blank means
// end of day) already started, in local time?
export function isPastAppointment(scheduledDate: string | null, scheduledTime: string | null, now: Date = new Date()): boolean {
  if (!scheduledDate) return false;
  const [time, period] = (scheduledTime || '11:59 PM').split(' ');
  const [h, m] = time.split(':').map(Number);
  const dt = parseLocalDate(scheduledDate);
  dt.setHours(h % 12 + (period === 'PM' ? 12 : 0), m || 0, 0, 0);
  return dt.getTime() < now.getTime();
}

// A call outside 8 am – 6 pm local time.
export function isAfterHours(dateStr: string): boolean {
  const hour = new Date(dateStr).getHours();
  return hour < 8 || hour >= 18;
}
