// Verifies app/api/admin/remove-user/route.ts end-to-end against staging,
// after the 2026-09-22 fix: (1) a rep/setter with prospect/pipeline history
// is blocked (409), matching the same policy already enforced for Overflow
// attribution; (2) a rep/setter with no history is deleted cleanly — both
// the auth.users row AND the profiles row actually gone afterward.
//
// Calls the route over real HTTP against a running `next dev` server bound
// to staging — same file, same logic, same runtime Next.js actually uses in
// production — not a reimplementation of its checks, so this can't silently
// drift from what the route actually does. (An earlier version of this
// script imported the route's POST handler directly via a Node ESM loader;
// that worked for the `@/*` path alias but broke on `next/server`'s package
// exports, which only resolve correctly inside Next's own bundler — real
// HTTP against a real `next dev` sidesteps that entirely.)
//
// Every write here is scoped to the two EXPECTED_EMAIL_* fictional test
// accounts below — this must never be able to touch a real rep/setter.
//
// Usage (staging only — never point this at .env.local/production):
//   node --env-file=.env.staging scripts/test-remove-user.mjs                        # dry run — prints the plan, writes nothing
//   BASE_URL=http://localhost:PORT node --env-file=.env.staging scripts/test-remove-user.mjs --apply   # creates both test accounts, runs both delete attempts against a running `next dev` on staging, verifies outcomes
//   node --env-file=.env.staging scripts/test-remove-user.mjs --cleanup              # removes anything left over (the blocked "dirty" account + its prospect)

import { createClient } from '@supabase/supabase-js';

const EXPECTED_EMAIL_DIRTY = 'removeuser.dirty.test@example.com';
const EXPECTED_EMAIL_CLEAN = 'removeuser.clean.test@example.com';
const EXPECTED_PROSPECT_COMPANY = 'Test Fictional Pipeline Co';

const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!url || !anonKey || !serviceKey || !adminEmail || !adminPassword) {
  console.error('Missing one of NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / ADMIN_EMAIL / ADMIN_PASSWORD.');
  console.error('Run with: node --env-file=.env.staging scripts/test-remove-user.mjs [--apply|--cleanup]');
  process.exit(1);
}

// This script must only ever run against staging. clients/your-production-project-ref
// is production — refuse outright rather than trust the caller's env file.
if (url.includes('your-production-project-ref')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the production project. Use --env-file=.env.staging.');
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

async function findTestUser(email) {
  const { data } = await admin.from('profiles').select('*').eq('email', email).maybeSingle();
  return data;
}

async function cleanup() {
  const dirty = await findTestUser(EXPECTED_EMAIL_DIRTY);
  if (dirty) {
    await admin.from('prospects').delete().eq('rep_id', dirty.id).eq('company_name', EXPECTED_PROSPECT_COMPANY);
    await admin.from('profiles').delete().eq('id', dirty.id);
    await admin.auth.admin.deleteUser(dirty.id);
    console.log('Cleaned up dirty test account + prospect:', EXPECTED_EMAIL_DIRTY);
  } else {
    console.log('Nothing to clean up for', EXPECTED_EMAIL_DIRTY);
  }
  const clean = await findTestUser(EXPECTED_EMAIL_CLEAN);
  if (clean) {
    await admin.from('profiles').delete().eq('id', clean.id);
    await admin.auth.admin.deleteUser(clean.id);
    console.log('Cleaned up leftover clean test account:', EXPECTED_EMAIL_CLEAN);
  } else {
    console.log('Nothing to clean up for', EXPECTED_EMAIL_CLEAN, '(expected — the route should have deleted it itself)');
  }
}

async function plan() {
  console.log('DRY RUN — would do the following against staging:');
  console.log(`- Create test setter ${EXPECTED_EMAIL_DIRTY} + one prospect ("${EXPECTED_PROSPECT_COMPANY}") crediting them`);
  console.log(`- Create test setter ${EXPECTED_EMAIL_CLEAN} with no history`);
  console.log(`- Sign in as ${adminEmail} to get a real admin bearer token`);
  console.log(`- POST to ${BASE_URL}/api/admin/remove-user (a running \`next dev\` on staging) for each:`);
  console.log('    dirty  -> expect 409, "prospect/pipeline history" error, nothing deleted');
  console.log('    clean  -> expect 200, success, auth user AND profile both gone');
  console.log('- Verify both outcomes by re-querying profiles/auth afterward');
  console.log('\nRun with --apply to actually do this, or --cleanup to remove a previous run.');
}

async function ensureTestUser(email, fullName) {
  let user = await findTestUser(email);
  if (user) return user;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'Tmp-RemoveUserTest-' + Date.now() + '!Aa1',
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr) throw new Error(`Failed to create auth user ${email}: ${createErr.message}`);
  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .upsert({ id: created.user.id, email, full_name: fullName, role: 'setter' })
    .select()
    .single();
  if (profErr) throw new Error(`Failed to create profile ${email}: ${profErr.message}`);
  return prof;
}

async function getAdminBearerToken() {
  const { data, error } = await anon.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (error || !data.session) throw new Error(`Admin sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function callRemoveUser(token, userId) {
  const res = await fetch(BASE_URL + '/api/admin/remove-user', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function apply() {
  console.log('Setting up test accounts on staging...');
  const dirty = await ensureTestUser(EXPECTED_EMAIL_DIRTY, 'Dirty Testface');
  const clean = await ensureTestUser(EXPECTED_EMAIL_CLEAN, 'Clean Testface');

  let { data: prospect } = await admin.from('prospects').select('id').eq('rep_id', dirty.id).eq('company_name', EXPECTED_PROSPECT_COMPANY).maybeSingle();
  if (!prospect) {
    const { data: created, error } = await admin.from('prospects').insert({
      rep_id: dirty.id,
      company_name: EXPECTED_PROSPECT_COMPANY,
      status: 'Not Contacted',
    }).select().single();
    if (error) throw new Error(`Failed to create test prospect: ${error.message}`);
    prospect = created;
  }
  console.log('Dirty setter:', dirty.id, '- prospect:', prospect.id);
  console.log('Clean setter:', clean.id);

  console.log('\nSigning in as', adminEmail, 'for a real bearer token...');
  const token = await getAdminBearerToken();

  console.log('\n=== Attempt 1: delete DIRTY setter (has pipeline history) ===');
  const r1 = await callRemoveUser(token, dirty.id);
  console.log('status:', r1.status, '| body:', JSON.stringify(r1.body));
  const dirtyStillExists = await findTestUser(EXPECTED_EMAIL_DIRTY);
  const pass1 =
    r1.status === 409 &&
    typeof r1.body?.error === 'string' &&
    r1.body.error.includes('prospect/pipeline history') &&
    !!dirtyStillExists;
  console.log(pass1 ? '✅ PASS — blocked with 409, profile untouched' : '❌ FAIL — did not block correctly, see details above');

  console.log('\n=== Attempt 2: delete CLEAN setter (no history) ===');
  const r2 = await callRemoveUser(token, clean.id);
  console.log('status:', r2.status, '| body:', JSON.stringify(r2.body));
  const cleanProfileGone = !(await findTestUser(EXPECTED_EMAIL_CLEAN));
  const { data: cleanAuthCheck } = await admin.auth.admin.getUserById(clean.id).catch(() => ({ data: null }));
  const cleanAuthGone = !cleanAuthCheck?.user;
  const pass2 = r2.status === 200 && r2.body?.success === true && cleanProfileGone && cleanAuthGone;
  console.log(pass2 ? '✅ PASS — deleted successfully, profile AND auth user both gone' : '❌ FAIL — deletion did not fully complete, see details above');

  console.log('\n=== Summary ===');
  console.log('Blocked-by-history case:', pass1 ? 'PASS' : 'FAIL');
  console.log('Clean-delete case:      ', pass2 ? 'PASS' : 'FAIL');
  if (!pass1 || !pass2) process.exitCode = 1;

  console.log('\nDirty test account (blocked, so it still exists) left in place — run with --cleanup to remove it.');
}

if (CLEANUP) {
  await cleanup();
} else if (APPLY) {
  await apply();
} else {
  await plan();
}
