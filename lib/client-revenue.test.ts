// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientMonthlyRevenue } from './client-revenue';
import { getMonthlyRevenueContribution } from './legacyRevenue';

const at = '2026-09-01T00:00:00Z';

test('current plans use current prices', () => {
  assert.equal(clientMonthlyRevenue({ plan: 'Launch', tier: 'launch', created_at: at }), 697);
  assert.equal(clientMonthlyRevenue({ plan: 'Grow', tier: 'grow', created_at: at }), 1348);
  assert.equal(clientMonthlyRevenue({ plan: 'Starter', tier: 'starter', created_at: at }), 2247);
  assert.equal(clientMonthlyRevenue({ plan: null, tier: 'pro', created_at: at }, { saleSlug: 'grow' }), 1348);   // a recorded sale decides it
});

test('no plan and no sale: 0, never a legacy price', () => {
  assert.equal(clientMonthlyRevenue({ plan: null, tier: 'pro', created_at: at }), 0);
  assert.equal(clientMonthlyRevenue({ plan: null, tier: null, created_at: at }), 0);
});

test('Northfield (legacy plan) is unchanged: same figure as the legacy table', () => {
  const northfield = { plan: 'Starter 3-Month', tier: 'starter', payment_type: null, created_at: '2026-07-03T18:00:00Z' };
  for (const termStart of [null, '2026-07-03', '2026-09-20']) {
    assert.equal(clientMonthlyRevenue(northfield, { termStart }), getMonthlyRevenueContribution(northfield, termStart));
  }
});
