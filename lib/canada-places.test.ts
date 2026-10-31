// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProvince, inferProvince, resolveProvince } from './canada-places';

test('province codes and names normalize', () => {
  assert.equal(normalizeProvince(' ab '), 'AB');
  assert.equal(normalizeProvince('Alberta'), 'AB');
  assert.equal(normalizeProvince('B.C.'), 'BC');
  assert.equal(normalizeProvince('Québec'), 'QC');
  assert.equal(normalizeProvince(''), null);
  assert.equal(normalizeProvince('XX'), null);
  assert.equal(normalizeProvince('Calgary'), null);
});

test('unambiguous cities infer their province (case/space-insensitive)', () => {
  assert.equal(inferProvince('Calgary'), 'AB');
  assert.equal(inferProvince(' edmonton '), 'AB');
  assert.equal(inferProvince('Winnipeg'), 'MB');
  assert.equal(inferProvince('Kamloops'), 'BC');
  assert.equal(inferProvince('Steinbach'), 'MB');
  assert.equal(inferProvince('regina'), 'SK');
});

test('city fields that hold a region or a province', () => {
  assert.equal(inferProvince('BC'), 'BC');
  assert.equal(inferProvince('prince edward island '), 'PE');
  assert.equal(inferProvince('sudbury ontario'), 'ON');
  assert.equal(inferProvince('Sherwood Park / Edmonton'), 'AB');
  assert.equal(inferProvince('Metro Vancouver / Fraser Valley'), 'BC');
  assert.equal(inferProvince('Calgary / Toronto'), null); // two provinces
});

test('ambiguous names need a confirming area code', () => {
  assert.equal(inferProvince('Victoria'), null);
  assert.equal(inferProvince('Victoria', ['(250) 555-0100']), 'BC');
  assert.equal(inferProvince('London', ['519-555-0100']), 'ON');
  assert.equal(inferProvince('Windsor', ['902-555-0100']), null); // NS number, ON city list
});

test('a conflicting area code blocks the guess; toll-free is ignored', () => {
  assert.equal(inferProvince('Calgary', ['519-555-0144']), null);
  assert.equal(inferProvince('Calgary', ['1-800-555-0100']), 'AB');
  assert.equal(inferProvince('Calgary', ['403-555-0100', '416-555-0100']), 'AB'); // one agrees
});

test('never guessed: border cities, unknown places, blanks', () => {
  assert.equal(inferProvince('Lloydminster', ['306-555-0100']), null);
  assert.equal(inferProvince('Springfield'), null);
  assert.equal(inferProvince(''), null);
  assert.equal(inferProvince(null), null);
});

test('resolveProvince: given wins, else inferred, else none', () => {
  assert.deepEqual(resolveProvince('ON', 'Calgary'), { province: 'ON', source: 'given' });
  assert.deepEqual(resolveProvince('', 'Calgary'), { province: 'AB', source: 'inferred' });
  assert.deepEqual(resolveProvince('Nowhere', 'Calgary'), { province: 'AB', source: 'inferred' });
  assert.deepEqual(resolveProvince(undefined, 'Springfield'), { province: null, source: 'none' });
});
