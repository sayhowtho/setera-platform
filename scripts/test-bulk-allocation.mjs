// Verifies bulk prospect allocation + pull back (migrations/023,
// /api/admin/prospects/allocate, /api/admin/prospects/pull-back) end-to-end
// against STAGING over real HTTP, signed in as ADMIN_EMAIL (role admin).
//
//   Access      setter -> 403 on GET/POST allocate and pull-back
//   Reps        demo rep hidden; deactivated rep flagged inactive; untouched counts
//   Dry run     skip reasons counted separately (not Alex's, DNC, activity, status)
//   Blocks      more than selected / more than eligible / demo / deactivated -> 400, nothing moved
//   Atomic      RPC with a bad 2nd allocation -> raises, 1st chunk not moved
//   Allocate    chunked in table order, audit row per move, stale clock protected
//   Stats       assigned / worked / untouched (from allocations vs own) / last activity
//   Pull back   only-allocated by default (own prospects stay), oldest allocation first, touched rows never move, count > available blocked,
//               stale protection removed (updated_at restored), audit rows, deactivated OK, demo blocked
//
// Every write is scoped to test accounts (EMAIL_PREFIX) and companies prefixed
// TEST_PREFIX. Prospects are backdated 60 days so they start stale.
//
// Usage (staging only; migration 023 applied to staging; next dev bound to staging):
//   node --env-file=.env.staging scripts/test-bulk-allocation.mjs              # dry run
//   BASE_URL=http://localhost:PORT node --env-file=.env.staging scripts/test-bulk-allocation.mjs --apply
//   node --env-file=.env.staging scripts/test-bulk-allocation.mjs --cleanup

import { createClient } from '@supabase/supabase-js';

const EMAIL_PREFIX = 'alloc.test.';
const TEST_PREFIX = 'Test Fictional Alloc';
const PASSWORD = 'Tmp-AllocTest-' + Date.now() + '!Aa1';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Missing staging env. Run with: node --env-file=.env.staging scripts/test-bulk-allocation.mjs [--apply|--cleanup]');
  process.exit(1);
}
if (url.includes('your-production-project-ref')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the production project. Use --env-file=.env.staging.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const USERS = {
  setterA: { role: 'setter', name: 'Alloc Test Setter A' },
  setterB: { role: 'setter', name: 'Alloc Test Setter B' },
  requester: { role: 'setter', name: 'Alloc Test Requester' },
  demo: { role: 'rep', name: 'Alloc Test Demo', is_demo: true },
  gone: { role: 'rep', name: 'Alloc Test Deactivated', banned: true },
};
const emailOf = key => EMAIL_PREFIX + key.toLowerCase() + '@heysetera.com';

async function cleanup() {
  const { data: rows } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (rows || []).map(r => r.id);
  if (ids.length) {
    await admin.from('lead_requests').delete().in('prospect_id', ids);
    await admin.from('prospect_assignments').delete().in('prospect_id', ids);
    await admin.from('prospect_activities').delete().in('prospect_id', ids);
    await admin.from('prospect_stage_history').delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  console.log(`Deleted ${ids.length} test prospect(s).`);
  const { data: profs } = await admin.from('profiles').select('id, email').like('email', EMAIL_PREFIX + '%');
  for (const p of profs || []) {
    await admin.from('prospect_assignments').delete().or(`from_rep_id.eq.${p.id},to_rep_id.eq.${p.id}`);
    await admin.from('profiles').delete().eq('id', p.id);
    await admin.auth.admin.deleteUser(p.id);
  }
  console.log(`Deleted ${(profs || []).length} test user(s).`);
}

async function signIn(email, password) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error('sign in ' + email + ': ' + error.message);
  return data.session.access_token;
}

async function makeUsers() {
  const out = {};
  for (const [key, u] of Object.entries(USERS)) {
    const { data: created, error } = await admin.auth.admin.createUser({ email: emailOf(key), password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } });
    if (error) throw new Error('create user: ' + error.message);
    const { error: pErr } = await admin.from('profiles').upsert({ id: created.user.id, email: emailOf(key), full_name: u.name, role: u.role, is_demo: !!u.is_demo });
    if (pErr) throw new Error('create profile: ' + pErr.message);
    out[key] = { id: created.user.id, token: u.banned ? null : await signIn(emailOf(key), PASSWORD) };
    if (u.banned) await admin.auth.admin.updateUserById(created.user.id, { ban_duration: '876600h' });
  }
  return out;
}

async function api(path, token, body) {
  const res = await fetch(BASE_URL + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
}

const OLD = new Date(Date.now() - 60 * 86400000).toISOString();
async function insertProspects(n, rep_id, label, extra = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({
    rep_id, company_name: `${TEST_PREFIX} ${label} ${String(i + 1).padStart(2, '0')}`, status: 'Not Contacted',
    created_at: OLD, updated_at: OLD, ...extra,
  }));
  const { data, error } = await admin.from('prospects').insert(rows).select('id, company_name').order('company_name');
  if (error) throw new Error('insert prospects: ' + error.message);
  return data.map(r => r.id);
}
const owners = async ids => {
  const { data } = await admin.from('prospects').select('id, rep_id, updated_at').in('id', ids);
  return new Map(data.map(r => [r.id, r]));
};

async function run() {
  if (!APPLY) {
    console.log('Dry run. This will create 5 test users and ~20 test prospects on STAGING (' + url + '), then exercise the API at ' + BASE_URL + '.');
    console.log('Re-run with --apply to run, --cleanup to remove leftovers.');
    return;
  }
  await cleanup();
  const { data: ownerRows } = await admin.from('profiles').select('id').eq('role', 'owner');
  if (ownerRows.length !== 1) throw new Error('staging needs exactly one owner profile');
  const reserve = ownerRows[0].id;
  const adminToken = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const U = await makeUsers();

  // Selection, in "table order": 8 eligible + one of each skip reason.
  const eligible = await insertProspects(8, reserve, 'Eligible');
  const [notReserve] = await insertProspects(1, U.setterB.id, 'NotReserve');
  const [dnc] = await insertProspects(1, reserve, 'DNC', { do_not_contact: true });
  const [worked] = await insertProspects(1, reserve, 'Worked');
  await admin.from('prospect_activities').insert({ prospect_id: worked, rep_id: reserve, type: 'Call', outcome: 'No answer' });
  const [contacted] = await insertProspects(1, reserve, 'Contacted', { status: 'Contacted' });
  const selection = [eligible[0], notReserve, eligible[1], dnc, eligible[2], worked, eligible[3], contacted, ...eligible.slice(4)];
  const eligibleInOrder = selection.filter(id => eligible.includes(id));

  console.log('\nAccess');
  const s = U.setterA.token;
  check('setter GET allocate -> 403', (await api('/api/admin/prospects/allocate', s)).status === 403);
  check('setter POST allocate -> 403', (await api('/api/admin/prospects/allocate', s, { prospectIds: selection, dryRun: true })).status === 403);
  check('setter POST pull-back -> 403', (await api('/api/admin/prospects/pull-back', s, { repId: U.setterA.id, count: null })).status === 403);

  console.log('\nRep list');
  const reps = await api('/api/admin/prospects/allocate', adminToken);
  const byId = new Map((reps.body.reps || []).map(r => [r.id, r]));
  check('GET -> 200', reps.status === 200, JSON.stringify(reps.body).slice(0, 120));
  check('demo rep excluded', !byId.has(U.demo.id));
  check('deactivated rep listed as inactive', byId.get(U.gone.id)?.active === false);
  check('active setters listed', byId.get(U.setterA.id)?.active === true && byId.get(U.setterB.id)?.active === true);
  check('setter B untouched count = 1', byId.get(U.setterB.id)?.untouched === 1, String(byId.get(U.setterB.id)?.untouched));
  check('owner/admin not listed', !byId.has(reserve));

  console.log('\nDry run');
  const dry = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, dryRun: true });
  check('dry run -> 200', dry.status === 200, JSON.stringify(dry.body));
  check('eligible = 8 of 12', dry.body.eligible === 8 && dry.body.selected === 12);
  const sk = dry.body.skipped || {};
  check('skipped by reason: not_reserve 1, dnc 1, has_activity 1, not_new 1', sk.not_reserve === 1 && sk.dnc === 1 && sk.has_activity === 1 && sk.not_new === 1, JSON.stringify(sk));

  console.log('\nBlocks (nothing should move)');
  const before = await owners(selection);
  let r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, allocations: [{ rep_id: U.setterA.id, count: 13 }] });
  check('more than selected -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, allocations: [{ rep_id: U.setterA.id, count: 9 }] });
  check('more than eligible -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, allocations: [{ rep_id: U.demo.id, count: 1 }] });
  check('demo rep -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, allocations: [{ rep_id: U.gone.id, count: 1 }] });
  check('deactivated rep -> 400', r.status === 400, r.body.error);
  const rpc = await admin.rpc('allocate_prospects', { p_admin_id: U.setterA.id, p_reserve_id: reserve, p_prospect_ids: selection, p_allocations: [{ rep_id: U.setterA.id, count: 2 }, { rep_id: U.demo.id, count: 1 }], p_dry_run: false });
  check('RPC rejects a bad 2nd allocation before moving anything', !!rpc.error, rpc.error?.message);
  const after = await owners(selection);
  check('no prospect changed owner or updated_at', selection.every(id => before.get(id).rep_id === after.get(id).rep_id && before.get(id).updated_at === after.get(id).updated_at));
  const { count: auditBefore } = await admin.from('prospect_assignments').select('id', { count: 'exact', head: true }).in('prospect_id', selection);
  check('no audit rows written', auditBefore === 0);

  console.log('\nStale clock before allocation');
  r = await api('/api/lead-requests', U.requester.token, { prospectId: eligibleInOrder[0] });
  check('60-day-old reserve prospect is requestable (200)', r.status === 200, r.body.error);
  await admin.from('lead_requests').delete().eq('prospect_id', eligibleInOrder[0]);

  console.log('\nAllocate: 3 to A, 2 to B (batch 1)');
  r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: selection, allocations: [{ rep_id: U.setterA.id, count: 3 }, { rep_id: U.setterB.id, count: 2 }] });
  check('allocate -> 200', r.status === 200, JSON.stringify(r.body));
  check('reserve_kept = 3, skipped reported', r.body.reserve_kept === 3 && r.body.skipped?.dnc === 1, JSON.stringify(r.body.skipped));
  const o1 = await owners(selection);
  check('first 3 eligible (table order) -> A', eligibleInOrder.slice(0, 3).every(id => o1.get(id).rep_id === U.setterA.id));
  check('next 2 -> B', eligibleInOrder.slice(3, 5).every(id => o1.get(id).rep_id === U.setterB.id));
  check('last 3 stay with reserve', eligibleInOrder.slice(5).every(id => o1.get(id).rep_id === reserve));
  check('skipped rows untouched', [notReserve, dnc, worked, contacted].every(id => o1.get(id).rep_id === before.get(id).rep_id));
  const { data: audit1 } = await admin.from('prospect_assignments').select('*').eq('batch_id', r.body.batch_id);
  check('5 audit rows, kind allocate, from reserve, moved_by admin', audit1.length === 5 && audit1.every(a => a.kind === 'allocate' && a.from_rep_id === reserve && a.prev_updated_at && new Date(a.prev_updated_at).getTime() === new Date(OLD).getTime()));
  r = await api('/api/lead-requests', U.requester.token, { prospectId: eligibleInOrder[0] });
  check('allocated prospect is protected from lead requests (409)', r.status === 409, r.body.error);
  const { count: actCount } = await admin.from('prospect_activities').select('id', { count: 'exact', head: true }).in('prospect_id', eligible);
  check('no prospect_activities written (Setter Activity unaffected)', actCount === 0);

  console.log('\nAllocate: 2 more to A (batch 2)');
  await new Promise(res => setTimeout(res, 1100));
  r = await api('/api/admin/prospects/allocate', adminToken, { prospectIds: eligibleInOrder.slice(5, 7), allocations: [{ rep_id: U.setterA.id, count: 2 }] });
  check('allocate -> 200', r.status === 200, JSON.stringify(r.body));
  // A now holds batch-1 [0,1,2] and batch-2 [5,6]. A works [0].
  await admin.from('prospect_activities').insert({ prospect_id: eligibleInOrder[0], rep_id: U.setterA.id, type: 'Call', outcome: 'Left voicemail' });
  // A also has one prospect they added themselves (no allocation behind it).
  const [aOwn] = await insertProspects(1, U.setterA.id, 'AOwn');
  const g = await api('/api/admin/prospects/allocate', adminToken);
  const gA = g.body.reps.find(x => x.id === U.setterA.id) || {};
  const gB = g.body.reps.find(x => x.id === U.setterB.id) || {};
  check('A stats: 6 assigned, 1 worked, 5 untouched (4 from allocations, 1 own)', gA.assigned === 6 && gA.worked === 1 && gA.untouched === 5 && gA.untouchedAllocated === 4, JSON.stringify(gA));
  check('A last activity is set (just logged a call)', !!gA.lastActivityAt && Date.now() - new Date(gA.lastActivityAt).getTime() < 10 * 60000, gA.lastActivityAt);
  check('B stats: 3 assigned (2 allocated + own), 0 worked, no activity yet', gB.assigned === 3 && gB.worked === 0 && gB.untouched === 3 && gB.untouchedAllocated === 2 && gB.lastActivityAt === null, JSON.stringify(gB));

  console.log('\nPull back');
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.setterA.id, count: 5 });
  check('5 with only-allocated default (A has 4 from allocations) -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.demo.id, count: null });
  check('demo rep -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.setterA.id, count: 2 });
  check('pull back 2 from A -> 200', r.status === 200 && r.body.pulled_back === 2 && r.body.remaining_untouched === 2, JSON.stringify(r.body));
  const o2 = await owners(eligible);
  check('oldest allocation first: batch-1 [1,2] returned, batch-2 [5,6] still A', o2.get(eligibleInOrder[1]).rep_id === reserve && o2.get(eligibleInOrder[2]).rep_id === reserve && o2.get(eligibleInOrder[5]).rep_id === U.setterA.id && o2.get(eligibleInOrder[6]).rep_id === U.setterA.id);
  check('worked prospect never pulled back', o2.get(eligibleInOrder[0]).rep_id === U.setterA.id);
  check('updated_at restored to pre-allocation value', new Date(o2.get(eligibleInOrder[1]).updated_at).getTime() === new Date(OLD).getTime());
  const { data: audit2 } = await admin.from('prospect_assignments').select('*').eq('batch_id', r.body.batch_id);
  check('2 audit rows, kind pull_back, A -> reserve', audit2.length === 2 && audit2.every(a => a.kind === 'pull_back' && a.from_rep_id === U.setterA.id && a.to_rep_id === reserve && a.moved_by));
  r = await api('/api/lead-requests', U.requester.token, { prospectId: eligibleInOrder[1] });
  check('pulled-back prospect is stale again (lead request 200)', r.status === 200, r.body.error);

  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.setterA.id, count: null });
  check('pull back all (only allocated) from A -> 2 moved, 0 left', r.status === 200 && r.body.pulled_back === 2 && r.body.remaining_untouched === 0, JSON.stringify(r.body));
  const o2b = await owners([eligibleInOrder[0], aOwn]);
  check('worked prospect still with A', o2b.get(eligibleInOrder[0]).rep_id === U.setterA.id);
  check("A's self-added prospect still with A", o2b.get(aOwn).rep_id === U.setterA.id);
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.setterA.id, count: null });
  check('nothing allocated & untouched left -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.setterA.id, count: null, onlyAllocated: false });
  check('onlyAllocated:false -> self-added one pulled back', r.status === 200 && r.body.pulled_back === 1 && (await owners([aOwn])).get(aOwn).rep_id === reserve, JSON.stringify(r.body));

  // Deactivated rep with only a prospect they hold without an allocation.
  const [own] = await insertProspects(1, U.gone.id, 'GoneOwn');
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.gone.id, count: null });
  check('deactivated rep, only-allocated default, nothing allocated -> 400', r.status === 400, r.body.error);
  r = await api('/api/admin/prospects/pull-back', adminToken, { repId: U.gone.id, count: null, onlyAllocated: false });
  check('deactivated rep: pull back allowed (onlyAllocated:false)', r.status === 200 && r.body.pulled_back === 1, JSON.stringify(r.body));
  const o3 = await owners([own]);
  check('never-allocated prospect keeps its updated_at', new Date(o3.get(own).updated_at).getTime() === new Date(OLD).getTime());

  console.log(`\n${pass} passed, ${fail} failed`);
  await cleanup();
  if (fail) process.exit(1);
}

(CLEANUP ? cleanup() : run()).catch(e => { console.error(e); process.exit(1); });
