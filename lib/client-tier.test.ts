// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientTierAndPlan, clientFieldsFromProspect, planForDropdown, planUpdate, isLegacyPlan, CLIENT_TIERS } from './client-tier';

test('current tiers: lowercase tier, current plan name', () => {
  assert.deepEqual(clientTierAndPlan('Grow'), { tier: 'grow', plan: 'Grow' });
  assert.deepEqual(clientTierAndPlan('Starter'), { tier: 'starter', plan: 'Starter' });
  assert.deepEqual(clientTierAndPlan('Launch'), { tier: 'launch', plan: 'Launch' });
  assert.deepEqual(clientTierAndPlan(' grow '), { tier: 'grow', plan: 'Grow' });
});

test('legacy tiers: lowercase tier, no plan (never a legacy price for a new conversion)', () => {
  assert.deepEqual(clientTierAndPlan('Pro'), { tier: 'pro', plan: null });
  assert.deepEqual(clientTierAndPlan('Regional'), { tier: 'regional', plan: null });
  assert.deepEqual(clientTierAndPlan('enterprise'), { tier: 'enterprise', plan: null });
  assert.deepEqual(clientTierAndPlan('National'), { tier: 'national', plan: null });
});

test('blank or unknown tier: nothing invented', () => {
  assert.deepEqual(clientTierAndPlan(null), { tier: null, plan: null });
  assert.deepEqual(clientTierAndPlan(''), { tier: null, plan: null });
  assert.deepEqual(clientTierAndPlan('Gold'), { tier: null, plan: null });
});

test('province: the prospect\'s own, else inferred like the Bodhi import, never defaulted to SK', () => {
  assert.equal(clientFieldsFromProspect({ province: 'AB', city: 'Regina' }).province, 'AB');
  assert.equal(clientFieldsFromProspect({ province: '', city: 'Calgary' }).province, 'AB');
  assert.equal(clientFieldsFromProspect({ province: null, city: 'Victoria', phone: '(250) 555-0100' }).province, 'BC');
  assert.equal(clientFieldsFromProspect({ province: null, city: 'Springfield' }).province, null);
  assert.equal(clientFieldsFromProspect({ province: null, city: '' }).province, null);
});

test('no legacy tier ever produces a plan', () => {
  for (const t of CLIENT_TIERS) {
    const { plan } = clientTierAndPlan(t);
    assert.ok(plan === null || ['Launch', 'Grow', 'Starter'].includes(plan), t + ' -> ' + plan);
    if (['pro', 'regional', 'enterprise', 'national'].includes(t)) assert.equal(plan, null, t);
  }
});

test('plan dropdowns: only Launch / Grow / Starter; legacy or blank shows unset', () => {
  assert.equal(planForDropdown('Grow'), 'Grow');
  assert.equal(planForDropdown('starter'), 'Starter');
  assert.equal(planForDropdown('Starter 3-Month'), '');   // the Jul 3 legacy client
  assert.equal(planForDropdown('Pro Monthly'), '');
  assert.equal(planForDropdown(null), '');
});

test('plan saves: a chosen current plan is written; unset leaves the stored plan alone', () => {
  assert.deepEqual(planUpdate('Launch'), { plan: 'Launch' });
  assert.deepEqual(planUpdate(''), {});
  assert.deepEqual(planUpdate('Pro Monthly'), {});
});

test('legacy plan (Northfield): shown read-only, never written by a save', () => {
  assert.equal(isLegacyPlan('Starter 3-Month'), true);
  assert.equal(isLegacyPlan('Grow'), false);
  assert.equal(isLegacyPlan(''), false);
  assert.equal(isLegacyPlan(null), false);
  assert.deepEqual(planUpdate(planForDropdown('Starter 3-Month')), {});   // form opens unset -> save leaves it alone
});
