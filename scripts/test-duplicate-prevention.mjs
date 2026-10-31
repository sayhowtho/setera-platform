// Verifies duplicate prevention (migrations/018 + /api/prospects/create +
// /api/business-search) end-to-end against STAGING, with the UI bypassed:
// every check here is a raw API/DB call a setter could make from devtools.
//
//   1. First add of a phone number        -> 200
//   2. Same number, different formatting  -> 409 (hard block), even though
//      no UI check ran (direct API call)
//   3. Same number as the contact_phone   -> 409 (all numbers are checked)
//   4. 5 parallel adds of one new number  -> exactly one 200 (race-safe)
//   5. Junk phone                         -> 400, nothing saved
//   6. Direct supabase insert as a setter -> rejected by RLS (can't bypass the API)
//   7. Name-only match, different phone   -> 200 (soft warning, not a block)
//   8. /api/business-search as a setter   -> only the limited fields
//
// Calls a running `next dev` bound to staging over real HTTP (same reason as
// scripts/test-remove-user.mjs: importing route handlers breaks on
// next/server). Requires migration 018 applied to staging.
//
// Every write is scoped to EXPECTED_EMAIL and companies prefixed TEST_PREFIX,
// using 555-01XX numbers (reserved for fiction).
//
// Usage (staging only):
//   node --env-file=.env.staging scripts/test-duplicate-prevention.mjs                      # dry run
//   BASE_URL=http://localhost:PORT node --env-file=.env.staging scripts/test-duplicate-prevention.mjs --apply
//   node --env-file=.env.staging scripts/test-duplicate-prevention.mjs --cleanup

import { createClient } from '@supabase/supabase-js';

const EXPECTED_EMAIL = 'dupcheck.test@example.com';
const TEST_PREFIX = 'Test Fictional Dupcheck';
const PASSWORD = 'Tmp-DupcheckTest-' + Date.now() + '!Aa1';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run with: node --env-file=.env.staging scripts/test-duplicate-prevention.mjs [--apply|--cleanup]');
  process.exit(1);
}
if (url.includes('your-production-project-ref')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the production project. Use --env-file=.env.staging.');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

async function findTestUser() {
  const { data } = await admin.from('profiles').select('*').eq('email', EXPECTED_EMAIL).maybeSingle();
  return data;
}

async function cleanup() {
  const { data: rows } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (rows || []).map(r => r.id);
  if (ids.length) {
    await admin.from('prospect_stage_history').delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  console.log(`Deleted ${ids.length} test prospect(s).`);
  const user = await findTestUser();
  if (user) {
    await admin.from('profiles').delete().eq('id', user.id);
    await admin.auth.admin.deleteUser(user.id);
    console.log('Deleted test setter', EXPECTED_EMAIL);
  }
}

async function setterSession() {
  let user = await findTestUser();
  if (!user) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: EXPECTED_EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'Dupcheck Test Setter' } });
    if (error) throw new Error('create user: ' + error.message);
    const { data: prof, error: pErr } = await admin.from('profiles').upsert({ id: created.user.id, email: EXPECTED_EMAIL, full_name: 'Dupcheck Test Setter', role: 'setter' }).select().single();
    if (pErr) throw new Error('create profile: ' + pErr.message);
    user = prof;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: EXPECTED_EMAIL, password: PASSWORD });
  if (error) throw new Error('sign in: ' + error.message);
  return { user, token: data.session.access_token, client };
}

async function post(path, token, body) {
  const res = await fetch(BASE_URL + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const prospect = (name, phone, extra = {}) => ({ prospect: { company_name: `${TEST_PREFIX} ${name}`, phone, trade: 'Roofing', city: 'Regina', status: 'Not Contacted', ...extra }, stage: 'New' });

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + JSON.stringify(detail)}`);
  if (!ok) failures++;
}

async function apply() {
  await cleanup();
  const { token, client, user } = await setterSession();
  const n = Date.now() % 90 + 10; // vary the 555-01XX number per run

  const first = await post('/api/prospects/create', token, prospect('Alpha Roofing', `(306) 555-01${n}`));
  check('1. first add succeeds', first.status === 200, first);

  const dup = await post('/api/prospects/create', token, prospect('Totally Different Name', `+1 306.555.01${n} ext 7`));
  check('2. same number, different format -> 409 via direct API', dup.status === 409, dup);

  const dupContact = await post('/api/prospects/create', token, prospect('Another Name', '', { contact_phone: `1-306-555-01${n}` }));
  check('3. same number as contact_phone -> 409', dupContact.status === 409, dupContact);

  const raceNum = `30655501${(n + 1) % 90 + 10}`; // a different 555-01XX number
  const race = await Promise.all(Array.from({ length: 5 }, (_, i) => post('/api/prospects/create', token, prospect('Race ' + i, raceNum))));
  const wins = race.filter(r => r.status === 200).length;
  check('4. 5 parallel adds of one number -> exactly one saved', wins === 1 && race.filter(r => r.status === 409).length === 4, race.map(r => r.status));

  const junk = await post('/api/prospects/create', token, prospect('Junk Phone', 'call me maybe'));
  check('5. junk phone -> 400', junk.status === 400, junk);

  const direct = await client.from('prospects').insert({ rep_id: user.id, company_name: `${TEST_PREFIX} Direct Insert`, phone: `306555019${n % 10}` }).select();
  check('6. direct supabase insert as setter -> rejected by RLS', !!direct.error, direct);

  const soft = await post('/api/prospects/create', token, prospect('Alpha Roofing Ltd.', '(306) 555-0100'));
  check('7. name-only match with a different phone -> saved (soft warning only)', soft.status === 200, soft);

  const search = await post('/api/business-search', token, { phone: `306-555-01${n}`, mode: 'lookup' });
  const allowed = ['key', 'source', 'prospectId', 'businessName', 'city', 'trade', 'status', 'ownerLabel', 'lastActivity', 'stale', 'matchedOn', 'myRequest'];
  const m = search.body?.matches?.[0];
  check('8. search returns the match with only limited fields', search.status === 200 && m && m.matchedOn === 'phone' && Object.keys(m).every(k => allowed.includes(k)), search.body);

  await cleanup();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

if (CLEANUP) await cleanup();
else if (APPLY) await apply();
else {
  console.log('DRY RUN — with --apply this will, against staging + a running next dev at', BASE_URL + ':');
  console.log(`- create/sign in test setter ${EXPECTED_EMAIL}`);
  console.log(`- add "${TEST_PREFIX} ..." prospects with 555-01XX numbers and run checks 1–8 (see header)`);
  console.log('- delete everything it created');
}
