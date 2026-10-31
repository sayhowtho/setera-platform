// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue, FOLLOWUP_EXCLUDED_IN, followUpSlices, followUpState, tallyFollowUpsByOwner } from './followups';

test('overdue is strictly before today', () => {
  assert.equal(isOverdue('2026-10-05', '2026-10-06'), true);
  assert.equal(isOverdue('2026-10-06', '2026-10-06'), false);
  assert.equal(isOverdue('2025-12-31', '2026-01-01'), true);
});

test('excluded statuses as a PostgREST in-list', () => {
  assert.equal(FOLLOWUP_EXCLUDED_IN, '("Closed Won","Closed Lost")');
});

test('followUpSlices: today rows first, then overdue, across page boundaries', () => {
  assert.deepEqual(followUpSlices(0, 49, 3), [{ segment: 'today', from: 0, to: 2 }, { segment: 'overdue', from: 0, to: 46 }]);
  assert.deepEqual(followUpSlices(50, 99, 3), [{ segment: 'overdue', from: 47, to: 96 }]);
  assert.deepEqual(followUpSlices(0, 49, 0), [{ segment: 'overdue', from: 0, to: 49 }]);
  assert.deepEqual(followUpSlices(0, 49, 120), [{ segment: 'today', from: 0, to: 49 }]);
  assert.deepEqual(followUpSlices(100, 149, 120), [{ segment: 'today', from: 100, to: 119 }, { segment: 'overdue', from: 0, to: 29 }]);
});

test('followUpState: overdue / today only while it is still a callback due', () => {
  const p = (follow_up_date: string | null, status = 'Contacted', do_not_contact = false) => ({ follow_up_date, status, do_not_contact });
  assert.equal(followUpState(p('2026-10-03'), '2026-10-07'), 'overdue');
  assert.equal(followUpState(p('2026-10-07'), '2026-10-07'), 'today');
  assert.equal(followUpState(p('2026-10-08'), '2026-10-07'), null);
  assert.equal(followUpState(p(null), '2026-10-07'), null);
  assert.equal(followUpState(p('2026-10-03', 'Closed Won'), '2026-10-07'), null);
  assert.equal(followUpState(p('2026-10-03', 'Closed Lost'), '2026-10-07'), null);
  assert.equal(followUpState(p('2026-10-03', 'Contacted', true), '2026-10-07'), null);
});

test('tallyFollowUpsByOwner: today vs overdue per owner', () => {
  const rows = [
    { rep_id: 'a', follow_up_date: '2026-10-07' }, { rep_id: 'a', follow_up_date: '2026-10-01' }, { rep_id: 'a', follow_up_date: '2026-10-06' },
    { rep_id: 'b', follow_up_date: '2026-10-07' },
    { rep_id: 'b', follow_up_date: '2026-10-08' }, { rep_id: null, follow_up_date: '2026-10-01' }, { rep_id: 'c', follow_up_date: null },
  ];
  assert.deepEqual(tallyFollowUpsByOwner(rows, '2026-10-07'), { a: { today: 1, overdue: 2 }, b: { today: 1, overdue: 0 } });
});
