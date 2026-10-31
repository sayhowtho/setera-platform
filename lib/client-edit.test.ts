// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedFields } from './client-edit';
import { planForDropdown } from './client-tier';

// Northfield-style row: legacy plan, several nulls, as the Signups form opens it
// (same defaults as openClientDetail in app/admin/page.tsx).
const northfield = { business_name: 'Northfield Roofing', owner_name: 'Sam Example', phone: '306-555-0100', email: null, city: 'Regina', province: 'SK', website: null,
  calls_per_day: null, current_phone_system: null, secondary_contact: null, plan: 'Starter 3-Month', how_they_heard: null, referred_by: null, best_time_to_reach: null,
  contract_signed: null, payment_collected: true, notes: null, status: 'Active' };
const openForm = (c: typeof northfield) => ({ business_name: c.business_name || '', owner_name: c.owner_name || '', phone: c.phone || '', email: c.email || '', city: c.city || '',
  province: c.province || '', website: c.website || '', calls_per_day: c.calls_per_day || '', current_phone_system: c.current_phone_system || '',
  secondary_contact: c.secondary_contact || '', plan: planForDropdown(c.plan), how_they_heard: c.how_they_heard || '', referred_by: c.referred_by || '',
  best_time_to_reach: c.best_time_to_reach || '', contract_signed: c.contract_signed || false, payment_collected: c.payment_collected || false, notes: c.notes || '',
  status: c.status || 'Onboarding' });

test('Northfield-style client: saving without edits writes nothing (nulls stay null, plan untouched)', () => {
  const f = openForm(northfield);
  assert.deepEqual(changedFields(f, { ...f }), {});
});

test('one edit writes only that field', () => {
  const f = openForm(northfield);
  assert.deepEqual(changedFields(f, { ...f, website: 'northfield.ca' }), { website: 'northfield.ca' });
  assert.deepEqual(changedFields(f, { ...f, contract_signed: true }), { contract_signed: true });
});

test('a field cleared is saved as null', () => {
  const f = openForm(northfield);
  assert.deepEqual(changedFields(f, { ...f, city: '' }), { city: null });
  assert.deepEqual(changedFields(f, { ...f, province: '' }), { province: null });
});

test('plan: only a chosen current plan is written; a legacy plan is never blanked', () => {
  const f = openForm(northfield);
  assert.equal(f.plan, '');                                       // legacy shows unset
  assert.deepEqual(changedFields(f, { ...f, plan: 'Grow' }), { plan: 'Grow' });
  const g = { ...f, plan: 'Grow' };
  assert.deepEqual(changedFields(g, { ...g, plan: '' }), {});     // unsetting never writes
});
