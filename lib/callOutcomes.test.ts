// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OUTCOMES, defaultFollowUpDate, withCallOutcome, prospectUpdateForActivity } from './callOutcomes';

// 2026-10-05 20:00 Regina = 2026-10-06 02:00 UTC: "2 days out" counts from the Regina date.
const now = new Date('2026-10-06T02:00:00Z');
const blank = { type: 'Call', outcome: '', notes: '', follow_up_date: '' };

test('outcome order', () => {
  assert.deepEqual(CALL_OUTCOMES, ['No Answer', 'Voicemail', 'Spoke with Reception', 'Referred', 'Send Info', 'Callback', 'Booked', 'Not Interested', 'Wrong Number']);
});

test('follow-up defaults to 2 days out for the four follow-up outcomes only', () => {
  for (const o of ['Spoke with Reception', 'Referred', 'Send Info', 'Callback']) assert.equal(defaultFollowUpDate(o, now), '2026-10-07');
  for (const o of ['No Answer', 'Voicemail', 'Booked', 'Not Interested', 'Wrong Number']) assert.equal(defaultFollowUpDate(o, now), '');
});

test('withCallOutcome fills, swaps and clears its own default, never a typed date', () => {
  const a = withCallOutcome(blank, 'Referred', now);
  assert.equal(a.follow_up_date, '2026-10-07');
  assert.equal(withCallOutcome(a, 'Send Info', now).follow_up_date, '2026-10-07');
  assert.equal(withCallOutcome(a, 'No Answer', now).follow_up_date, '');
  const typed = { ...a, follow_up_date: '2026-10-20' };
  assert.equal(withCallOutcome(typed, 'Callback', now).follow_up_date, '2026-10-20');
  assert.equal(withCallOutcome(typed, 'Voicemail', now).follow_up_date, '2026-10-20');
  assert.equal(withCallOutcome({ ...blank, follow_up_date: '2026-10-20' }, 'No Answer', now).follow_up_date, '2026-10-20');
});

test('prospect update: existing outcomes unchanged, Wrong Number flags bad_number and clears follow-up', () => {
  const t = '2026-10-06T02:00:00.000Z';
  assert.deepEqual(prospectUpdateForActivity('Call', 'No Answer', null, t), { last_contacted_at: t });
  assert.deepEqual(prospectUpdateForActivity('Call', 'Booked', '2026-10-09', t), { last_contacted_at: t, follow_up_date: '2026-10-09' });
  assert.deepEqual(prospectUpdateForActivity('Call', 'Wrong Number', null, t), { last_contacted_at: t, bad_number: true, follow_up_date: null });
  assert.deepEqual(prospectUpdateForActivity('Email', 'Wrong Number', null, t), { last_contacted_at: t });
});
