// Calendar slot guards (migrations/030 + lib/slots.ts) against STAGING.
// Run: node --env-file=.env.staging scripts/test-slot-guards.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_EMAIL) { console.error('Run with --env-file=.env.staging'); process.exit(1); }
if (url.includes('your-production-project-ref')) { console.error('Refusing to run against production.'); process.exit(1); }
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
const admin = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: 'Bearer ' + s.session.access_token } } });
const me = s.user.id;
const DATE = '2031-01-15', PREFIX = 'Test Fictional Slot Guard';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (d ? '  — ' + d : '')); };
// same conditional update as lib/slots.ts claimSlot
const claim = async id => { const { data, error } = await admin.from('setter_availability').update({ is_booked: true }).eq('id', id).eq('is_booked', false).select('id'); return !error && data.length === 1; };

async function cleanup() {
  await service.from('appointments').delete().like('business_name', PREFIX + '%');
  await service.from('setter_availability').delete().eq('date', DATE).eq('owned_by', me);
}

await cleanup();
const slot = async (time, booked = false) => (await admin.from('setter_availability').insert({ date: DATE, time_slot: time, is_booked: booked, created_by: me, owned_by: me }).select('*').single());
const appt = (slotId, status = 'Scheduled', n = 1) => admin.from('appointments').insert({ business_name: `${PREFIX} ${n}`, contact_name: 'Pat Example', scheduled_date: DATE, scheduled_time: '10:00 AM', availability_id: slotId, assigned_to: me, setter_id: me, status, source: 'test' }).select('id').single();

console.log('\nOne slot per owner, date and time');
const booked = (await slot('10:00 AM', true)).data;
const dup = await slot('10:00 AM');
check('a second 10:00 AM slot on the same day is refused', dup.error?.code === '23505', dup.error ? dup.error.message : 'inserted ' + dup.data?.id);
const other = await slot('11:00 AM');
check('a different time on the same day is fine', !other.error, other.error?.message);

console.log('\nClear day never deletes a booked slot');
await admin.from('setter_availability').delete().eq('date', DATE).eq('is_booked', false);   // what Clear day runs
const left = (await service.from('setter_availability').select('id, time_slot, is_booked').eq('date', DATE).eq('owned_by', me)).data;
check('after Clear day only the booked 10:00 AM remains', left.length === 1 && left[0].id === booked.id && left[0].is_booked, JSON.stringify(left.map(x => x.time_slot + (x.is_booked ? ' booked' : ' open'))));

console.log('\nTwo people booking the same open slot');
const open = (await slot('1:00 PM')).data;
const [c1, c2] = await Promise.all([claim(open.id), claim(open.id)]);
check('exactly one claim wins', (c1 ? 1 : 0) + (c2 ? 1 : 0) === 1, `claims: ${c1}, ${c2}`);
check('claiming an already-booked slot fails', (await claim(booked.id)) === false);

console.log('\nOne live appointment per slot');
const a1 = await appt(open.id, 'Scheduled', 1);
const a2 = await appt(open.id, 'Scheduled', 2);
check('first appointment on the slot saves', !a1.error, a1.error?.message);
check('a second live appointment on the same slot is refused', a2.error?.code === '23505', a2.error ? a2.error.message : 'inserted');
await admin.from('appointments').update({ status: 'Cancelled' }).eq('id', a1.data.id);
const a3 = await appt(open.id, 'Scheduled', 3);
check('after a cancellation the slot can be booked again', !a3.error, a3.error?.message);

await cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
