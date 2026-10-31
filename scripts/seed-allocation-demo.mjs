// Seeds STAGING with a small set of prospects + two reps for clicking through
// High Table → Prospects → Allocate / Pull back by hand (migrations/023).
//
//   node --env-file=.env.staging scripts/seed-allocation-demo.mjs            # seed (replaces a previous seed)
//   node --env-file=.env.staging scripts/seed-allocation-demo.mjs --add-ab   # add only the AB prospects
//   node --env-file=.env.staging scripts/seed-allocation-demo.mjs --cleanup  # remove everything it made
//
// Prospects are owned by the staging owner (the reserve), named TEST_PREFIX,
// and backdated 60 days so they start stale. Reps can't log in (random password).

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const TEST_PREFIX = 'Test Fictional Seed';
const EMAIL_PREFIX = 'alloc.seed.';
const REPS = [
  { key: 'alpha', name: 'Test Rep Alpha', role: 'rep' },
  { key: 'bravo', name: 'Test Setter Bravo', role: 'setter' },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function cleanup() {
  const { data: rows } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (rows || []).map(r => r.id);
  if (ids.length) {
    for (const t of ['lead_requests', 'prospect_assignments', 'prospect_activities', 'prospect_stage_history']) await admin.from(t).delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  const { data: profs } = await admin.from('profiles').select('id').like('email', EMAIL_PREFIX + '%');
  for (const p of profs || []) {
    await admin.from('prospect_assignments').delete().or(`from_rep_id.eq.${p.id},to_rep_id.eq.${p.id}`);
    await admin.from('profiles').delete().eq('id', p.id);
    await admin.auth.admin.deleteUser(p.id);
  }
  console.log(`Removed ${ids.length} seeded prospect(s) and ${(profs || []).length} seeded rep(s).`);
}

// Reserve prospects outside SK, for testing Province -> City narrowing.
// `--add-ab` inserts just these into an existing seed.
function albertaRows(reserve) {
  return [['Calgary', 4], ['Edmonton', 3]].flatMap(([city, n]) => Array.from({ length: n }, (_, i) => ({
    rep_id: reserve, company_name: `${TEST_PREFIX} AB ${city} ${i + 1}`, status: 'Not Contacted', province: 'AB', city, trade: ['Roofing', 'Plumbing', 'Electrical', 'Renovation'][i % 4],
  })));
}

async function addAlberta() {
  const { data: owners } = await admin.from('profiles').select('id').eq('role', 'owner');
  if (owners?.length !== 1) throw new Error('staging needs exactly one owner profile');
  await admin.from('prospects').delete().like('company_name', TEST_PREFIX + ' AB %');
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  const rows = albertaRows(owners[0].id).map(r => ({ ...r, created_at: old, updated_at: old }));
  const { error } = await admin.from('prospects').insert(rows);
  if (error) throw new Error('insert AB prospects: ' + error.message);
  console.log(`Added ${rows.length} AB reserve prospects (Calgary 4, Edmonton 3).`);
}

async function seed() {
  await cleanup();
  const { data: owners } = await admin.from('profiles').select('id, full_name').eq('role', 'owner');
  if (owners?.length !== 1) throw new Error('staging needs exactly one owner profile');
  const reserve = owners[0].id;

  const repIds = {};
  for (const r of REPS) {
    const email = EMAIL_PREFIX + r.key + '@heysetera.com';
    const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString('base64url') + 'Aa1!', email_confirm: true, user_metadata: { full_name: r.name } });
    if (error) throw new Error('create rep: ' + error.message);
    const { error: pErr } = await admin.from('profiles').upsert({ id: data.user.id, email, full_name: r.name, role: r.role });
    if (pErr) throw new Error('rep profile: ' + pErr.message);
    repIds[r.key] = data.user.id;
  }

  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  const cities = ['Regina', 'Saskatoon', 'Moose Jaw', 'Prince Albert'];
  const trades = ['Roofing', 'Plumbing', 'Electrical', 'Renovation'];
  const rows = [];
  for (let i = 1; i <= 10; i++) rows.push({ rep_id: reserve, company_name: `${TEST_PREFIX} Reserve ${String(i).padStart(2, '0')}`, status: 'Not Contacted', city: cities[i % 4], trade: trades[i % 4] });
  rows.push({ rep_id: reserve, company_name: `${TEST_PREFIX} Has Activity`, status: 'Not Contacted', city: 'Regina', trade: 'Roofing' });
  rows.push({ rep_id: reserve, company_name: `${TEST_PREFIX} DNC`, status: 'Not Contacted', city: 'Regina', trade: 'Plumbing', do_not_contact: true });
  rows.push({ rep_id: reserve, company_name: `${TEST_PREFIX} Already Contacted`, status: 'Contacted', city: 'Saskatoon', trade: 'Electrical' });
  rows.push({ rep_id: repIds.alpha, company_name: `${TEST_PREFIX} Alpha Own`, status: 'Not Contacted', city: 'Saskatoon', trade: 'Renovation' });
  rows.push(...albertaRows(reserve));
  // Stagger created_at so table order (newest first) is stable and predictable.
  rows.forEach((r, i) => { r.created_at = new Date(Date.parse(old) + (rows.length - i) * 60000).toISOString(); r.updated_at = old; });
  const { data: ins, error } = await admin.from('prospects').insert(rows).select('id, company_name');
  if (error) throw new Error('insert prospects: ' + error.message);
  const activityId = ins.find(p => p.company_name.endsWith('Has Activity')).id;
  const { error: aErr } = await admin.from('prospect_activities').insert({ prospect_id: activityId, rep_id: reserve, type: 'Call', outcome: 'No answer', notes: 'Seeded test activity' });
  if (aErr) throw new Error('insert activity: ' + aErr.message);

  console.log(`Seeded ${ins.length} prospects (reserve = ${owners[0].full_name}) and reps: ${REPS.map(r => r.name + ' (' + r.role + ')').join(', ')}.`);

  // Pull-back scenario, through the real allocate function so
  // prospect_assignments rows exist. Two batches to Alpha (so "oldest
  // allocation first" is visible), one to Bravo; Alpha works 2 of theirs.
  const { data: adminProf } = await admin.from('profiles').select('id').in('role', ['admin', 'owner']).order('role').limit(1).single();
  const reserveIds = ins.filter(p => /Reserve \d+$/.test(p.company_name)).sort((a, b) => a.company_name.localeCompare(b.company_name)).map(p => p.id);
  const alloc = async (ids, allocations) => {
    const { data, error } = await admin.rpc('allocate_prospects', { p_admin_id: adminProf.id, p_reserve_id: reserve, p_prospect_ids: ids, p_allocations: allocations, p_dry_run: false });
    if (error) throw new Error('allocate: ' + error.message);
    return data;
  };
  await alloc(reserveIds.slice(0, 4), [{ rep_id: repIds.alpha, count: 4 }]);
  await new Promise(r => setTimeout(r, 1100));
  await alloc(reserveIds.slice(4, 7), [{ rep_id: repIds.alpha, count: 2 }, { rep_id: repIds.bravo, count: 1 }]);
  // Alpha works two allocated prospects (one call, one email).
  const worked = reserveIds.slice(0, 2);
  const { error: wErr } = await admin.from('prospect_activities').insert([
    { prospect_id: worked[0], rep_id: repIds.alpha, type: 'Call', outcome: 'Left voicemail', notes: 'Seeded test activity' },
    { prospect_id: worked[1], rep_id: repIds.alpha, type: 'Email', outcome: 'Sent intro', notes: 'Seeded test activity' },
  ]);
  if (wErr) throw new Error('alpha activity: ' + wErr.message);
  // Bravo also has one they added themselves.
  const { error: bErr } = await admin.from('prospects').insert({ rep_id: repIds.bravo, company_name: `${TEST_PREFIX} Bravo Own`, status: 'Not Contacted', province: 'SK', city: 'Regina', trade: 'HVAC', created_at: old, updated_at: old });
  if (bErr) throw new Error('bravo own: ' + bErr.message);
  console.log('Scenario: Test Rep Alpha = 6 allocated (2 worked, 4 untouched) + 1 self-added; Test Setter Bravo = 1 allocated + 1 self-added, no activity; reserve keeps 3 Not Contacted + Has Activity / DNC / Contacted.');
}

(process.argv.includes('--cleanup') ? cleanup() : process.argv.includes('--add-ab') ? addAlberta() : seed()).catch(e => { console.error(e.message || e); process.exit(1); });
