// Calendar blocked slots + Cancel demo (migrations/031, lib/slots.ts,
// /api/admin/cancel-demo) against STAGING. Fictional data on a far-future date.
//
//   1. Start the app against staging:  set -a; . ./.env.staging; set +a; npm run dev
//   2. In another shell:               node --env-file=.env.staging scripts/test-blocked-slots.mjs
//
// Staging has no Google credentials, so a demo WITH a Meet link exercises the
// "Google failed -> nothing changed in Setera" path; the real Google delete
// can only be checked on a deployment that has the credentials.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, APP = process.env.APP_URL || 'http://localhost:3000';
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
const token = s.session.access_token;
const admin = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
const me = s.user.id;
const DATE = '2031-02-12', PREFIX = 'Test Fictional Blocked Slot';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };

// Same conditional updates as lib/slots.ts
const SA = () => admin.from('setter_availability');
const claim = async id => { const { data, error } = await SA().update({ is_booked: true }).eq('id', id).eq('is_booked', false).select('id'); return !error && data.length === 1; };
const block = async (ids, note) => { const { data } = await SA().update({ is_booked: true, is_blocked: true, blocked_note: note || null }).in('id', ids).eq('is_booked', false).select('id'); return (data || []).map(r => r.id); };
const unblock = async id => { const { data } = await SA().update({ is_booked: false, is_blocked: false, blocked_note: null }).eq('id', id).eq('is_blocked', true).select('id'); return (data || []).length === 1; };
const get = async id => (await service.from('setter_availability').select('*').eq('id', id).single()).data;
const api = (method, body, q = '') => fetch(APP + '/api/admin/cancel-demo' + q, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

async function cleanup() {
  await service.from('appointments').delete().like('business_name', PREFIX + '%');
  await service.from('setter_availability').delete().eq('date', DATE).eq('owned_by', me);
}
await cleanup();
const slot = async (time, booked = false) => (await admin.from('setter_availability').insert({ date: DATE, time_slot: time, is_booked: booked, created_by: me, owned_by: me }).select('*').single()).data;
const appt = async (slotId, time, meet = null) => (await admin.from('appointments').insert({ business_name: `${PREFIX} ${time}`, contact_name: 'Pat Example', phone: '555-0100', scheduled_date: DATE, scheduled_time: time, availability_id: slotId, assigned_to: me, setter_id: me, status: 'Scheduled', source: 'test', meet_link: meet }).select('*').single()).data;

console.log('\nBlock / unblock one slot');
const a = await slot('9:00 AM');
check('blocking an open slot works', (await block([a.id], 'dentist')).length === 1);
let r = await get(a.id);
check('blocked = booked + blocked, note kept', r.is_booked && r.is_blocked && r.blocked_note === 'dentist', JSON.stringify(r));
const openList = (await admin.from('setter_availability').select('id').eq('date', DATE).eq('is_booked', false)).data;
check('blocked slot is missing from the "open slots" list every picker uses', !openList.some(x => x.id === a.id));
check('a booking cannot claim a blocked slot', (await claim(a.id)) === false);
const bad = await SA().update({ is_booked: false }).eq('id', a.id).select('id');
check('database refuses a blocked slot that looks open', !!bad.error, bad.error?.message || 'updated');
check('unblock works', await unblock(a.id));
r = await get(a.id);
check('unblock: booked false, blocked false, note cleared', !r.is_booked && !r.is_blocked && r.blocked_note === null, JSON.stringify(r));

console.log('\nRace: block vs booking on the same slot');
const b = await slot('10:00 AM');
const [won, blockedIds] = await Promise.all([claim(b.id), block([b.id], 'race')]);
check('exactly one of booking / block wins', (won ? 1 : 0) + blockedIds.length === 1, `claim ${won}, block ${blockedIds.length}`);

console.log('\nUnblock never frees a real booking');
const c = await slot('11:00 AM', true);
check('unblock on a booked slot does nothing', (await unblock(c.id)) === false && (await get(c.id)).is_booked);

console.log('\nRange block skips booked');
const d1 = await slot('1:00 PM'), d2 = await slot('2:00 PM', true), d3 = await slot('3:00 PM');
const got = await block([d1.id, d3.id], 'client call');   // the app sends only the open ones (planRangeBlock)
check('the two open slots are blocked with one shared note', got.length === 2 && (await get(d1.id)).blocked_note === 'client call' && (await get(d3.id)).blocked_note === 'client call');
check('the booked slot in between is untouched', (await get(d2.id)).is_booked && !(await get(d2.id)).is_blocked);

console.log('\nClear day leaves blocked slots alone');
const e = await slot('4:00 PM');
await admin.from('setter_availability').delete().eq('date', DATE).eq('is_booked', false);   // what Clear day runs
check('open slot deleted, blocked slots kept', !(await get(e.id)) && !!(await get(d1.id)) && (await get(d1.id)).is_blocked);

console.log('\nCancel demo API');
const ping = await fetch(APP).catch(() => null);
if (!ping) console.log('  SKIP app not running at ' + APP);
else {
  const f = await slot('5:00 PM', true);
  const fa = await appt(f.id, '5:00 PM');
  const info = await api('GET', null, '?appointmentId=' + fa.id);
  check('invite lookup: no Meet link -> no emails', info.status === 200 && info.body.hasMeetLink === false && info.body.inviteEmails.length === 0, JSON.stringify(info.body));
  const res = await api('POST', { appointmentId: fa.id, notify: true });
  check('cancel without a Google event succeeds with a warning', res.status === 200 && res.body.warnings.some(w => w.includes('no Google event')), JSON.stringify(res.body));
  const fa2 = (await service.from('appointments').select('status').eq('id', fa.id).single()).data;
  check('appointment kept, marked Cancelled', fa2?.status === 'Cancelled');
  check('slot is open again', !(await get(f.id)).is_booked);
  const again = await api('POST', { appointmentId: fa.id, notify: true });
  check('cancelling twice is refused', again.status === 409, JSON.stringify(again.body));

  const g = await slot('6:00 PM', true);
  const ga = await appt(g.id, '6:00 PM', 'https://meet.google.com/test-fictional-xyz');
  const gres = await api('POST', { appointmentId: ga.id, notify: true });
  check('Google failure -> error shown', gres.status >= 500 && /Nothing was changed in Setera/.test(gres.body.error || ''), JSON.stringify(gres.body));
  const ga2 = (await service.from('appointments').select('status').eq('id', ga.id).single()).data;
  check('...and the demo is still Scheduled, slot still booked', ga2?.status === 'Scheduled' && (await get(g.id)).is_booked);

  console.log('\nSetters/reps can cancel only their own demos');
  if (!process.env.TEST_SETTER_EMAIL || !process.env.TEST_REP_EMAIL) console.log('  SKIP TEST_SETTER_/TEST_REP_ accounts not set');
  else {
    const login = async (e, p) => (await createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: e, password: p })).data;
    const casey = await login(process.env.TEST_SETTER_EMAIL, process.env.TEST_SETTER_PASSWORD), jordan = await login(process.env.TEST_REP_EMAIL, process.env.TEST_REP_PASSWORD);
    const as = (sess, method, body, q = '') => fetch(APP + '/api/admin/cancel-demo' + q, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sess.session.access_token }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const h = await slot('7:00 PM', true);
    const ha = (await service.from('appointments').insert({ business_name: `${PREFIX} 7:00 PM`, contact_name: 'Pat Example', scheduled_date: DATE, scheduled_time: '7:00 PM', availability_id: h.id, assigned_to: casey.user.id, setter_id: null, status: 'Scheduled', source: 'test' }).select('*').single()).data;
    const peek = await as(jordan, 'GET', null, '?appointmentId=' + ha.id);
    check("another rep can't read the invite on someone else's demo", peek.status === 404, JSON.stringify(peek.body));
    const steal = await as(jordan, 'POST', { appointmentId: ha.id, notify: false });
    check("another rep can't cancel it", steal.status === 404 && (await service.from('appointments').select('status').eq('id', ha.id).single()).data.status === 'Scheduled', JSON.stringify(steal.body));
    const own = await as(casey, 'POST', { appointmentId: ha.id, notify: false });
    check('the assigned rep can cancel it', own.status === 200 && (await service.from('appointments').select('status').eq('id', ha.id).single()).data.status === 'Cancelled', JSON.stringify(own.body));
    check('...and the slot reopens', !(await get(h.id)).is_booked);
  }

  console.log('\nReschedule');
  const rs = (body, tok = token) => fetch(APP + '/api/admin/reschedule-demo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const apptRow = async id => (await service.from('appointments').select('*').eq('id', id).single()).data;
  const r1 = await slot('8:00 AM', true), r2 = await slot('8:30 AM'), r3 = await slot('8:45 AM', true);
  const ra = await appt(r1.id, '8:00 AM');
  const ok = await rs({ appointmentId: ra.id, newSlotId: r2.id });
  const ra2 = await apptRow(ra.id);
  check('reschedule (no Google event) moves the demo', ok.status === 200 && ra2.availability_id === r2.id && ra2.scheduled_time === '8:30 AM' && ra2.scheduled_date === DATE, JSON.stringify(ok.body));
  check('...new slot booked, old slot open again', (await get(r2.id)).is_booked && !(await get(r1.id)).is_booked);
  check('...with a "nobody was emailed" warning', (ok.body.warnings || []).some(w => w.includes('no Google event')));
  const same = await rs({ appointmentId: ra.id, newSlotId: r2.id });
  check('moving to the slot it is already in is refused', same.status === 400, JSON.stringify(same.body));
  const taken = await rs({ appointmentId: ra.id, newSlotId: r3.id });
  check('moving to a taken slot is refused, nothing changes', taken.status === 409 && (await apptRow(ra.id)).availability_id === r2.id && (await get(r3.id)).is_booked, JSON.stringify(taken.body));
  const r4 = await slot('8:15 AM'); await block([r4.id], 'busy');
  const toBlocked = await rs({ appointmentId: ra.id, newSlotId: r4.id });
  check('moving into a blocked slot is refused', toBlocked.status === 409 && (await get(r4.id)).is_blocked, JSON.stringify(toBlocked.body));

  const m1 = await slot('7:30 AM', true), m2 = await slot('7:45 AM');
  const ma = await appt(m1.id, '7:30 AM', 'https://meet.google.com/test-fictional-abc');
  const gfail = await rs({ appointmentId: ma.id, newSlotId: m2.id });
  const ma2 = await apptRow(ma.id);
  check('Google failure -> error shown', gfail.status >= 500 && /Nothing was changed in Setera/.test(gfail.body.error || ''), JSON.stringify(gfail.body));
  check('...demo still in its old slot, new slot released, old slot still booked', ma2.availability_id === m1.id && ma2.scheduled_time === '7:30 AM' && !(await get(m2.id)).is_booked && (await get(m1.id)).is_booked);
  check('...Meet link untouched', ma2.meet_link === 'https://meet.google.com/test-fictional-abc');

  if (process.env.TEST_SETTER_EMAIL && process.env.TEST_REP_EMAIL) {
    const login = async (e, p) => (await createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: e, password: p })).data;
    const jordan = await login(process.env.TEST_REP_EMAIL, process.env.TEST_REP_PASSWORD);
    const steal = await rs({ appointmentId: ra.id, newSlotId: r1.id }, jordan.session.access_token);
    check("another rep can't reschedule someone else's demo", steal.status === 404 && (await apptRow(ra.id)).availability_id === r2.id && !(await get(r1.id)).is_booked, JSON.stringify(steal.body));
  }

  const noauth = await fetch(APP + '/api/admin/cancel-demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: ga.id }) });
  check('cancel without a session is refused', noauth.status === 401);
}

await cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
