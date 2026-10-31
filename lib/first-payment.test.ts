// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstPaymentCommission, fmtCommission } from './first-payment';

test('current plans: 15% of the current price, one test per plan', () => {
  assert.deepEqual(firstPaymentCommission({ tier: 'starter', plan: 'Starter Monthly' }, 'launch'), { amount: 104.55, basis: 'current', planLabel: 'Launch' });
  assert.deepEqual(firstPaymentCommission({ tier: 'starter', plan: 'Starter Monthly' }, 'grow'), { amount: 202.2, basis: 'current', planLabel: 'Grow' });
  assert.deepEqual(firstPaymentCommission({ tier: 'starter', plan: 'Starter Monthly' }, 'starter_v2'), { amount: 337.05, basis: 'current', planLabel: 'Starter' });
  // the first recorded sale decides it, whatever the client row says
  assert.equal(firstPaymentCommission({ tier: 'pro', plan: 'Pro Annual' }, 'grow').amount, 202.2);
  // no sale visible: plan text naming Launch / Grow (current-only names)
  assert.equal(firstPaymentCommission({ plan: 'Launch' }).amount, 104.55);
  assert.equal(firstPaymentCommission({ tier: 'starter', plan: 'Grow Monthly' }).amount, 202.2);
});

test('Move to Signups rows (lib/client-tier.ts) use current prices before any sale', () => {
  assert.deepEqual(firstPaymentCommission({ tier: 'grow', plan: 'Grow' }), { amount: 202.2, basis: 'current', planLabel: 'Grow' });
  assert.deepEqual(firstPaymentCommission({ tier: 'starter', plan: 'Starter' }), { amount: 337.05, basis: 'current', planLabel: 'Starter' });
  assert.deepEqual(firstPaymentCommission({ tier: 'launch', plan: 'Launch' }), { amount: 104.55, basis: 'current', planLabel: 'Launch' });
  assert.deepEqual(firstPaymentCommission({ tier: 'pro', plan: null }), { amount: 0, basis: 'unknown', planLabel: 'Plan not set' }); // legacy tier, new conversion
  assert.equal(firstPaymentCommission({ tier: 'pro', plan: null }, 'starter_v2').amount, 337.05);              // until a sale is recorded
  assert.deepEqual(firstPaymentCommission({ tier: null, plan: null }), { amount: 0, basis: 'unknown', planLabel: 'Plan not set' });
  assert.equal(firstPaymentCommission({ tier: null, plan: null }, 'grow').amount, 202.2);                      // a sale decides it
});

test('legacy fallbacks: a legacy sale slug, or a legacy plan with a term, use the old table', () => {
  assert.equal(firstPaymentCommission({ tier: 'starter', plan: 'Starter Monthly' }, 'starter').basis, 'legacy');
  assert.equal(firstPaymentCommission({ tier: 'starter', plan: 'Starter Monthly' }).amount, 375);
  assert.equal(firstPaymentCommission({ tier: 'starter' }).basis, 'unknown');                                 // tier only, no plan: not priced
});

test('legacy plans keep the old table', () => {
  assert.deepEqual(firstPaymentCommission({ plan: 'Starter Monthly' }), { amount: 375, basis: 'legacy', planLabel: 'Starter (legacy)' });
  assert.equal(firstPaymentCommission({ tier: 'starter', plan: 'Starter 3-Month' }).amount, 900);   // prod's one client
  assert.equal(firstPaymentCommission({ tier: 'pro', payment_type: 'annual_full', plan: 'Pro Annual' }).amount, 8190);
  assert.equal(firstPaymentCommission({ plan: 'Regional 6-Month' }).amount, 5040);
});

test('formatting shows cents only when needed', () => {
  assert.equal(fmtCommission(104.55), '$104.55');
  assert.equal(fmtCommission(202.2), '$202.20');
  assert.equal(fmtCommission(8565), '$8,565');
});
