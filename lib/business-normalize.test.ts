// Run: npm test   (node --test, native TypeScript stripping — no deps)
// The same fixtures are asserted against the SQL twins in migrations/018 §1b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusinessPhone, parseBusinessPhone, normalizeBusinessName } from './business-normalize';

test('all common CA/US formats normalize to the same E.164 value', () => {
  for (const raw of ['(403) 555-0123', '403-555-0123', '403.555.0123', '+14035550123', '1 403 555 0123', '4035550123', '+1 (403) 555-0123']) {
    assert.equal(normalizeBusinessPhone(raw), '+14035550123', raw);
  }
});

test('extensions are stripped before normalizing', () => {
  for (const raw of ['403-555-0123 ext 12', '403-555-0123 ext. 12', '403-555-0123 EXT12', '(403) 555-0123 x12', '4035550123x12', '403 555 0123 #4', '403-555-0123, extension 204']) {
    assert.equal(normalizeBusinessPhone(raw), '+14035550123', raw);
  }
});

test('blank input is empty, not invalid', () => {
  for (const raw of ['', '   ', null, undefined]) {
    assert.deepEqual(parseBusinessPhone(raw), { status: 'empty', e164: null });
  }
});

test('garbage and wrong-length numbers are invalid, never saved as junk', () => {
  for (const raw of ['abc', 'call me', '630-6311', '2 403 555 0123', '403555012399', '---', '+44 20 7946 0958']) {
    assert.deepEqual(parseBusinessPhone(raw), { status: 'invalid', e164: null }, raw);
  }
});

test('name variations collapse to one normalized form', () => {
  assert.equal(normalizeBusinessName('M.A.D. Renovations'), 'mad reno');
  assert.equal(normalizeBusinessName('MAD Renos'), 'mad reno');
  assert.equal(normalizeBusinessName('MAD Renovations'), 'mad reno');
  assert.equal(normalizeBusinessName('Smith Roofing & Renos Ltd.'), 'smith roofing reno');
  assert.equal(normalizeBusinessName('Smith Roofing and Renovations Inc'), 'smith roofing reno');
  assert.equal(normalizeBusinessName('The Atlas Roofing Co.'), 'atlas roofing');
  assert.equal(normalizeBusinessName("Bob's Plumbing, LLC"), 'bobs plumbing');
});

test('names that are empty after normalizing return null', () => {
  assert.equal(normalizeBusinessName(''), null);
  assert.equal(normalizeBusinessName('Inc.'), null);
  assert.equal(normalizeBusinessName(null), null);
});

test('different trades stay different', () => {
  assert.notEqual(normalizeBusinessName('ABC Plumbing'), normalizeBusinessName('ABC Electrical'));
});
