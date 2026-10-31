// Run: npm test (also meaningful under TZ=America/Regina)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateStr, parseLocalDate, isPastAppointment, isAfterHours, localDaysAgo, lastContactLabel } from './local-date';

const westOfUtc = new Date().getTimezoneOffset() > 0;

test('localDateStr is the local calendar date, late evening included', () => {
  assert.equal(localDateStr(new Date(2026, 9, 6, 0, 0)), '2026-10-06');
  assert.equal(localDateStr(new Date(2026, 9, 6, 23, 59)), '2026-10-06');
  assert.equal(localDateStr(new Date(2026, 0, 5, 12)), '2026-01-05');
});

test('west of UTC, the evening is already tomorrow in UTC but not locally', { skip: !westOfUtc }, () => {
  const evening = new Date(2026, 9, 6, 23, 0);
  assert.equal(evening.toISOString().slice(0, 10), '2026-10-07');
  assert.equal(localDateStr(evening), '2026-10-06');
});

test('parseLocalDate is local midnight, not UTC midnight', () => {
  const d = parseLocalDate('2026-10-07');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 7, 0]);
  assert.equal(localDateStr(parseLocalDate('2026-01-31')), '2026-01-31');
});

test('isPastAppointment compares in local time', () => {
  const now = new Date(2026, 9, 6, 18, 30); // Oct 6, 6:30 pm local
  assert.equal(isPastAppointment('2026-10-06', '9:00 AM', now), true);
  assert.equal(isPastAppointment('2026-10-06', '6:00 PM', now), true);
  assert.equal(isPastAppointment('2026-10-06', '11:00 PM', now), false);
  assert.equal(isPastAppointment('2026-10-06', null, now), false); // blank time = end of day
  assert.equal(isPastAppointment('2026-10-07', '8:00 AM', now), false); // the old UTC parse called this past
  assert.equal(isPastAppointment('2026-10-07', '12:30 AM', now), false);
  assert.equal(isPastAppointment('2026-10-06', '12:00 PM', now), true);
  assert.equal(isPastAppointment('2026-10-05', null, now), true);
  assert.equal(isPastAppointment(null, '9:00 AM', now), false);
});

test('isAfterHours uses the local hour (8 am – 6 pm is business hours)', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).toISOString();
  assert.equal(isAfterHours(at(7, 59)), true);
  assert.equal(isAfterHours(at(8, 0)), false);
  assert.equal(isAfterHours(at(13, 0)), false);
  assert.equal(isAfterHours(at(17, 59)), false);
  assert.equal(isAfterHours(at(18, 0)), true);
  assert.equal(isAfterHours(at(23, 30)), true);
});

test('lastContactLabel counts local calendar days, not 24-hour periods', () => {
  const now = new Date(2026, 9, 7, 13, 30); // Oct 7, 1:30 pm local
  assert.equal(lastContactLabel(new Date(2026, 9, 6, 20, 0).toISOString(), now), '1d ago'); // yesterday 8 pm (was "Today")
  assert.equal(lastContactLabel(new Date(2026, 9, 6, 23, 59).toISOString(), now), '1d ago');
  assert.equal(lastContactLabel(new Date(2026, 9, 7, 0, 1).toISOString(), now), 'Today');
  assert.equal(lastContactLabel(new Date(2026, 9, 7, 13, 0).toISOString(), now), 'Today');
  assert.equal(lastContactLabel(new Date(2026, 9, 4, 9, 0).toISOString(), now), '3d ago');
  assert.equal(lastContactLabel(new Date(2025, 11, 31, 22, 0).toISOString(), new Date(2026, 0, 1, 1, 0)), '1d ago'); // across a year
  assert.equal(lastContactLabel(null, now), 'Never');
  assert.equal(lastContactLabel(new Date(2026, 9, 7, 14, 0).toISOString(), now), 'Today'); // clock skew: never negative
  assert.equal(localDaysAgo(new Date(2026, 9, 6, 20, 0).toISOString(), new Date(2026, 9, 7, 19, 0)), 1);
});
