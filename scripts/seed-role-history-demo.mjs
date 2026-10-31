// Seeds STAGING for clicking through promotion / role history / milestones.
//
//   node --env-file=.env.staging scripts/seed-role-history-demo.mjs            # seed (replaces a previous seed)
//   node --env-file=.env.staging scripts/seed-role-history-demo.mjs --cleanup
//
//   Seed Setter Six      setter, 6 paid clients in one closed period -> "6/6 · eligible", a $2,000 sprint award
//   Seed Setter Four     setter, 4 paid clients  -> "4/6"
//   Seed Promoted Rep    setter for ~12 months, promoted to rep 14 days ago (change_role).
//                        10 clients: 9 first paid inside their 12-month window, 1 after it,
//                        1 with an upgrade sale (shows both milestone discrepancies).
//                        Activities and a booked demo as setter, plus activities as rep.
// The Promoted Rep's password is written to the scratchpad path printed at the end.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const PREFIX = 'Test Fictional RH';
const EMAIL_PREFIX = 'rh.seed.';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const D = 86400000, now = Date.now(), iso = ms => new Date(ms).toISOString();
const monthsAgo = m => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - m); return d.getTime(); };

async function cleanup() {
  const { data: profs } = await admin.from('profiles').select('id').like('email', EMAIL_PREFIX + '%');
  const ids = (profs || []).map(p => p.id);
  if (ids.length) {
    const { data: ces } = await admin.from('commission_earnings').select('id, sale_id').in('rep_id', ids);
    if (ces?.length) { await admin.from('commission_earnings').delete().in('id', ces.map(c => c.id)); await admin.from('sales').delete().in('id', ces.map(c => c.sale_id)); }
    await admin.from('bonus_awards').delete().in('rep_id', ids);
    await admin.from('appointments').delete().in('setter_id', ids);
    await admin.from('prospect_activities').delete().in('rep_id', ids);
  }
  const { data: ps } = await admin.from('prospects').select('id').like('company_name', PREFIX + '%');
  if (ps?.length) { await admin.from('prospect_stage_history').delete().in('prospect_id', ps.map(p => p.id)); await admin.from('prospects').delete().in('id', ps.map(p => p.id)); }
  await admin.from('clients').delete().like('business_name', PREFIX + '%');
  for (const id of ids) {
    await admin.from('rep_compensation_history').delete().eq('rep_id', id);
    await admin.from('rep_compensation').delete().eq('rep_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`Removed ${ids.length} seeded people and their data.`);
}

async function seed() {
  await cleanup();
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  const adminC = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + s.session.access_token } } });
  const adminId = s.user.id;
  const repPassword = 'Rh-' + randomBytes(9).toString('base64url') + '!A1';

  async function person(key, name, startedMonthsAgo, password) {
    const email = EMAIL_PREFIX + key + '@heysetera.com';
    const { data, error } = await admin.auth.admin.createUser({ email, password: password || randomBytes(24).toString('base64url') + 'Aa1!', email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw new Error('create user: ' + error.message);
    const id = data.user.id;
    await admin.from('profiles').upsert({ id, email, full_name: name, role: 'setter' });
    const started = monthsAgo(startedMonthsAgo);
    await admin.from('role_history').update({ started_at: iso(started) }).eq('user_id', id).is('ended_at', null);
    await admin.from('rep_compensation').insert({ rep_id: id, comp_track: 'setter_training', rep_started_at: iso(started) });
    return { id, started };
  }
  const plans = ['starter_v2', 'grow', 'launch'];
  async function paidClients(p, n, firstAt, stepDays, opts = {}) {
    for (let i = 0; i < n; i++) {
      const { data: c } = await admin.from('clients').insert({ business_name: `${PREFIX} ${p.key} Client ${i + 1}`, rep_id: adminId, booked_by_setter_id: p.id, status: 'Active', plan: 'Starter' }).select('id').single();
      const soldAt = firstAt + i * stepDays * D;
      const { error } = await adminC.rpc('record_sale', { p_client_id: c.id, p_rep_id: p.id, p_plan_slug: plans[i % 3], p_idempotency_key: crypto.randomUUID(), p_prospect_id: null, p_setter_id: p.id, p_closer_id: adminId, p_sold_at: iso(soldAt) });
      if (error) throw new Error('record_sale: ' + error.message);
      if (opts.upgradeIndex === i) {
        const { error: e2 } = await adminC.rpc('record_sale', { p_client_id: c.id, p_rep_id: p.id, p_plan_slug: 'starter_v2', p_idempotency_key: crypto.randomUUID(), p_prospect_id: null, p_setter_id: p.id, p_closer_id: adminId, p_sold_at: iso(soldAt + 20 * D) });
        if (e2) throw new Error('record_sale upgrade: ' + e2.message);
      }
    }
  }

  const six = { key: 'Six', ...(await person('six', 'Seed Setter Six', 3)) };
  await paidClients(six, 6, now - 55 * D, 1); // all in one closed monthly period -> a sprint award with a due date
  const four = { key: 'Four', ...(await person('four', 'Seed Setter Four', 1)) };
  await paidClients(four, 4, now - 25 * D, 5);

  const pr = { key: 'Promoted', ...(await person('promoted', 'Seed Promoted Rep', 13, repPassword)) };
  await paidClients(pr, 9, pr.started + 15 * D, 33, { upgradeIndex: 2 }); // all 9 first paid inside the window; #3 also has an upgrade sale
  // one client first paid after the window closed (last month)
  { const { data: c } = await admin.from('clients').insert({ business_name: `${PREFIX} Promoted Client Late`, rep_id: adminId, booked_by_setter_id: pr.id, status: 'Active', plan: 'Grow' }).select('id').single();
    const { error } = await adminC.rpc('record_sale', { p_client_id: c.id, p_rep_id: pr.id, p_plan_slug: 'grow', p_idempotency_key: crypto.randomUUID(), p_prospect_id: null, p_setter_id: pr.id, p_closer_id: adminId, p_sold_at: iso(now - 20 * D) });
    if (error) throw new Error('late sale: ' + error.message); }
  // Prospects + activities + a demo as setter, then promote 14 days ago, then activities as rep.
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').single();
  const { data: ps } = await admin.from('prospects').insert([1, 2, 3, 4, 5].map(i => ({ rep_id: pr.id, company_name: `${PREFIX} Prospect ${i}`, status: 'Contacted', province: 'SK', city: 'Regina' }))).select('id');
  void owner;
  const act = (pid, at, type, outcome) => ({ prospect_id: pid, rep_id: pr.id, type, outcome, notes: 'seed', created_at: iso(at) });
  await admin.from('prospect_activities').insert([
    act(ps[0].id, now - 20 * D, 'Call', 'Callback'), act(ps[1].id, now - 18 * D, 'Call', 'Booked'), act(ps[2].id, now - 16 * D, 'Email', 'Sent intro'),
  ]);
  await admin.from('appointments').insert({ setter_id: pr.id, assigned_to: adminId, business_name: `${PREFIX} Prospect 2`, contact_name: 'Pat Example', scheduled_date: new Date(now - 15 * D).toISOString().slice(0, 10), scheduled_time: '10:00 AM', status: 'Showed', created_at: iso(now - 18 * D) });
  const { error: cr } = await admin.rpc('change_role', { p_user_id: pr.id, p_new_role: 'rep', p_admin_id: adminId, p_effective_at: iso(now - 14 * D), p_note: 'Hit 6 paid clients, chose to close' });
  if (cr) throw new Error('change_role: ' + cr.message);
  await admin.from('prospect_activities').insert([
    act(ps[3].id, now - 3 * D, 'Call', 'No Answer'), act(ps[4].id, now - 2 * 3600000, 'Call', 'Interested'),
  ]);

  const pwPath = new URL('../.seed-promoted-rep-password.txt', import.meta.url).pathname;
  writeFileSync(pwPath, repPassword + '\n');
  console.log('Seeded: Seed Setter Six (6 paid), Seed Setter Four (4 paid), Seed Promoted Rep (setter -> rep 14 days ago, 10 clients incl. 1 late + 1 upgrade).');
  console.log('Promoted Rep login: ' + EMAIL_PREFIX + 'promoted@example.com (password in ' + pwPath + ')');
}

(process.argv.includes('--cleanup') ? cleanup() : seed()).catch(e => { console.error(e.message || e); process.exit(1); });
