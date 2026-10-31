// Run: npm test   (pure compensation maths; record_sale is covered by scripts/test-compensation.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMilestoneProgress, computeSprintPeriods, addMonthsToDate, isPastTraining, type CreditedClient } from './compensation';

let n = 0;
const client = (planSlug: string, planPrice: number, firstSoldAt: string, extra: Partial<CreditedClient> = {}): CreditedClient =>
  ({ clientId: 'c' + (++n), planSlug, planPrice, firstSoldAt, salesCount: 1, cancelled: false, ...extra });
const S = 2247, G = 1348, L = 697;
const regina = (local: string) => new Date(Date.parse(local + '-06:00')).toISOString();

test('distinct clients: 9 clients with 10 sales = 9/6; a cancelled client still counts', () => {
  const clients = [...Array.from({ length: 8 }, () => client('starter_v2', S, regina('2026-09-25T10:00:00'))),
    client('grow', G, regina('2026-09-26T10:00:00'), { salesCount: 2 }),           // upgrade: still one client
    client('launch', L, regina('2026-09-27T10:00:00'), { cancelled: true })];     // paid month 1, cancelled since: still counts
  const m = computeMilestoneProgress(regina('2026-09-23T00:00:00'), clients, new Set(), new Date(regina('2026-09-30T00:00:00')));
  assert.equal(m.paidClientCount, 10);
  assert.equal(isPastTraining(m.paidClientCount, 6), true);
});

test('a cancellation never removes credit: same counts, MRR and tiers before and after', () => {
  const before = Array.from({ length: 40 }, (_, i) => client('starter_v2', S, regina(`2026-10-${String(1 + (i % 20)).padStart(2, '0')}T10:00:00`)));
  const after = before.map((c, i) => (i < 5 ? { ...c, cancelled: true } : c));   // 5 cancel later
  const start = regina('2026-09-23T00:00:00'), now = new Date(regina('2026-11-30T00:00:00'));
  const mb = computeMilestoneProgress(start, before, new Set(), now), ma = computeMilestoneProgress(start, after, new Set(), now);
  assert.equal(ma.paidClientCount, mb.paidClientCount);
  assert.equal(ma.windowMRR, 40 * S);
  assert.deepEqual(ma.thresholds.map(t => t.reached), [true, false, false]);      // 89,880 milestone still reached
  const pb = computeSprintPeriods(start, before, now), pa = computeSprintPeriods(start, after, now);
  assert.deepEqual(pa.map(p => [p.newMRR, p.tier?.amount ?? 0]), pb.map(p => [p.newMRR, p.tier?.amount ?? 0]));
  assert.ok(ma.notes.some(n => n.includes('5 client(s) cancelled since: still counted')));
});

test('calendar-day periods: same day each month, ending the day before', () => {
  const p = computeSprintPeriods(regina('2026-09-23T00:00:00'), [], new Date(regina('2026-12-01T12:00:00')));
  assert.deepEqual(p.map(x => [x.startDate, x.endDate]), [['2026-09-23', '2026-10-22'], ['2026-10-23', '2026-11-22'], ['2026-11-23', '2026-12-22']]);
  assert.deepEqual(p.map(x => x.closed), [true, true, false]);
  assert.equal(p[0].closesAt, regina('2026-10-23T00:00:00'));
  assert.equal(p[0].dueAt, regina('2026-10-30T00:00:00'));
  assert.equal(addMonthsToDate('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsToDate('2026-01-31', 2), '2026-03-31');
  // a start time late in the day still means that calendar day (Regina)
  assert.equal(computeSprintPeriods('2026-09-24T14:48:32Z', [], new Date('2026-09-30T00:00:00Z'))[0].startDate, '2026-09-24');
});

test('sprint pays each period, highest tier only, no client-count gate, new MRR only', () => {
  const clients = [
    // period 1 (Sep 23–Oct 22): 2 Starter + 1 Grow = 5,842 -> $1,000 tier (only 3 clients: no gate)
    client('starter_v2', S, regina('2026-09-24T10:00:00')), client('starter_v2', S, regina('2026-10-01T10:00:00')), client('grow', G, regina('2026-10-22T23:59:00')),
    // period 2 (Oct 23–Nov 22): 6 Starter (+1 cancelled below) = 15,729 -> $4,000 only (not 1,000+2,000+4,000)
    ...Array.from({ length: 6 }, (_, i) => client('starter_v2', S, regina(`2026-11-0${i + 1}T10:00:00`))),
    // period 2: an upgrade on an old client doesn't add new MRR (it's one row, first sale in period 1)
    client('launch', L, regina('2026-09-30T10:00:00'), { salesCount: 2 }),
    // period 2: a client who paid and later cancelled still counts
    client('starter_v2', S, regina('2026-11-10T10:00:00'), { cancelled: true }),
    // period 3 (open): never awarded until it closes
    ...Array.from({ length: 6 }, () => client('starter_v2', S, regina('2026-11-25T10:00:00'))),
  ];
  const p = computeSprintPeriods(regina('2026-09-23T00:00:00'), clients, new Date(regina('2026-11-30T12:00:00')));
  assert.equal(p[0].newMRR, 2 * S + G + L);
  assert.equal(p[0].tier?.amount, 1_000);
  assert.equal(p[1].newMRR, 7 * S);
  assert.equal(p[1].tier?.amount, 4_000);
  assert.equal(p[2].closed, false);
  assert.equal(p.filter(x => x.closed && x.tier).length, 2, 'two closed periods each pay');
});

test('milestone window = start date -> same date +12 months; initial plan per client, cancelled included', () => {
  const clients = [
    ...Array.from({ length: 6 }, (_, i) => client('starter_v2', S, regina(`2026-02-0${i + 1}T10:00:00`))),
    client('grow', G, regina('2026-05-01T10:00:00'), { salesCount: 2 }),
    client('launch', L, regina('2027-01-15T00:00:00')),      // last day of window: counted
    client('launch', L, regina('2027-01-16T00:00:00')),      // first day after: not counted
    client('starter_v2', S, regina('2026-06-01T10:00:00'), { cancelled: true }),   // cancelled since: still counted
  ];
  const m = computeMilestoneProgress(regina('2026-01-16T09:00:00'), clients, new Set(), new Date(regina('2026-09-01T00:00:00')));
  assert.equal(m.windowStart, regina('2026-01-16T00:00:00'));
  assert.equal(m.windowEnd, regina('2027-01-16T00:00:00'));
  assert.equal(m.windowMRR, 7 * S + G + L);
  assert.equal(m.paidClientCount, 10);
  assert.equal(m.notes.length, 3);
  assert.equal(m.next?.threshold, 89_880);
});

test('milestone thresholds at 40 / 80 / 120 Starter clients', () => {
  const clients = Array.from({ length: 80 }, () => client('starter_v2', S, regina('2026-03-01T10:00:00')));
  const m = computeMilestoneProgress(regina('2026-01-01T00:00:00'), clients, new Set(['mrr_milestone_1']));
  assert.deepEqual(m.thresholds.map(t => t.reached), [true, true, false]);
  assert.deepEqual(m.thresholds.map(t => t.awarded), [true, false, false]);
});
