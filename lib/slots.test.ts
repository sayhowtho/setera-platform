// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeSlotMins, sortSlots, newSlotsOnly, reginaToday, generationDates, slotState, planRangeBlock, canManageDemo, reginaSlotStartMs, movedEventTimes } from './slots';

const owner = 'owner-1';
const slot = (date: string, time_slot: string, is_booked = false) => ({ date, time_slot, is_booked, owned_by: owner });

test('times parse to real clock order', () => {
  assert.equal(timeSlotMins('10:00 AM'), 600);
  assert.equal(timeSlotMins('1:00 PM'), 780);
  assert.equal(timeSlotMins('12:00 PM'), 720);
  assert.equal(timeSlotMins('12:30 AM'), 30);
  assert.equal(timeSlotMins(' 9:00 am '), 540);
  assert.equal(timeSlotMins('nonsense'), Number.MAX_SAFE_INTEGER);
});

test('slots sort by date, then actual time (1:00 PM after 10:00 AM)', () => {
  const s = sortSlots([slot('2026-10-04', '1:00 PM'), slot('2026-10-04', '10:00 AM'), slot('2026-10-03', '2:00 PM'), slot('2026-10-04', '12:00 PM'), slot('2026-10-04', '11:00 AM')]);
  assert.deepEqual(s.map(x => x.date + ' ' + x.time_slot), ['2026-10-03 2:00 PM', '2026-10-04 10:00 AM', '2026-10-04 11:00 AM', '2026-10-04 12:00 PM', '2026-10-04 1:00 PM']);
});

test('booked slot, clear day, regenerate: the booked time is skipped (the Oct 4 bug)', () => {
  const existingAfterClear = [slot('2026-10-04', '10:00 AM', true)];   // Clear day keeps the booked slot
  const generated = ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM'].map(t => slot('2026-10-04', t));
  const toInsert = newSlotsOnly(generated, existingAfterClear);
  assert.deepEqual(toInsert.map(x => x.time_slot), ['11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM']);
});

test('open slots are skipped too, and a regenerate with nothing new inserts nothing', () => {
  const existing = ['10:00 AM', '11:00 AM'].map(t => slot('2026-10-05', t));
  assert.deepEqual(newSlotsOnly([slot('2026-10-05', '10:00 AM'), slot('2026-10-05', '12:00 PM')], existing).map(x => x.time_slot), ['12:00 PM']);
  assert.deepEqual(newSlotsOnly(existing.map(e => ({ ...e })), existing), []);
});

test('same time on another day or for another owner is not a duplicate; spacing/case differences are', () => {
  const existing = [slot('2026-10-05', '10:00 AM')];
  assert.equal(newSlotsOnly([slot('2026-10-06', '10:00 AM')], existing).length, 1);
  assert.equal(newSlotsOnly([{ ...slot('2026-10-05', '10:00 AM'), owned_by: 'owner-2' }], existing).length, 1);
  assert.equal(newSlotsOnly([slot('2026-10-05', ' 10:00 am')], existing).length, 0);
  assert.equal(newSlotsOnly([slot('2026-10-07', '9:00 AM'), slot('2026-10-07', '9:00 AM')], []).length, 1);   // no dupes within one batch
});

test('Generate starts from the Regina date, also after 6 pm (when UTC is already tomorrow)', () => {
  const evening = new Date('2026-10-02T19:30:00-06:00');            // = 2026-10-03T01:30Z
  assert.equal(evening.toISOString().slice(0, 10), '2026-10-03');    // what the old code used
  assert.equal(reginaToday(evening), '2026-10-02');
  assert.deepEqual(generationDates(5, evening), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
  assert.deepEqual(generationDates(3, new Date('2026-10-02T08:00:00-06:00')), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(reginaToday(new Date('2026-10-02T23:59:00-06:00')), '2026-10-02');
  assert.equal(reginaToday(new Date('2026-10-03T00:00:00-06:00')), '2026-10-03');
  assert.deepEqual(generationDates(3, new Date('2026-10-31T20:00:00-06:00')), ['2026-10-31', '2026-11-01', '2026-11-02']);   // month rollover
});

// Blocked slots (migrations/031)
const cs = (id: string, date: string, time_slot: string, is_booked = false, is_blocked = false) => ({ id, date, time_slot, is_booked, is_blocked, owned_by: owner });

test('slot state: blocked wins over booked, open is neither', () => {
  assert.equal(slotState({ is_booked: false }), 'open');
  assert.equal(slotState({ is_booked: false, is_blocked: null }), 'open');
  assert.equal(slotState({ is_booked: true }), 'booked');
  assert.equal(slotState({ is_booked: true, is_blocked: false }), 'booked');
  assert.equal(slotState({ is_booked: true, is_blocked: true }), 'blocked');
});

test('range block covers clock order, either direction, and skips booked/blocked', () => {
  const slots = [
    cs('e', '2026-10-04', '2:00 PM'),
    cs('a', '2026-10-04', '10:00 AM'),
    cs('c', '2026-10-04', '12:00 PM', true),        // KM Construction demo
    cs('b', '2026-10-04', '11:00 AM'),
    cs('d', '2026-10-04', '1:00 PM', true, true),   // already blocked
    cs('f', '2026-10-05', '10:00 AM'),
  ];
  const fwd = planRangeBlock(slots, 'a', 'e');
  assert.deepEqual(fwd.range.map(s => s.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(fwd.toBlock.map(s => s.id), ['a', 'b', 'e']);
  assert.deepEqual(fwd.skippedBooked.map(s => s.id), ['c']);
  assert.deepEqual(fwd.alreadyBlocked.map(s => s.id), ['d']);
  const back = planRangeBlock(slots, 'f', 'e');   // clicked later slot first, crosses days
  assert.deepEqual(back.range.map(s => s.id), ['e', 'f']);
  assert.deepEqual(planRangeBlock(slots, 'a', 'nope').range, []);
});

test('who can cancel a demo: admins any, setters/reps only their own', () => {
  const appt = { setter_id: 'setter-1', assigned_to: 'rep-1' };
  assert.equal(canManageDemo({ id: 'alex', role: 'owner' }, appt), true);
  assert.equal(canManageDemo({ id: 'someone', role: 'admin' }, appt), true);
  assert.equal(canManageDemo({ id: 'setter-1', role: 'setter' }, appt), true);   // booked it
  assert.equal(canManageDemo({ id: 'rep-1', role: 'rep' }, appt), true);         // assigned to it
  assert.equal(canManageDemo({ id: 'setter-2', role: 'setter' }, appt), false);
  assert.equal(canManageDemo({ id: 'rep-2', role: 'vp_sales' }, appt), false);
  assert.equal(canManageDemo({ id: '', role: 'setter' }, { setter_id: null, assigned_to: null }), false);
});

test('reschedule times: Regina wall clock, event length kept', () => {
  assert.equal(reginaSlotStartMs('2026-10-04', '1:30 PM'), Date.parse('2026-10-04T19:30:00Z'));
  assert.equal(reginaSlotStartMs('2026-10-04', '12:00 AM'), Date.parse('2026-10-04T06:00:00Z'));
  assert.equal(reginaSlotStartMs('2026-10-04', 'soon'), null);
  assert.equal(reginaSlotStartMs('Oct 4', '1:30 PM'), null);
  // 60-min event at 10:00 AM moved to 2:00 PM
  assert.deepEqual(movedEventTimes('2026-10-05', '2:00 PM', '2026-10-04T10:00:00-06:00', '2026-10-04T11:00:00-06:00'),
    { start: '2026-10-05T14:00:00-06:00', end: '2026-10-05T15:00:00-06:00' });
  // a 90-min event keeps 90 min, even across midnight
  assert.deepEqual(movedEventTimes('2026-10-05', '11:00 PM', '2026-10-04T10:00:00-06:00', '2026-10-04T11:30:00-06:00'),
    { start: '2026-10-05T23:00:00-06:00', end: '2026-10-06T00:30:00-06:00' });
  // Google may return UTC; unknown length falls back to 60 min
  assert.deepEqual(movedEventTimes('2026-10-05', '9:00 AM', '2026-10-04T16:00:00Z', '2026-10-04T16:45:00Z'),
    { start: '2026-10-05T09:00:00-06:00', end: '2026-10-05T09:45:00-06:00' });
  assert.deepEqual(movedEventTimes('2026-10-05', '9:00 AM'), { start: '2026-10-05T09:00:00-06:00', end: '2026-10-05T10:00:00-06:00' });
  assert.equal(movedEventTimes('2026-10-05', 'bad'), null);
});
