// Compensation engine vs the Sales Compensation Structure (migrations/028),
// against STAGING. Pure maths (periods, windows, tiers) is in lib/compensation.test.ts;
// this covers what lives in the database:
//   - record_sale(): every-10th counts DISTINCT credited clients (a separate
//     count per plan, #13); a repeat sale never counts or triggers; a client
//     who paid and later cancelled STILL counts; the override REPLACES the 15%
//   - credited_clients(): 10 clients with 11 sales = 10; only the person (or
//     an admin) can read it
//   - bonus_awards: a sprint award per period (not once ever); milestones once
// Run: node --env-file=.env.staging scripts/test-compensation.mjs

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PREFIX = 'Test Fictional Comp', EMAIL = 'comp.test.person@example.com', OTHER = 'comp.test.other@example.com', PW = 'Tmp-Comp-' + Date.now() + '!Aa1';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };

async function session(email, password) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  return { c, id: data.user.id };
}
async function cleanup() {
  // Order matters: earnings -> sales -> clients (booked_by_setter_id) -> people.
  const ids = [];
  for (const email of [EMAIL, OTHER]) {
    const { data: p } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (p) ids.push(p.id);
  }
  for (const id of ids) {
    const { data: ces } = await admin.from('commission_earnings').select('id, sale_id').eq('rep_id', id);
    if (ces?.length) { await admin.from('commission_earnings').delete().in('id', ces.map(c => c.id)); await admin.from('sales').delete().in('id', ces.map(c => c.sale_id)); }
    await admin.from('bonus_awards').delete().eq('rep_id', id);
    await admin.from('rep_compensation').delete().eq('rep_id', id);
  }
  await admin.from('clients').delete().like('business_name', PREFIX + '%');
  for (const id of ids) {
    const { error } = await admin.from('profiles').delete().eq('id', id);
    if (error) console.error('cleanup: profile delete failed:', error.message);
    await admin.auth.admin.deleteUser(id);
  }
}

async function run() {
  await cleanup();
  const A = await session(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const people = {};
  for (const email of [EMAIL, OTHER]) {
    const { data } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
    await admin.from('profiles').upsert({ id: data.user.id, email, full_name: email.split('@')[0], role: 'setter', is_demo: true });
    people[email] = data.user.id;
  }
  const me = people[EMAIL];
  await admin.from('rep_compensation').insert({ rep_id: me, comp_track: 'setter_training', rep_started_at: new Date(Date.now() - 40 * 86400000).toISOString() });

  const clients = [];
  for (let i = 1; i <= 21; i++) {
    const { data } = await admin.from('clients').insert({ business_name: `${PREFIX} ${String(i).padStart(2, '0')}`, rep_id: A.id, booked_by_setter_id: me, status: 'Active', plan: 'Starter' }).select('id').single();
    clients.push(data.id);
  }
  let t = Date.now() - 30 * 86400000;
  const sell = async (clientId, plan = 'starter_v2') => {
    t += 3600000;
    const { data, error } = await A.c.rpc('record_sale', { p_client_id: clientId, p_rep_id: me, p_plan_slug: plan, p_idempotency_key: randomUUID(), p_prospect_id: null, p_setter_id: me, p_closer_id: A.id, p_sold_at: new Date(t).toISOString() });
    if (error) throw new Error('record_sale: ' + error.message);
    return data.commission_earning;
  };

  console.log('\nEvery 10th paying client (Starter cycle)');
  const e = [];
  for (let i = 0; i < 9; i++) e.push(await sell(clients[i]));
  const repeat = await sell(clients[0]);               // client 1 again (repeat/upgrade): 10th SALE, 9 clients
  check('a repeat sale is not the 10th (10 sales, 9 clients)', repeat.is_milestone_override === false && Number(repeat.commission_amount) === 337.05, `${repeat.is_milestone_override} $${repeat.commission_amount}`);
  const tenth = await sell(clients[9]);                // 10th distinct client
  check('10th distinct paying client -> full $2,247 instead of 15%', tenth.is_milestone_override === true && Number(tenth.commission_amount) === 2247, `${tenth.is_milestone_override} $${tenth.commission_amount}`);
  check('the other nine paid 15% ($337.05)', e.every(x => !x.is_milestone_override && Number(x.commission_amount) === 337.05));

  const { data: cc } = await admin.rpc('credited_clients', { p_rep_id: me });
  check('credited_clients: 10 clients with 11 sales = 10 (shows as 10/6)', cc.length === 10 && cc.find(r => r.client_id === clients[0]).sales_count === 2, `rows ${cc.length}`);

  console.log('\nCancelled clients keep counting (credit is permanent once month 1 is paid)');
  for (let i = 10; i < 19; i++) await sell(clients[i]); // clients 11–19
  await admin.from('clients').update({ status: 'Cancelled' }).eq('id', clients[2]); // client 3 cancels later
  const { data: ccAfter } = await admin.rpc('credited_clients', { p_rep_id: me });
  check('cancellation is flagged but the client is still credited (19 rows, 1 flagged)', ccAfter.length === 19 && ccAfter.filter(r => r.cancelled).length === 1, `rows ${ccAfter.length}`);
  const tenthEarning = (await admin.from('commission_earnings').select('is_milestone_override, commission_amount').eq('sale_id', tenth.sale_id).single()).data;
  check('the earlier 10th-client override is not reversed', tenthEarning.is_milestone_override === true && Number(tenthEarning.commission_amount) === 2247);
  const twentieth = await sell(clients[19]);            // 20th client, even though client 3 cancelled
  check('20th client after a cancellation -> full $2,247 (cancellation doesn\'t shift the count)', twentieth.is_milestone_override === true && Number(twentieth.commission_amount) === 2247, `${twentieth.is_milestone_override} $${twentieth.commission_amount}`);
  const twentyFirst = await sell(clients[20]);
  check('21st client -> 15%', twentyFirst.is_milestone_override === false && Number(twentyFirst.commission_amount) === 337.05, `$${twentyFirst.commission_amount}`);

  console.log('\nWho can read credited_clients');
  const mine = await session(EMAIL, PW);
  const other = await session(OTHER, PW);
  const own = await mine.c.rpc('credited_clients', { p_rep_id: me });
  const theirs = await other.c.rpc('credited_clients', { p_rep_id: me });
  check('the person sees their own 21 clients (incl. 1 cancelled)', own.data?.length === 21 && own.data.filter(r => r.cancelled).length === 1, `${own.data?.length} ${own.error?.message || ''}`);
  check('another setter sees none of them', !theirs.error && theirs.data.length === 0, `${theirs.data?.length}`);

  console.log('\nSprint awards per period');
  const ins = (type, start) => A.c.from('bonus_awards').insert({ rep_id: me, bonus_type: type, amount: 1000, comp_track_at_award: 'setter_training', qualifying_window_start: start, qualifying_window_end: start, due_at: start });
  const p1 = await ins('sprint_30_day', '2026-09-23T06:00:00Z');
  const p2 = await ins('sprint_30_day', '2026-10-23T06:00:00Z');
  const p1again = await ins('sprint_30_day', '2026-09-23T06:00:00Z');
  check('sprint awarded for period 1 AND period 2 (not once ever)', !p1.error && !p2.error, p1.error?.message || p2.error?.message);
  check('the same period can\'t be awarded twice', p1again.error?.code === '23505', p1again.error?.message);
  const m1 = await ins('mrr_milestone_1', '2026-09-23T06:00:00Z');
  const m1again = await ins('mrr_milestone_1', '2026-10-23T06:00:00Z');
  check('a milestone is still awarded once per person', !m1.error && m1again.error?.code === '23505', m1again.error?.message);

  await cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
run().catch(async err => { console.error(err); await cleanup(); process.exit(1); });
