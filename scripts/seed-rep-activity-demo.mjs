// Seeds STAGING for clicking through High Table → Rep Activity.
//
//   node --env-file=.env.staging scripts/seed-rep-activity-demo.mjs            # seed (replaces a previous seed)
//   node --env-file=.env.staging scripts/seed-rep-activity-demo.mjs --cleanup  # remove everything it made
//
// Three reps, times relative to now (Regina):
//   Test Rep Busy      10 allocated this morning, 8 activities today (6 calls, 2 emails),
//                      last one ~20 min ago, quick first touches, 2 future follow-ups.
//   Test Setter Quiet  5 allocated this morning, last activity ~6h ago (quiet flag at 4h),
//                      activities missing notes; one with no outcome too, but only where
//                      migration 026 isn't applied yet (it blocks blank outcomes).
//   Test Setter Idle   4 allocated 3 days ago, nothing since then, 2 overdue follow-ups.
// Allocations go through allocate_prospects, then moved_at is backdated.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const TEST_PREFIX = 'Test Fictional RA';
const EMAIL_PREFIX = 'ra.seed.';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const H = 3600000, M = 60000, D = 86400000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const reginaDate = ms => new Date(ms - 6 * H).toISOString().slice(0, 10);
const reginaTodayAt = h => Date.parse(reginaDate(now) + 'T00:00:00-06:00') + h * H;

async function cleanup() {
  const { data: rows } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (rows || []).map(r => r.id);
  if (ids.length) {
    for (const t of ['lead_requests', 'prospect_assignments', 'prospect_activities', 'prospect_stage_history']) await admin.from(t).delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  const { data: profs } = await admin.from('profiles').select('id').like('email', EMAIL_PREFIX + '%');
  for (const p of profs || []) {
    await admin.from('prospect_activities').delete().eq('rep_id', p.id);
    await admin.from('prospect_assignments').delete().or(`from_rep_id.eq.${p.id},to_rep_id.eq.${p.id}`);
    await admin.from('profiles').delete().eq('id', p.id);
    await admin.auth.admin.deleteUser(p.id);
  }
  console.log(`Removed ${ids.length} seeded prospect(s) and ${(profs || []).length} seeded rep(s).`);
}

async function seed() {
  await cleanup();
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').single();
  const { data: adminProf } = await admin.from('profiles').select('id').eq('role', 'admin').limit(1).single();
  const reps = {};
  for (const [key, name, role] of [['busy', 'Test Rep Busy', 'rep'], ['quiet', 'Test Setter Quiet', 'setter'], ['idle', 'Test Setter Idle', 'setter']]) {
    const email = EMAIL_PREFIX + key + '@heysetera.com';
    const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString('base64url') + 'Aa1!', email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw new Error('create rep: ' + error.message);
    await admin.from('profiles').upsert({ id: data.user.id, email, full_name: name, role });
    reps[key] = data.user.id;
  }

  const cities = [['Calgary', 'AB'], ['Edmonton', 'AB'], ['Winnipeg', 'MB'], ['Saskatoon', 'SK'], ['Regina', 'SK'], ['Kelowna', 'BC']];
  const trades = ['Roofing', 'Plumbing', 'Electrical', 'HVAC'];
  const rows = Array.from({ length: 22 }, (_, i) => ({
    rep_id: owner.id, company_name: `${TEST_PREFIX} ${['Summit', 'Prairie', 'Northwind', 'Ridgeline', 'Keystone', 'Cedar', 'Lakeside', 'Ironwood', 'Harbour', 'Maple'][i % 10]} ${trades[i % 4]} ${String(i + 1).padStart(2, '0')}`,
    status: 'Not Contacted', city: cities[i % 6][0], province: cities[i % 6][1], trade: trades[i % 4],
    created_at: iso(now - 20 * D + i * M), updated_at: iso(now - 20 * D),
  }));
  const { data: ins, error } = await admin.from('prospects').insert(rows).select('id, company_name').order('company_name');
  if (error) throw new Error('insert prospects: ' + error.message);
  const ids = ins.map(p => p.id);

  async function allocate(prospectIds, repId, movedAt) {
    const { data, error: e } = await admin.rpc('allocate_prospects', { p_admin_id: adminProf.id, p_reserve_id: owner.id, p_prospect_ids: prospectIds, p_allocations: [{ rep_id: repId, count: prospectIds.length }], p_dry_run: false });
    if (e) throw new Error('allocate: ' + e.message);
    await admin.from('prospect_assignments').update({ moved_at: iso(movedAt) }).eq('batch_id', data.batch_id);
    return prospectIds;
  }
  const busy = await allocate(ids.slice(0, 10), reps.busy, Math.min(reginaTodayAt(8), now - 4 * H));
  const quiet = await allocate(ids.slice(10, 15), reps.quiet, Math.min(reginaTodayAt(8.5), now - 7 * H));
  const idle = await allocate(ids.slice(15, 19), reps.idle, now - 3 * D);
  const busyAllocAt = Math.min(reginaTodayAt(8), now - 4 * H);

  const A = (rep, prospect, at, type, outcome, notes, follow = null) => ({ rep_id: rep, prospect_id: prospect, created_at: iso(at), type, outcome, notes, follow_up_date: follow });
  const fut = days => reginaDate(now + days * D);
  const past = days => reginaDate(now - days * D);
  const acts = [
    A(reps.busy, busy[0], busyAllocAt + 25 * M, 'Call', 'No Answer', 'Rang twice, no voicemail box set up.'),
    A(reps.busy, busy[1], busyAllocAt + 40 * M, 'Call', 'Voicemail', 'Left VM about missed-call recovery.\nMention Emily demo next time.'),
    A(reps.busy, busy[2], busyAllocAt + 70 * M, 'Call', 'Callback', 'Owner on a roof, call back Thursday after 3.', fut(2)),
    A(reps.busy, busy[3], busyAllocAt + 95 * M, 'Email', 'Sent intro', 'Sent the one-pager + demo link.'),
    A(reps.busy, busy[4], now - 2.5 * H, 'Call', 'Not Interested', 'Has a full-time receptionist.'),
    A(reps.busy, busy[5], now - 90 * M, 'Call', 'Booked', 'Demo booked for next week.', fut(6)),
    A(reps.busy, busy[6], now - 50 * M, 'Email', 'Replied, asked pricing', 'Wants Grow pricing for 2 locations.'),
    A(reps.busy, busy[7], now - 20 * M, 'Call', 'No Answer', ''),
    A(reps.quiet, quiet[0], now - 6 * H, 'Call', 'No Answer', ''),
    A(reps.quiet, quiet[2], now - 6 * H - 9 * M, 'Call', 'Voicemail', 'Left VM.'),
    A(reps.idle, idle[0], now - 3 * D + 2 * H, 'Call', 'Callback', 'Call back Monday.', past(2)),
    A(reps.idle, idle[1], now - 3 * D + 3 * H, 'Email', 'Sent intro', 'Intro email sent.', past(1)),
  ];
  const { error: aErr } = await admin.from('prospect_activities').insert(acts);
  if (aErr) throw new Error('activities: ' + aErr.message);
  // One legacy-style row with no outcome, for the "missing info" count. Migration 026
  // blocks new blank outcomes, so once it's applied this row is skipped.
  const legacy = A(reps.quiet, quiet[1], now - 6 * H - 5 * M, 'Call', '', '');
  const { error: lErr } = await admin.from('prospect_activities').insert(legacy);
  if (lErr) console.log('Skipped the no-outcome example row (blocked by migration 026, as intended).');
  else acts.push(legacy);
  // Follow-up dates on the prospects themselves (what overdue is based on), like Log Activity does.
  for (const a of acts.filter(a => a.follow_up_date)) await admin.from('prospects').update({ follow_up_date: a.follow_up_date, last_contacted_at: a.created_at }).eq('id', a.prospect_id);
  console.log(`Seeded 3 reps, ${ins.length} prospects (19 allocated), ${acts.length} activities.`);
}

(process.argv.includes('--cleanup') ? cleanup() : seed()).catch(e => { console.error(e.message || e); process.exit(1); });
