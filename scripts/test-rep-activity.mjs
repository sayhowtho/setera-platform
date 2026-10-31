// Verifies High Table → Rep Activity (/api/admin/rep-activity) and the
// outcome-required rule (migrations/026) against STAGING over real HTTP.
// Needs the Rep Activity seed:  node --env-file=.env.staging scripts/seed-rep-activity-demo.mjs
// and next dev on staging:      (set -a; . ./.env.staging; set +a; npx next dev -p 3127)
// Run:                          BASE_URL=http://localhost:3127 node --env-file=.env.staging scripts/test-rep-activity.mjs
// Creates (and removes) one temporary setter login for the access checks.

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const TMP_EMAIL = 'ra.test.setter@example.com', TMP_PW = 'Tmp-RaTest-' + Date.now() + '!Aa1';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };
const regina = ms => new Date(ms - 6 * 3600000).toISOString().slice(0, 10);

async function signIn(email, password) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  return data.session.access_token;
}
const post = (token, body) => fetch(BASE_URL + '/api/admin/rep-activity', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function removeTmp() {
  const { data } = await admin.from('profiles').select('id').eq('email', TMP_EMAIL).maybeSingle();
  if (data) { await admin.from('prospect_activities').delete().eq('rep_id', data.id); await admin.from('prospects').delete().eq('rep_id', data.id); await admin.from('profiles').delete().eq('id', data.id); await admin.auth.admin.deleteUser(data.id); }
}

async function run() {
  await removeTmp();
  const adminToken = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const { data: u } = await admin.auth.admin.createUser({ email: TMP_EMAIL, password: TMP_PW, email_confirm: true });
  await admin.from('profiles').upsert({ id: u.user.id, email: TMP_EMAIL, full_name: 'RA Test Setter', role: 'setter', is_demo: true });
  const setterToken = await signIn(TMP_EMAIL, TMP_PW);
  const today = regina(Date.now()), weekAgo = regina(Date.now() - 6 * 86400000);

  console.log('\nAccess');
  check('setter -> 403', (await post(setterToken, { start: today, end: today })).status === 403);
  check('bad dates -> 400', (await post(adminToken, { start: today, end: weekAgo })).status === 400);

  console.log('\nToday');
  const t = await post(adminToken, { start: today, end: today });
  check('admin -> 200', t.status === 200, t.body.error);
  const rep = n => (t.body.reps || []).find(r => r.name === n);
  const busy = rep('Test Rep Busy'), quiet = rep('Test Setter Quiet'), idle = rep('Test Setter Idle');
  check('demo account (is_demo) not listed', !(t.body.reps || []).some(r => r.name === 'RA Test Setter'));
  check('Busy: 10 allocated, 8 activities (6 calls / 2 emails)', busy?.summary.allocated === 10 && busy.summary.activities === 8 && busy.summary.calls === 6 && busy.summary.emails === 2, JSON.stringify(busy?.summary));
  check('Busy: 8 touched / 2 untouched, 2 follow-ups scheduled, 0 overdue', busy?.summary.touched === 8 && busy.summary.untouched === 2 && busy.summary.followUpsScheduled === 2 && busy.summary.followUpsOverdue === 0);
  check('Busy: first touch 8 of 10, avg > 0', busy?.summary.firstTouch.touched === 8 && busy.summary.firstTouch.allocations === 10 && busy.summary.firstTouch.avgHours > 0, JSON.stringify(busy?.summary.firstTouch));
  check('Busy: quality 0 no-outcome / 1 no-notes', busy?.summary.noOutcome === 0 && busy.summary.noNotes === 1);
  // The seed's no-outcome row only exists if it was seeded before migration 026.
  const legacyRow = quiet?.summary.noOutcome === 1;
  check(`Quiet: ${legacyRow ? '3 activities, 1 no-outcome, 2' : '2 activities, 0 no-outcome, 1'} no-notes`, quiet?.summary.activities === (legacyRow ? 3 : 2) && quiet.summary.noNotes === (legacyRow ? 2 : 1), JSON.stringify(quiet?.summary));
  check('Idle: 0 activities today, 2 overdue follow-ups, allocated 0 today', idle?.summary.activities === 0 && idle.summary.followUpsOverdue === 2 && idle.summary.allocated === 0, JSON.stringify(idle?.summary));
  check('Idle: last activity ~3 days ago', idle?.lastActivityAt && Date.now() - Date.parse(idle.lastActivityAt) > 2 * 86400000);
  const feed = t.body.feed || [];
  check('feed newest first, seeded rows today', feed.filter(f => f.company_name?.startsWith('Test Fictional RA')).length === (legacyRow ? 11 : 10) && feed.every((f, i) => i === 0 || f.created_at <= feed[i - 1].created_at));
  check('feed rows carry company + prospect id', feed.every(f => f.prospect_id && f.company_name));

  console.log('\nLast 7 days');
  const w = await post(adminToken, { start: weekAgo, end: today });
  const idle7 = (w.body.reps || []).find(r => r.name === 'Test Setter Idle');
  check('Idle over 7 days: 4 allocated, 2 activities, first touch 2 of 4', idle7?.summary.allocated === 4 && idle7.summary.activities === 2 && idle7.summary.firstTouch.touched === 2, JSON.stringify(idle7?.summary));

  console.log('\nOutcome required (migration 026)');
  const { data: own } = await admin.from('prospects').insert({ rep_id: u.user.id, company_name: 'Test Fictional RA Tmp', status: 'Not Contacted' }).select('id').single();
  const sc = anonClient(); await sc.auth.signInWithPassword({ email: TMP_EMAIL, password: TMP_PW });
  const blank = await sc.from('prospect_activities').insert({ prospect_id: own.id, rep_id: u.user.id, type: 'Call', outcome: '', notes: 'x' });
  check('rep inserting blank outcome -> rejected', !!blank.error && /outcome_required/.test(blank.error.message), blank.error?.message);
  const spaces = await sc.from('prospect_activities').insert({ prospect_id: own.id, rep_id: u.user.id, type: 'Call', outcome: '   ', notes: 'x' });
  check('whitespace-only outcome -> rejected', !!spaces.error);
  const nul = await admin.from('prospect_activities').insert({ prospect_id: own.id, rep_id: u.user.id, type: 'Call', outcome: null });
  check('null outcome, even with the service key -> rejected', !!nul.error);
  const ok = await sc.from('prospect_activities').insert({ prospect_id: own.id, rep_id: u.user.id, type: 'Call', outcome: 'No Answer', notes: '' });
  check('outcome present, notes blank -> allowed', !ok.error, ok.error?.message);
  const { count: legacy } = await admin.from('prospect_activities').select('id', { count: 'exact', head: true }).eq('outcome', '');
  // Only meaningful when the seed ran before 026 (otherwise there is no legacy row to keep).
  if (legacyRow) check('existing blank-outcome rows still there (NOT VALID)', legacy >= 1, String(legacy));
  else console.log('  SKIP existing blank-outcome rows check (seeded after migration 026, so none exist)');

  await removeTmp();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
run().catch(async e => { console.error(e); await removeTmp(); process.exit(1); });
