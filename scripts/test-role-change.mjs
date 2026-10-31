// What happens to a setter's data when they're promoted to rep. STAGING only,
// read-only apart from the test data it creates and removes.
//   default:   promotes through High Table's Promote route (/api/admin/change-role,
//              role history from migrations/027)
//   --direct:  promotes with a bare profiles.role update (how it was done before)
//
// Creates a test setter with: 3 allocated prospects + 1 self-added, 3 logged
// activities (one with a follow-up), a booked demo (appointments.setter_id),
// a setter-sourced active client, a rep_compensation row, and a pending lead
// request. Snapshots what each page/API would show, promotes, snapshots again.
//
// Needs next dev on staging:  (set -a; . ./.env.staging; set +a; npx next dev -p 3128)
// Run: BASE_URL=http://localhost:3128 node --env-file=.env.staging scripts/test-role-change.mjs

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const EMAIL = 'promo.test.setter@example.com', PW = 'Tmp-Promo-' + Date.now() + '!Aa1', PREFIX = 'Test Fictional Promo';
const today = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 6 * 3600000 - 6 * 86400000).toISOString().slice(0, 10);

async function cleanup() {
  const { data: prof } = await admin.from('profiles').select('id').eq('email', EMAIL).maybeSingle();
  const { data: ps } = await admin.from('prospects').select('id').like('company_name', PREFIX + '%');
  const ids = (ps || []).map(p => p.id);
  if (ids.length) for (const t of ['lead_requests', 'prospect_assignments', 'prospect_activities', 'prospect_stage_history']) await admin.from(t).delete().in('prospect_id', ids);
  if (prof) {
    await admin.from('appointments').delete().eq('setter_id', prof.id);
    const { data: ces } = await admin.from('commission_earnings').select('id, sale_id').eq('rep_id', prof.id);
    if (ces?.length) { await admin.from('commission_earnings').delete().in('id', ces.map(c => c.id)); await admin.from('sales').delete().in('id', ces.map(c => c.sale_id)); }
    await admin.from('bonus_awards').delete().eq('rep_id', prof.id);
    await admin.from('clients').delete().like('business_name', PREFIX + '%');
    await admin.from('rep_compensation_history').delete().eq('rep_id', prof.id);
    await admin.from('rep_compensation').delete().eq('rep_id', prof.id);
    await admin.from('prospect_activities').delete().eq('rep_id', prof.id);
    await admin.from('prospect_assignments').delete().or(`from_rep_id.eq.${prof.id},to_rep_id.eq.${prof.id}`);
  }
  if (ids.length) await admin.from('prospects').delete().in('id', ids);
  if (prof) { await admin.from('profiles').delete().eq('id', prof.id); await admin.auth.admin.deleteUser(prof.id); }
}
async function signIn(email, password) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  return { c, token: data.session.access_token, id: data.user.id };
}
const api = (path, token, body) => fetch(BASE_URL + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined })
  .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function snapshot(me, adminTok) {
  const { data: prof } = await admin.from('profiles').select('role').eq('id', me.id).single();
  const role = prof.role;
  const s = {};
  s['profiles.role'] = role;
  s['Login sends them to'] = role === 'setter' ? '/setter' : (role === 'rep' || role === 'vp_sales') ? '/rep' : '/dashboard';
  s['/setter portal (setter tools) opens'] = ['setter', 'rep', 'vp_sales', 'owner', 'admin'].includes(role);
  s['/rep portal opens'] = ['rep', 'vp_sales', 'owner', 'admin'].includes(role);
  // What /setter loads (as the user): own prospects, booked demos (setter_id), earnings
  const [ownP, appts, earn] = await Promise.all([
    me.c.from('prospects').select('id', { count: 'exact', head: true }).eq('rep_id', me.id),
    me.c.from('appointments').select('id', { count: 'exact', head: true }).eq('setter_id', me.id),
    me.c.from('commission_earnings').select('id', { count: 'exact', head: true }).eq('rep_id', me.id),
  ]);
  s['/setter data: own prospects | booked demos | earnings rows'] = `${ownP.count} | ${appts.count} | ${earn.count}`;
  // What /rep loads (as the user): clients by rep_id, appointments assigned_to
  const [cl, assigned] = await Promise.all([
    me.c.from('clients').select('id', { count: 'exact', head: true }).eq('rep_id', me.id),
    me.c.from('appointments').select('id', { count: 'exact', head: true }).eq('assigned_to', me.id),
  ]);
  s['/rep data: clients (rep_id) | demos assigned to them'] = `${cl.count} | ${assigned.count}`;
  // Lead requests (setter portal API)
  s['Lead Requests API (own requests)'] = (await api('/api/lead-requests', me.token)).status;
  // High Table: Setter Activity
  const sa = await api('/api/admin/setter-activity', adminTok, { start: weekAgo, end: today });
  const inSA = (sa.body.setters || []).some(x => x.id === me.id);
  const saRow = (sa.body.setters || []).find(x => x.id === me.id);
  s['Setter Activity: listed | setter-era activities shown'] = `${inSA ? 'yes' + (saRow?.now_role && saRow.now_role !== 'setter' ? ' (now ' + saRow.now_role + ')' : '') : 'NO'} | ${(sa.body.activities || []).filter(a => a.rep_id === me.id).length}`;
  // High Table: Rep Activity (7 days)
  const ra = await api('/api/admin/rep-activity', adminTok, { start: weekAgo, end: today });
  const r = (ra.body.reps || []).find(x => x.id === me.id);
  s['Rep Activity: role | activities | allocated | follow-ups'] = r ? `${r.role} | ${r.summary.activities} | ${r.summary.allocated} | ${r.summary.followUpsScheduled}` : 'not listed';
  // Allocate / Pull back panel
  const al = await api('/api/admin/prospects/allocate', adminTok);
  const a = (al.body.reps || []).find(x => x.id === me.id);
  s['Allocate/Pull back: role | assigned | untouched (from allocations)'] = a ? `${a.role} | ${a.assigned} | ${a.untouched} (${a.untouchedAllocated})` : 'not listed';
  // High Table Rep Management lists (client-side filters on profiles.role)
  s['High Table list they appear in'] = role === 'setter' ? 'Setters section' : (role === 'rep' || role === 'vp_sales') ? 'Reps "Performance" section' : 'neither';
  // Paid clients (x/6) and 12-month milestone MRR, same definition as lib/compensation.ts
  const { data: ce } = await admin.from('commission_earnings').select('sales!inner(client_id, plan_price, sold_at)').eq('rep_id', me.id);
  const firstByClient = new Map();
  for (const r of ce || []) { const x = r.sales; const prev = firstByClient.get(x.client_id); if (!prev || x.sold_at < prev.sold_at) firstByClient.set(x.client_id, x); }
  s['Paid clients (x/6) | 12-month MRR counted'] = `${firstByClient.size}/6 | $${[...firstByClient.values()].reduce((t, x) => t + Number(x.plan_price), 0)}`;
  const { data: hist } = await admin.from('role_history').select('role, ended_at').eq('user_id', me.id).order('started_at');
  s['Role history'] = (hist || []).map(h => h.role + (h.ended_at ? ' (ended)' : ' (current)')).join(' -> ') || 'none';
  s['Rep Activity split by role at the time'] = r?.byRole ? Object.entries(r.byRole).map(([k, v]) => `${k}: ${v.activities}`).join(', ') : 'n/a';
  // Data attached by id
  const [acts, asg, fu, rc, bk] = await Promise.all([
    admin.from('prospect_activities').select('id', { count: 'exact', head: true }).eq('rep_id', me.id),
    admin.from('prospect_assignments').select('id', { count: 'exact', head: true }).eq('to_rep_id', me.id),
    admin.from('prospects').select('id', { count: 'exact', head: true }).eq('rep_id', me.id).not('follow_up_date', 'is', null),
    admin.from('rep_compensation').select('comp_track').eq('rep_id', me.id).maybeSingle(),
    admin.from('clients').select('booked_by_setter_id').eq('business_name', PREFIX + ' Client').maybeSingle(),
  ]);
  s['DB by id: activities | allocations | follow-ups | comp track'] = `${acts.count} | ${asg.count} | ${fu.count} | ${rc.data?.comp_track}`;
  s['Setter-sourced client: booked_by_setter_id is them'] = bk.data?.booked_by_setter_id === me.id;
  return s;
}

async function run() {
  await cleanup();
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').single();
  const adminS = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const { data: u } = await admin.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true, user_metadata: { full_name: 'Promo Test Setter' } });
  await admin.from('profiles').upsert({ id: u.user.id, email: EMAIL, full_name: 'Promo Test Setter', role: 'setter' });
  const me = await signIn(EMAIL, PW);

  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  const { data: res, error: pErr } = await admin.from('prospects').insert([1, 2, 3, 4].map(i => ({ rep_id: owner.id, company_name: `${PREFIX} Reserve ${i}`, status: 'Not Contacted', created_at: old, updated_at: old }))).select('id, company_name');
  if (pErr) throw new Error('prospects: ' + pErr.message);
  res.sort((x, y) => x.company_name.localeCompare(y.company_name));
  const { data: alloc, error: aErr } = await admin.rpc('allocate_prospects', { p_admin_id: adminS.id, p_reserve_id: owner.id, p_prospect_ids: res.slice(0, 3).map(r => r.id), p_allocations: [{ rep_id: me.id, count: 3 }], p_dry_run: false });
  if (aErr) throw new Error('allocate: ' + aErr.message);
  await admin.from('prospects').insert({ rep_id: me.id, company_name: `${PREFIX} Own`, status: 'Not Contacted' });
  const fu = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const ins = await me.c.from('prospect_activities').insert([
    { prospect_id: res[0].id, rep_id: me.id, type: 'Call', outcome: 'Callback', notes: 'Call back Thursday', follow_up_date: fu },
    { prospect_id: res[1].id, rep_id: me.id, type: 'Call', outcome: 'Booked', notes: 'Demo booked' },
    { prospect_id: res[1].id, rep_id: me.id, type: 'Email', outcome: 'Sent intro', notes: 'Sent deck' },
  ]);
  if (ins.error) throw new Error('activities: ' + ins.error.message);
  await admin.from('prospects').update({ follow_up_date: fu }).eq('id', res[0].id);
  const ap = await admin.from('appointments').insert({ setter_id: me.id, assigned_to: adminS.id, business_name: `${PREFIX} Reserve 2`, contact_name: 'Pat Example', scheduled_date: fu, scheduled_time: '10:00 AM', status: 'Scheduled' });
  if (ap.error) throw new Error('appointment: ' + ap.error.message);
  const cl = await admin.from('clients').insert({ business_name: `${PREFIX} Client`, rep_id: me.id, status: 'Active', plan: 'Starter Monthly' });
  if (cl.error) throw new Error('client: ' + cl.error.message);
  await admin.from('rep_compensation').insert({ rep_id: me.id, comp_track: 'setter_training', rep_started_at: old });
  const { data: client2 } = await admin.from('clients').insert({ business_name: `${PREFIX} Client 2`, rep_id: adminS.id, booked_by_setter_id: me.id, status: 'Active', plan: 'Grow' }).select('id').single();
  const { data: client1 } = await admin.from('clients').select('id').eq('business_name', `${PREFIX} Client`).single();
  for (const [cid, plan] of [[client1.id, 'starter_v2'], [client2.id, 'grow']]) {
    const { error: sErr } = await adminS.c.rpc('record_sale', { p_client_id: cid, p_rep_id: me.id, p_plan_slug: plan, p_idempotency_key: crypto.randomUUID(), p_prospect_id: null, p_setter_id: me.id, p_closer_id: adminS.id, p_sold_at: new Date().toISOString() });
    if (sErr) throw new Error('record_sale: ' + sErr.message);
  }
  const lr = await api('/api/lead-requests', me.token, { prospectId: res[3].id, note: 'test' });

  const before = await snapshot(me, adminS.token);
  if (process.argv.includes('--direct')) {
    const { error: upErr } = await admin.from('profiles').update({ role: 'rep' }).eq('id', me.id);
    if (upErr) throw new Error('promote: ' + upErr.message);
  } else {
    const pr = await api('/api/admin/change-role', adminS.token, { userId: me.id, role: 'rep', effectiveDate: today, note: 'test promotion' });
    if (pr.status !== 200) throw new Error('change-role: ' + pr.status + ' ' + JSON.stringify(pr.body));
  }
  // One activity logged after the promotion, as a rep.
  await new Promise(r => setTimeout(r, 1000));
  const post = await me.c.from('prospect_activities').insert({ prospect_id: res[2].id, rep_id: me.id, type: 'Call', outcome: 'No Answer', notes: 'as rep' });
  if (post.error) throw new Error('post-promotion activity: ' + post.error.message);
  const after = await snapshot(me, adminS.token);
  const blocked = await api('/api/admin/change-role', me.token, { userId: me.id, role: 'vp_sales' });
  const future = await api('/api/admin/change-role', adminS.token, { userId: me.id, role: 'setter', effectiveDate: '2099-01-01' });

  // A new prospect added after promotion: reps insert directly (setters are forced through the dup-checked API).
  const direct = await me.c.from('prospects').insert({ rep_id: me.id, company_name: `${PREFIX} Direct After`, status: 'Not Contacted' });

  console.log(`\nSetup: allocated ${alloc.assigned[0].count}, lead request -> ${lr.status}\n`);
  const w = Math.max(...Object.keys(before).map(k => k.length));
  console.log('What'.padEnd(w), '| BEFORE (setter)'.padEnd(46), '| AFTER (rep)');
  console.log('-'.repeat(w + 100));
  for (const k of Object.keys(before)) {
    const b = String(before[k]), a = String(after[k]);
    console.log(k.padEnd(w), '| ' + b.padEnd(44), '| ' + a + (a !== b ? '   <-- changed' : ''));
  }
  console.log(`\nChange-role as the (non-admin) user: ${blocked.status} | future effective date -> ${future.status} ${future.body.error || ''}`);
  console.log(`After promotion, direct prospect insert as the user (bypasses the duplicate-checked API): ${direct.error ? 'blocked: ' + direct.error.message : 'allowed'}`);
  await cleanup();
  console.log('Cleaned up test data.');
}
run().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
