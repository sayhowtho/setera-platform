// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPatterns, prospectFilterSpec, filterOptionArgs, tradeOptionArgs, dropdownOptions, filtersKey, NO_PROVINCE, type ProspectFilters } from './prospect-search';

const all: ProspectFilters = { search: '', status: 'All', rep: 'All', province: 'All', city: 'All' };

test('blank search matches everything', () => {
  assert.deepEqual(searchPatterns('   '), { text: null, phone: null });
  assert.deepEqual(prospectFilterSpec(all), { eq: [], like: null, or: null, dueBy: null, dueMode: null });
});

test('text search is lower-cased and wildcard-safe', () => {
  assert.deepEqual(searchPatterns(' Smith Roofing '), { text: '%smith roofing%', phone: null });
  assert.equal(searchPatterns('50% "Best" a*b\\c').text, '%50_ _best_ a_b_c%');
  assert.equal(searchPatterns("Bob's Plumbing, Ltd. (Regina)").phone, null);
});

test('phone-shaped search is format-insensitive', () => {
  for (const q of ['306', '(306)', '306-209-5555', '(306) 209-5555', '306.209.5555', '+1 306 209 5555', '13062095555', '+13062095555'])
    assert.equal(searchPatterns(q).phone?.replace(/%/g, '').slice(0, 3), '306', q);
  assert.equal(searchPatterns('+1 306 209 5555').phone, '%3062095555%');
  assert.equal(searchPatterns('306-209').phone, '%306209%');
  assert.equal(searchPatterns('+1').phone, null);
});

test('phone search ORs text and digits; other filters are eq', () => {
  assert.deepEqual(prospectFilterSpec({ search: '306', status: 'Attempted', rep: 'r1', province: NO_PROVINCE, city: 'regina' }), {
    eq: [['status', 'Attempted'], ['rep_id', 'r1'], ['province_key', ''], ['city_key', 'regina']],
    like: null,
    or: 'search_text.like."%306%",phone_digits.like."%306%"',
    dueBy: null,
    dueMode: null,
  });
  assert.deepEqual(prospectFilterSpec({ ...all, search: 'acme', province: 'sk' }), { eq: [['province_key', 'sk']], like: '%acme%', or: null, dueBy: null, dueMode: null });
});

test('callbacks due: cutoff date in the spec and the cache key', () => {
  assert.equal(prospectFilterSpec({ ...all, rep: 'r1', due: '2026-10-07' }).dueBy, '2026-10-07');
  assert.deepEqual(prospectFilterSpec({ ...all, rep: 'r1', due: '2026-10-07' }).eq, [['rep_id', 'r1']]);
  assert.notEqual(filtersKey({ ...all, due: '2026-10-07' }), filtersKey(all));
  assert.notEqual(filtersKey({ ...all, due: '2026-10-07' }), filtersKey({ ...all, due: '2026-10-08' }));
  assert.equal(filtersKey({ ...all, due: '' }), filtersKey(all));
});

test('callbacks due: today / overdue modes', () => {
  assert.equal(prospectFilterSpec({ ...all, due: '2026-10-07', dueMode: 'today' }).dueMode, 'today');
  assert.equal(prospectFilterSpec({ ...all, due: '2026-10-07', dueMode: 'overdue' }).dueMode, 'overdue');
  assert.equal(prospectFilterSpec({ ...all, due: '2026-10-07' }).dueMode, null);
  assert.equal(prospectFilterSpec({ ...all, dueMode: 'today' }).dueMode, null); // no date, no filter
  const k = (dueMode?: 'today' | 'overdue') => filtersKey({ ...all, due: '2026-10-07', dueMode });
  assert.equal(new Set([k(), k('today'), k('overdue')]).size, 3);
  assert.equal(filtersKey({ ...all, dueMode: 'today' }), filtersKey(all));
});

test('option args', () => {
  assert.deepEqual(filterOptionArgs(all), { p_text_like: null, p_phone_like: null, p_status: null, p_rep: null, p_province_key: null });
  assert.equal(filterOptionArgs({ ...all, province: NO_PROVINCE }).p_province_key, '');
});

test('trade filter: exact stored value, in the key, missing or All = no filter', () => {
  assert.deepEqual(prospectFilterSpec({ ...all, trade: 'Automotive' }).eq, [['trade', 'Automotive']]);
  assert.deepEqual(prospectFilterSpec({ ...all, trade: 'All' }).eq, []);
  assert.deepEqual(prospectFilterSpec({ ...all, city: 'regina', trade: 'Renovations' }).eq, [['city_key', 'regina'], ['trade', 'Renovations']]);
  assert.notEqual(filtersKey({ ...all, trade: 'Automotive' }), filtersKey(all));
  assert.notEqual(filtersKey({ ...all, trade: 'Renovation' }), filtersKey({ ...all, trade: 'Renovations' }));
  assert.equal(filtersKey({ ...all, trade: 'All' }), filtersKey(all));
});

test('trade option args: every other filter, plus city', () => {
  assert.deepEqual(tradeOptionArgs(all), { p_text_like: null, p_phone_like: null, p_status: null, p_rep: null, p_province_key: null, p_city_key: null });
  assert.deepEqual(tradeOptionArgs({ ...all, status: 'Attempted', province: 'sk', city: 'regina', trade: 'Automotive' }),
    { p_text_like: null, p_phone_like: null, p_status: 'Attempted', p_rep: null, p_province_key: 'sk', p_city_key: 'regina' });
});

test('dropdown options: biggest first, zeros hidden unless selected, No province last', () => {
  const rows = [
    { kind: 'province' as const, key: 'ab', label: 'AB', n: 2 },
    { kind: 'province' as const, key: 'sk', label: 'SK', n: 5 },
    { kind: 'province' as const, key: 'bc', label: 'BC', n: 0 },
    { kind: 'province' as const, key: '', label: '', n: 3 },
    { kind: 'city' as const, key: 'regina', label: 'Regina', n: 0 },
  ];
  assert.deepEqual(dropdownOptions(rows, 'province', 'All').map(o => o.key), ['sk', 'ab', NO_PROVINCE]);
  assert.deepEqual(dropdownOptions(rows, 'province', 'bc').map(o => o.key), ['sk', 'ab', 'bc', NO_PROVINCE]);
  assert.deepEqual(dropdownOptions(rows, 'city', 'All'), []);
  assert.deepEqual(dropdownOptions(rows, 'city', 'regina'), [{ key: 'regina', label: 'Regina', count: 0 }]);
});
