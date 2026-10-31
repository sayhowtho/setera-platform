// Every code path that inserts into prospect_activities, replayed against
// STAGING with the exact payload shape the code sends, as the role that sends
// it (same RLS + migration 026 constraint as the real app):
//   /setter Log Activity, /rep Log Activity, High Table Log Activity,
//   High Table Book Demo (date/time), High Table Book Demo (calendar slot).
// Each Log Activity path: with an outcome -> saved; blank -> rejected.
// Run: node --env-file=.env.staging scripts/test-activity-inserts.mjs
// Creates (and removes) a temporary setter + rep login and 3 prospects.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PW = 'Tmp-ActIns-' + Date.now() + '!Aa1';
const PREFIX = 'Test Fictional ActIns';
const USERS = [['setter', 'actins.setter@example.com'], ['rep', 'actins.rep@example.com']];

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };

async function cleanup() {
  const { data: ps } = await admin.from('prospects').select('id').like('company_name', PREFIX + '%');
  const ids = (ps || []).map(p => p.id);
  if (ids.length) { await admin.from('prospect_activities').delete().in('prospect_id', ids); await admin.from('prospects').delete().in('id', ids); }
  for (const [, email] of USERS) {
    const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (data) { await admin.from('profiles').delete().eq('id', data.id); await admin.auth.admin.deleteUser(data.id); }
  }
}
async function session(email, password) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  return { c, id: data.user.id };
}

async function run() {
  await cleanup();
  const S = {};
  for (const [role, email] of USERS) {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').upsert({ id: data.user.id, email, full_name: 'ActIns ' + role, role, is_demo: true });
    S[role] = await session(email, PW);
  }
  S.admin = await session(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const prospects = {};
  for (const role of ['setter', 'rep', 'admin']) {
    const { data } = await admin.from('prospects').insert({ rep_id: S[role].id, company_name: `${PREFIX} ${role}`, status: 'Not Contacted' }).select('id').single();
    prospects[role] = data.id;
  }

  // Shape: { ...activityForm, follow_up_date, prospect_id, rep_id } (setter/rep/admin logActivity)
  const logShape = (role, outcome) => ({ type: 'Call', outcome, notes: 'test', follow_up_date: null, prospect_id: prospects[role], rep_id: S[role].id });
  for (const [label, role] of [['/setter Log Activity', 'setter'], ['/rep Log Activity', 'rep'], ['High Table Log Activity', 'admin']]) {
    const ok = await S[role].c.from('prospect_activities').insert(logShape(role, 'No Answer'));
    check(`${label}: with outcome -> saved`, !ok.error, ok.error?.message);
    const bad = await S[role].c.from('prospect_activities').insert(logShape(role, ''));
    check(`${label}: blank outcome -> rejected by migration 026`, /outcome_required/.test(bad.error?.message || ''), bad.error?.message);
  }
  // High Table Book Demo, both variants (admin/page.tsx): outcome is always built from the date/time.
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const d1 = await S.admin.c.from('prospect_activities').insert({ prospect_id: prospects.admin, rep_id: S.admin.id, type: 'Demo', outcome: 'Demo booked — ' + day + ' at 10:00 AM', notes: '', follow_up_date: day });
  check('High Table Book Demo (date/time) -> saved', !d1.error, d1.error?.message);
  const d2 = await S.admin.c.from('prospect_activities').insert({ prospect_id: prospects.admin, rep_id: S.admin.id, type: 'Demo', outcome: 'Demo booked — ' + day + ' at 2:00 PM', notes: '', follow_up_date: day });
  check('High Table Book Demo (calendar slot) -> saved', !d2.error, d2.error?.message);

  const { count } = await admin.from('prospect_activities').select('id', { count: 'exact', head: true }).in('prospect_id', Object.values(prospects));
  check('exactly 5 rows saved (3 log + 2 demo), 0 blank', count === 5, String(count));
  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
run().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
