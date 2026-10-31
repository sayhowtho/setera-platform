// Verifies how Bodhi's API sets province (migrations/024 + lib/canada-places.ts)
// against STAGING over real HTTP: a valid province as sent wins; otherwise it
// comes from the city (ambiguous names need a matching area code); otherwise
// it stays blank. Never SK by default. Also checks the column default is gone.
//
// Start next dev on staging with a throwaway key (exported vars win over .env.local):
//   export BODHI_API_KEY=$(openssl rand -hex 32) BODHI_RATE_BUCKET=bodhi-prov-$(date +%s)
//   (set -a; . ./.env.staging; set +a; npx next dev -p 3124)
// then, with the same exports:
//   BASE_URL=http://localhost:3124 node --env-file=.env.staging scripts/test-bodhi-province.mjs
// Rows use TEST_PREFIX names and 555-01XX numbers and are deleted afterwards.

import { createClient } from '@supabase/supabase-js';

const TEST_PREFIX = 'Test Fictional ProvCheck';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.BODHI_API_KEY) {
  console.error('Need staging env (--env-file=.env.staging) and BODHI_API_KEY (same as the running next dev).');
  process.exit(1);
}
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// [label, row fields, expected stored province, expected province_source]
const CASES = [
  ['province sent: ON (city Calgary)',      { province: 'ON', city: 'Calgary', phone: '403-555-0151' }, 'ON', 'given'],
  ['province sent lowercase: " ab "',       { province: ' ab ', city: 'Red Deer', phone: '403-555-0152' }, 'AB', 'given'],
  ['province sent as a name: "Manitoba"',   { province: 'Manitoba', city: 'Brandon', phone: '204-555-0153' }, 'MB', 'given'],
  ['province sent: SK (city Regina)',       { province: 'SK', city: 'Regina', phone: '306-555-0154' }, 'SK', 'given'],
  ['no province, city Calgary',             { city: 'Calgary', phone: '403-555-0155' }, 'AB', 'inferred'],
  ['no province, city Winnipeg, no phone',  { city: 'Winnipeg' }, 'MB', 'inferred'],
  ['no province, city Kamloops',            { city: 'Kamloops', phone: '250-555-0156' }, 'BC', 'inferred'],
  ['no province, "Sherwood Park / Edmonton"', { city: 'Sherwood Park / Edmonton', phone: '780-555-0157' }, 'AB', 'inferred'],
  ['no province, Victoria + 250 number',    { city: 'Victoria', phone: '250-555-0158' }, 'BC', 'inferred'],
  ['invalid province "XX", city Halifax',   { province: 'XX', city: 'Halifax', phone: '902-555-0159' }, 'NS', 'inferred'],
  ['no province, Victoria, no phone',       { city: 'Victoria' }, null, 'none'],
  ['no province, Calgary + 519 number',     { city: 'Calgary', phone: '519-555-0160' }, null, 'none'],
  ['no province, Lloydminster',             { city: 'Lloydminster', phone: '306-555-0161' }, null, 'none'],
  ['no province, unknown town',             { city: 'Springfield', phone: '306-555-0162' }, null, 'none'],
  ['no province, no city',                  { phone: '306-555-0163' }, null, 'none'],
];

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : '')); };

async function cleanup() {
  const { data } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (data || []).map(r => r.id);
  if (ids.length) {
    await admin.from('prospect_stage_history').delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  return ids.length;
}

async function run() {
  await cleanup();
  const body = CASES.map(([label, f], i) => ({ company_name: `${TEST_PREFIX} ${String(i + 1).padStart(2, '0')}`, ...f, notes: label }));
  const res = await fetch(BASE_URL + '/api/bodhi/prospects', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bulk-key': process.env.BODHI_API_KEY }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  check('POST /api/bodhi/prospects -> 200, all added', res.status === 200 && json.added === CASES.length, `status ${res.status}, added ${json.added}, skipped ${json.skipped}, errors ${json.errors}`);

  const { data: rows } = await admin.from('prospects').select('company_name, city, province').like('company_name', TEST_PREFIX + '%');
  const stored = new Map((rows || []).map(r => [r.company_name, r.province]));
  console.log('\n  #  case                                        sent        stored  source    expected');
  CASES.forEach(([label, f, expProv, expSrc], i) => {
    const name = `${TEST_PREFIX} ${String(i + 1).padStart(2, '0')}`;
    const r = (json.results || []).find(x => x.row === i) || {};
    const got = stored.has(name) ? stored.get(name) : '(missing)';
    const ok = got === expProv && r.province === expProv && r.province_source === expSrc;
    ok ? pass++ : fail++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${String(i + 1).padStart(2)} ${label.padEnd(42)} ${JSON.stringify(f.province ?? null).padEnd(11)} ${String(got).padEnd(7)} ${String(r.province_source).padEnd(9)} ${expProv ?? 'blank'} (${expSrc})`);
  });
  check('no row stored as SK unless SK was sent', (rows || []).every((r, _) => r.province !== 'SK' || r.company_name.endsWith(' 04')));

  // Column default gone: an insert that leaves province out stores NULL (was 'SK').
  const { data: raw, error } = await admin.from('prospects').insert({ rep_id: (await admin.from('profiles').select('id').eq('role', 'owner').single()).data.id, company_name: `${TEST_PREFIX} RawInsert` }).select('province').single();
  check('insert without province -> NULL (no SK column default)', !error && raw.province === null, error?.message || `province=${JSON.stringify(raw?.province)}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`Cleaned up ${await cleanup()} test prospect(s).`);
  if (fail) process.exit(1);
}

run().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
