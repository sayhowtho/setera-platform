// Verifies "Callbacks due" (High Table Prospects toggle, lib/prospect-queries.ts)
// and the rep portal's Follow-ups Due card against STAGING, signed in as each
// role so RLS applies. Seeds prospects tagged source='staging-callbacks-test'
// for the admin, a rep and a setter, and leaves them for a look in the UI.
// Run:      node --env-file=.env.staging scripts/test-callbacks-due.mjs
// Clean up: node --env-file=.env.staging scripts/test-callbacks-due.mjs --cleanup

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SOURCE = 'staging-callbacks-test';
// Same rules as lib/followups.ts / lib/prospect-queries.ts.
const EXCLUDED_IN = '("Closed Won","Closed Lost")';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };
const yesterdayEvening = () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0); return d.toISOString(); };
const localDate = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toLocaleDateString('en-CA'); };

async function signIn(email, password) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  return c;
}
async function profileId(email) {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data.id;
}

async function cleanup() {
  const { error, count } = await service.from('prospects').delete({ count: 'exact' }).eq('source', SOURCE);
  if (error) throw error;
  console.log('Removed ' + count + ' seeded prospects.');
}

// Per owner: [label, follow-up offset in days (null = none), status, do_not_contact, expected in list]
const CASES = [
  ['Due Today', 0, 'Contacted', false, true],
  ['Overdue 3d', -3, 'Interested', false, true],
  ['Overdue 10d', -10, 'Follow Up Required', false, true],
  ['Tomorrow', 1, 'Contacted', false, false],
  ['No Date', null, 'Contacted', false, false],
  ['Overdue Won', -2, 'Closed Won', false, false],
  ['Today Lost', 0, 'Closed Lost', false, false],
  ['Overdue DNC', -2, 'Contacted', true, false],
];

async function seed(owners) {
  const rows = owners.flatMap(([tag, id]) => CASES.map(([label, off, status, dnc]) => ({
    company_name: 'ZZ CB ' + tag + ' ' + label, rep_id: id, status, do_not_contact: dnc, source: SOURCE,
    follow_up_date: off === null ? null : localDate(off), trade: 'Roofing', city: 'Regina', province: 'SK',
    // Last Contact check: yesterday 8 pm local should read "1d ago", not "Today".
    last_contacted_at: label === 'Due Today' ? yesterdayEvening() : null,
  })));
  const { error } = await service.from('prospects').insert(rows);
  if (error) throw error;
}

// The High Table query with a Callbacks option on (prospectsQuery + loadProspectsPage order).
// mode: undefined = Callbacks due (today or earlier), 'today', 'overdue'.
const highTable = (c, rep, today, mode) => {
  let q = c.from('prospects').select('company_name, follow_up_date, rep_id', { count: 'exact' }).eq('source', SOURCE);
  if (rep) q = q.eq('rep_id', rep);
  q = mode === 'today' ? q.eq('follow_up_date', today) : mode === 'overdue' ? q.lt('follow_up_date', today) : q.lte('follow_up_date', today);
  return q.not('status', 'in', EXCLUDED_IN).not('do_not_contact', 'is', true)
    .order('follow_up_date', { ascending: true }).order('created_at', { ascending: false }).order('id');
};
// The rep card (app/rep/page.tsx loadFollowUpsDue): today, then overdue oldest-first.
async function repCard(c, ownerId, today) {
  const base = () => c.from('prospects').select('company_name, follow_up_date, rep_id').eq('source', SOURCE).eq('rep_id', ownerId).not('status', 'in', EXCLUDED_IN).not('do_not_contact', 'is', true);
  const [t, o] = await Promise.all([base().eq('follow_up_date', today).order('created_at', { ascending: false }), base().lt('follow_up_date', today).order('follow_up_date', { ascending: true })]);
  return [...t.data, ...o.data];
}
const names = rows => rows.map(r => r.company_name.replace(/^ZZ CB \w+ /, ''));

async function run() {
  if (process.argv.includes('--cleanup')) return cleanup();
  await cleanup();
  const today = localDate();
  const ids = { Admin: await profileId(process.env.ADMIN_EMAIL), Rep: await profileId(process.env.TEST_REP_EMAIL), Setter: await profileId(process.env.TEST_SETTER_EMAIL) };
  await seed(Object.entries(ids));
  const expected = ['Overdue 10d', 'Overdue 3d', 'Due Today'];
  console.log('Seeded ' + CASES.length * 3 + ' prospects, today = ' + today);

  console.log('\nHigh Table (admin)');
  const adminC = await signIn(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  const mine = await highTable(adminC, ids.Admin, today);
  check('own callbacks: exactly the 3 due, oldest first', JSON.stringify(names(mine.data)) === JSON.stringify(expected), names(mine.data).join(', '));
  check('count matches', mine.count === 3, String(mine.count));
  const all = await highTable(adminC, null, today);
  check('All Reps: 3 per owner (9)', all.count === 9, String(all.count));
  const repOnly = await highTable(adminC, ids.Rep, today);
  check('pick a rep: only that rep', repOnly.data.every(r => r.rep_id === ids.Rep) && repOnly.count === 3);
  const todayOnly = await highTable(adminC, ids.Admin, today, 'today');
  check('Today option: only today\'s', JSON.stringify(names(todayOnly.data)) === JSON.stringify(['Due Today']), names(todayOnly.data).join(', '));
  const overdueOnly = await highTable(adminC, ids.Admin, today, 'overdue');
  check('Overdue option: only overdue, oldest first', JSON.stringify(names(overdueOnly.data)) === JSON.stringify(['Overdue 10d', 'Overdue 3d']), names(overdueOnly.data).join(', '));
  check('Today + Overdue = Callbacks due', todayOnly.count + overdueOnly.count === mine.count);

  console.log('\nRep Management (admin): per-person today / overdue');
  const { data: dueRows } = await highTable(adminC, null, today);
  const tally = {};
  for (const r of dueRows) { const t = tally[r.rep_id] ??= { today: 0, overdue: 0 }; r.follow_up_date < today ? t.overdue++ : t.today++; }
  for (const [who, id] of Object.entries(ids)) check(who + ': 1 today, 2 overdue', tally[id]?.today === 1 && tally[id]?.overdue === 2, JSON.stringify(tally[id]));

  console.log('\nRep portal card (rep)');
  const repC = await signIn(process.env.TEST_REP_EMAIL, process.env.TEST_REP_PASSWORD);
  const card = await repCard(repC, ids.Rep, today);
  check('own only, today first then overdue oldest-first', JSON.stringify(names(card)) === JSON.stringify(['Due Today', 'Overdue 10d', 'Overdue 3d']), names(card).join(', '));
  check('no other owner\'s rows', card.every(r => r.rep_id === ids.Rep));
  const { data: oldCard } = await repC.from('prospects').select('rep_id').eq('source', SOURCE).eq('follow_up_date', today).not('status', 'in', EXCLUDED_IN);
  check('(old query, for contrast) leaked other owners\' rows', oldCard.some(r => r.rep_id !== ids.Rep), oldCard.length + ' rows');

  console.log('\nSetter (unchanged portal, same rules)');
  const setterC = await signIn(process.env.TEST_SETTER_EMAIL, process.env.TEST_SETTER_PASSWORD);
  const sCard = await repCard(setterC, ids.Setter, today);
  check('setter sees their 3', sCard.length === 3 && sCard.every(r => r.rep_id === ids.Setter));
  check('Rep Management matches each dashboard', card.length === tally[ids.Rep].today + tally[ids.Rep].overdue && sCard.length === tally[ids.Setter].today + tally[ids.Setter].overdue);

  console.log('\n' + pass + ' passed, ' + fail + ' failed. Seed left in place for the UI check; --cleanup removes it.');
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
