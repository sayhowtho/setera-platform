// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRep, quietFlag, isWorkingTime, feedTime, fmtHours, type Activity } from './rep-activity';

// Wed 2026-09-30 in Regina (UTC-6). 14:00 Regina = 20:00Z.
const at = (reginaLocal: string) => Date.parse(reginaLocal + '-06:00');
const act = (o: Partial<Activity>): Activity => ({ id: Math.random().toString(36), rep_id: 'r', prospect_id: 'p1', type: 'Call', outcome: 'No Answer', notes: 'x', follow_up_date: null, created_at: '2026-09-30T20:00:00Z', ...o });

test('working hours: Mon–Fri 8am–6pm Regina', () => {
  assert.equal(isWorkingTime(at('2026-09-30T14:00:00')), true);
  assert.equal(isWorkingTime(at('2026-09-30T07:59:00')), false);
  assert.equal(isWorkingTime(at('2026-09-30T18:00:00')), false);
  assert.equal(isWorkingTime(at('2026-10-03T12:00:00')), false); // Saturday
});

test('quiet flag', () => {
  const now = at('2026-09-30T14:00:00');
  assert.equal(quietFlag(null, now, 4), 'No activity today');
  assert.equal(quietFlag(new Date(at('2026-09-29T17:00:00')).toISOString(), now, 4), 'No activity today');
  assert.equal(quietFlag(new Date(at('2026-09-30T09:30:00')).toISOString(), now, 4), 'Nothing logged in 4h+');
  assert.equal(quietFlag(new Date(at('2026-09-30T11:00:00')).toISOString(), now, 4), null);
  assert.equal(quietFlag(null, at('2026-09-30T10:00:00'), 4), null, 'only 2h of the workday gone');
  assert.equal(quietFlag(null, at('2026-09-30T19:00:00'), 4), null, 'after hours');
  assert.equal(quietFlag(null, at('2026-09-30T10:00:00'), 2), 'No activity today');
});

test('feed time labels', () => {
  const now = at('2026-09-30T15:00:00');
  assert.equal(feedTime(new Date(at('2026-09-30T14:14:00')).toISOString(), now), '2:14pm today');
  assert.equal(feedTime(new Date(at('2026-09-29T09:03:00')).toISOString(), now), '9:03am yesterday');
  assert.equal(feedTime(new Date(at('2026-09-28T16:40:00')).toISOString(), now), 'Sep 28, 4:40pm');
  assert.equal(feedTime(new Date(at('2026-09-30T00:05:00')).toISOString(), now), '12:05am today');
});

test('summary counts, quality, follow-ups, first touch', () => {
  const periodActs = [
    act({ type: 'Call', outcome: 'No Answer', notes: '' }),
    act({ type: 'Call', outcome: '', notes: 'n' }),
    act({ type: 'Email', outcome: 'Sent', notes: 'n', follow_up_date: '2026-10-05' }),
    act({ type: 'Demo', outcome: 'Demo booked', notes: 'n', follow_up_date: '2026-10-02' }),
  ];
  const owned = [
    { id: 'p1', rep_id: 'r', status: 'Attempted', follow_up_date: '2026-09-28' }, // overdue: last act 9-27
    { id: 'p2', rep_id: 'r', status: 'Not Contacted', follow_up_date: null },      // untouched
    { id: 'p3', rep_id: 'r', status: 'Contacted', follow_up_date: '2026-09-28' },  // acted on 9-29: not overdue
    { id: 'p4', rep_id: 'r', status: 'Closed Lost', follow_up_date: '2026-09-01' }, // closed: never overdue
    { id: 'p5', rep_id: 'r', status: 'Not Contacted', follow_up_date: '2026-10-30' }, // future
  ];
  const allActsOnOwned = [
    act({ prospect_id: 'p1', created_at: '2026-09-27T18:00:00Z' }),
    act({ prospect_id: 'p3', created_at: '2026-09-29T18:00:00Z' }),
  ];
  const allocationsInPeriod = [
    { prospect_id: 'a1', to_rep_id: 'r', moved_at: '2026-09-30T14:00:00Z' },
    { prospect_id: 'a2', to_rep_id: 'r', moved_at: '2026-09-30T14:00:00Z' },
  ];
  const repActsOnAllocated = [
    act({ prospect_id: 'a1', created_at: '2026-09-30T16:00:00Z' }),
    act({ prospect_id: 'a1', created_at: '2026-09-30T18:00:00Z' }),
    act({ prospect_id: 'a2', created_at: '2026-09-30T10:00:00Z' }), // before allocation: ignored
  ];
  const s = summarizeRep({ periodActs, owned, allActsOnOwned, allocationsInPeriod, repActsOnAllocated, todayStr: '2026-09-30' });
  assert.equal(s.activities, 4);
  assert.deepEqual([s.calls, s.emails, s.otherTypes], [2, 1, 1]);
  assert.deepEqual([s.noOutcome, s.noNotes], [1, 1]);
  assert.equal(s.followUpsScheduled, 1, 'Demo dates are not follow-ups');
  assert.equal(s.followUpsOverdue, 1);
  assert.deepEqual([s.touched, s.untouched], [2, 2]);
  assert.deepEqual(s.firstTouch, { allocations: 2, touched: 1, avgHours: 2 });
});

test('fmtHours', () => {
  assert.equal(fmtHours(null), '—');
  assert.equal(fmtHours(0.25), '15m');
  assert.equal(fmtHours(2), '2h');
  assert.equal(fmtHours(72), '3d');
});
