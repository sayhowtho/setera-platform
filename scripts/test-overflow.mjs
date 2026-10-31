// Overflow Early Access — end-to-end tests. STAGING ONLY.
//
//   1. Apply migrations to the staging Supabase project (schema dump + 005-009).
//   2. Start the app against staging:  set -a; . ./.env.staging; set +a; npm run dev
//   3. In another shell:               set -a; . ./.env.staging; set +a; node scripts/test-overflow.mjs
//
// Required env (in .env.staging, never .env.local):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   APP_URL (default http://localhost:3000),
//   TEST_SETTER_EMAIL/TEST_SETTER_PASSWORD (role rep), TEST_REP_EMAIL/TEST_REP_PASSWORD (role rep),
//   ADMIN_EMAIL/ADMIN_PASSWORD (role admin or owner)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = process.env;
const need = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_SETTER_EMAIL', 'TEST_SETTER_PASSWORD', 'TEST_REP_EMAIL', 'TEST_REP_PASSWORD', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
for (const k of need) if (!env[k]) { console.error('Missing env: ' + k); process.exit(2); }

// Hard guard: never run against the URL in .env.local (production).
try {
  const prod = readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  if (prod && prod === env.NEXT_PUBLIC_SUPABASE_URL) { console.error('REFUSING: NEXT_PUBLIC_SUPABASE_URL equals the production URL in .env.local'); process.exit(2); }
} catch {}

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, APP = env.APP_URL || 'http://localhost:3000';
const svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const em = (n) => `ovf-${run}-${n}@example.test`;

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra); } };
const section = (s) => console.log('\n' + s);

async function login(email, password) {
  const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login ' + email + ': ' + error.message);
  return { client: c, token: data.session.access_token, id: data.user.id };
}
const api = async (path, { token, method = 'POST', body, ip } = {}) => {
  const res = await fetch(APP + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text };
};
const repAdd = (t, b) => api('/api/overflow/rep-add', { token: t, body: { consent: true, ...b } });
const join = (b, ip) => api('/api/overflow/join', { body: b, ip: ip || `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
const importCsv = (t, csv) => api('/api/admin/overflow/import', { token: t, body: { csv } });
const row = async (email) => (await svc.from('overflow_waitlist').select('*').eq('email_normalized', email.trim().toLowerCase())).data?.[0];
const events = async (id) => (await svc.from('overflow_waitlist_events').select('*').eq('waitlist_id', id).order('created_at')).data ?? [];
const HDR = 'rep email,prospect email,business,contact name,date added,agreed_to_email\n';

const casey = await login(env.TEST_SETTER_EMAIL, env.TEST_SETTER_PASSWORD);
const jordan = await login(env.TEST_REP_EMAIL, env.TEST_REP_PASSWORD);
const admin = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);

section('Normalization & malformed emails (identical on all three paths)');
{
  const a = await repAdd(casey.token, { email: `  ${em('case').toUpperCase()}  ` });
  const b = await repAdd(casey.token, { email: em('case') });
  ok(a.json.status === 'added' && b.json.status === 'duplicate', 'case/whitespace variants dedupe', JSON.stringify([a.json, b.json]));
  const r = await row(em('case')); ok(r && r.email === r.email.trim(), 'stored email is trimmed');
  const n = (await svc.from('overflow_waitlist').select('id', { count: 'exact', head: true }).eq('email_normalized', em('case'))).count;
  ok(n === 1, 'exactly one row for case variants');
  for (const bad of ['nope', 'a@b', 'a b@c.com', '', 'x@@y.com', 'a@b..com', '@y.com']) {
    const pub = await join({ email: bad }); const rep = await repAdd(casey.token, { email: bad });
    const imp = await importCsv(admin.token, HDR + `${env.TEST_SETTER_EMAIL},"${bad}",Biz,Nm,2026-01-01,true\n`);
    ok(pub.status === 400 && rep.json.status === 'invalid_email' && imp.json.rows?.[0]?.status === 'failed_invalid_email',
      `malformed rejected on all 3 paths: ${JSON.stringify(bad)}`, JSON.stringify([pub.status, rep.json, imp.json.rows?.[0]?.status]));
  }
}

section('Concurrent duplicate submits');
{
  const e = em('conc');
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? repAdd(casey.token, { email: e }) : repAdd(jordan.token, { email: e }))));
  const added = rs.filter((r) => r.json.status === 'added').length;
  const n = (await svc.from('overflow_waitlist').select('id', { count: 'exact', head: true }).eq('email_normalized', e)).count;
  ok(added === 1 && n === 1 && rs.every((r) => r.status === 200), '12 concurrent → 1 row, 1 "added"', JSON.stringify(rs.map((r) => r.json.status)));
  const ev = await events((await row(e)).id);
  ok(ev.filter((x) => x.event_type === 'rep_submitted').length === 1 && ev.filter((x) => x.event_type === 'duplicate_submission').length === 11, 'events: 1 rep_submitted + 11 duplicate_submission');
}

section('Spoofing & authorization');
{
  const e = em('spoof');
  const r = await api('/api/overflow/rep-add', { token: casey.token, body: { email: e, consent: true, rep_id: jordan.id, originating_rep_id: jordan.id, repId: jordan.id } });
  const w = await row(e);
  ok(r.json.status === 'added' && w.originating_rep_id === casey.id, 'rep_id in body ignored; Casey credited', JSON.stringify(w?.originating_rep_id));
  ok((await repAdd(undefined, { email: em('x') })).status === 401, 'rep-add without token = 401');
  ok((await api('/api/overflow/rep-add', { token: casey.token, body: { email: em('nc'), consent: false } })).status === 400, 'rep-add consent=false = 400');
  const direct = await svc.rpc('overflow_ingest_one', { p_email: em('dbc'), p_business_name: null, p_contact_name: null, p_path: 'rep_quick_add', p_actor_user_id: casey.id, p_consent_confirmed: false });
  ok(!!direct.error && /consent/i.test(direct.error.message), 'DB rejects rep_quick_add without consent', direct.error?.message);
  const asRep = await casey.client.rpc('overflow_ingest_one', { p_email: em('rpc'), p_path: 'rep_quick_add', p_actor_user_id: jordan.id, p_consent_confirmed: true });
  ok(!!asRep.error, 'rep session cannot call ingest RPC directly', asRep.error?.message);
}

section('Endpoint access control (export/import/set-status)');
{
  for (const [name, p, m, b] of [['export', '/api/admin/overflow/export', 'GET'], ['import', '/api/admin/overflow/import', 'POST', { csv: HDR }],
    ['set-status', '/api/admin/overflow/set-status', 'POST', { waitlistId: '00000000-0000-0000-0000-000000000000', status: 'removed' }]]) {
    ok((await api(p, { method: m, body: b })).status === 401, `${name}: no token = 401`);
    ok((await api(p, { method: m, body: b, token: casey.token })).status === 403, `${name}: rep token = 403`);
    ok((await api(p, { method: m, body: b, token: 'garbage' })).status === 401, `${name}: bad token = 401`);
  }
  ok((await api('/api/admin/overflow/export', { method: 'GET', token: admin.token })).status === 200, 'export: admin token = 200');
  for (const p of ['get-team']) {
    ok((await api('/api/admin/' + p, { method: 'GET' })).status === 401, `admin/${p}: no token = 401`);
    ok((await api('/api/admin/' + p, { method: 'GET', token: casey.token })).status === 403, `admin/${p}: rep token = 403`);
    ok((await api('/api/admin/' + p, { method: 'GET', token: admin.token })).status === 200, `admin/${p}: admin token = 200`);
  }
  for (const p of ['invite-user', 'remove-user', 'toggle-user', 'contract-upload']) {
    ok((await api('/api/admin/' + p, { body: {} })).status === 401, `admin/${p}: no token = 401`);
    ok((await api('/api/admin/' + p, { body: {}, token: casey.token })).status === 403, `admin/${p}: rep token = 403`);
  }
  ok((await api('/api/admin/contract-file?historyId=x&field=sent', { method: 'GET' })).status === 401, 'admin/contract-file: no token = 401');
}

section('RLS: reps see only their own; cannot write or touch events');
{
  const e = em('rls'); await repAdd(casey.token, { email: e });
  const seenByJordan = await jordan.client.from('overflow_waitlist').select('id').eq('email_normalized', e);
  ok((seenByJordan.data ?? []).length === 0, "Jordan cannot read Casey's waitlist row");
  const seenByCasey = await casey.client.from('overflow_waitlist').select('id').eq('email_normalized', e);
  ok((seenByCasey.data ?? []).length === 1, 'Casey can read his own row');
  const evJordan = await jordan.client.from('overflow_waitlist_events').select('id').eq('waitlist_id', (await row(e)).id);
  ok((evJordan.data ?? []).length === 0, "Jordan cannot read Casey's events");
  const w = await row(e);
  const upd = await casey.client.from('overflow_waitlist_events').update({ event_type: 'status_changed' }).eq('waitlist_id', w.id).select();
  const del = await casey.client.from('overflow_waitlist_events').delete().eq('waitlist_id', w.id).select();
  ok(!(upd.data?.length) && !(del.data?.length), 'rep cannot update/delete events (no rows affected)');
  ok((await events(w.id)).length >= 1, 'events intact');
  ok(!!(await casey.client.from('overflow_waitlist_events').insert({ waitlist_id: w.id, event_type: 'status_changed', actor_type: 'rep' })).error, 'rep cannot insert events');
  ok(!!(await casey.client.from('overflow_waitlist').insert({ email: em('d'), email_normalized: em('d'), source: 'sales_rep', consent_basis: 'other', consent_captured_at: new Date().toISOString() })).error, 'rep cannot insert waitlist rows directly');
  await casey.client.from('overflow_waitlist').update({ status: 'removed' }).eq('id', w.id);
  ok((await row(e)).status === 'waitlisted', 'rep cannot change status');
  ok((await admin.client.from('overflow_waitlist_admin').select('id').eq('id', w.id)).data?.length === 1, 'admin can read via admin view');
  ok((await casey.client.from('overflow_waitlist_admin').select('id')).data?.length === 0, 'rep sees nothing in admin view');
  const svcUpd = await svc.from('overflow_waitlist_events').update({ event_type: 'status_changed' }).eq('waitlist_id', w.id);
  ok(!!svcUpd.error, 'events append-only even for service role', svcUpd.error?.message);
  ok(!!(await svc.from('overflow_waitlist').delete().eq('id', w.id)).error, 'waitlist hard-delete blocked even for service role');
}

section('Immutability triggers');
{
  const w = await row(em('spoof'));
  for (const [col, val] of [['originating_rep_id', jordan.id], ['originating_rep_email_snapshot', 'x@y.z'], ['originating_rep_name_snapshot', 'X'],
    ['source', 'website'], ['created_at', '2001-01-01T00:00:00Z'], ['email_normalized', 'zzz@example.test'], ['consent_basis', 'other']]) {
    const r = await svc.from('overflow_waitlist').update({ [col]: val }).eq('id', w.id);
    ok(!!r.error, `UPDATE ${col} fails`, r.error?.message);
  }
  const r = await svc.from('overflow_waitlist').update({ business_name: 'Filled' }).eq('id', w.id); ok(!r.error, 'enrichment of empty business_name allowed');
  const r2 = await svc.from('overflow_waitlist').update({ business_name: 'Overwrite' }).eq('id', w.id); ok(!!r2.error, 'overwrite of non-empty business_name blocked');
}

section('First touch wins (Casey / Jordan / website)');
{
  const e = em('ft'); await repAdd(casey.token, { email: e });
  const again = await repAdd(casey.token, { email: e });
  ok(again.json.status === 'duplicate' && !!again.json.originallyAddedAt, 'Casey resubmit → duplicate with original date');
  const a = await repAdd(jordan.token, { email: e, businessName: 'Acme Roofing' });
  const w = await row(e); const ev = await events(w.id);
  ok(w.originating_rep_id === casey.id, 'Casey stays originator after Jordan');
  const dup = ev.filter((x) => x.event_type === 'duplicate_submission');
  ok(dup.length === 2 && dup.some((x) => x.actor_user_id === jordan.id && x.metadata.rep.id === jordan.id), 'duplicate event names Jordan as actor');
  ok(w.business_name === 'Acme Roofing' && dup.some((x) => x.metadata.enriched?.business_name === 'Acme Roofing'), 'enrichment filled empty field and was logged');
  ok(!JSON.stringify(a.json).includes(jordan.id) && !JSON.stringify(again.json).includes(casey.id), 'duplicate response does not reveal reps');
  // website resubmits a Casey email
  const p = await join({ email: e, businessName: 'Different Name' });
  const w2 = await row(e);
  ok(p.status === 200 && w2.originating_rep_id === casey.id && w2.source === 'sales_rep' && w2.business_name === 'Acme Roofing', 'website resubmit: generic success, Casey stays originator, no overwrite');
  // website first, then Casey
  const e2 = em('webfirst'); await join({ email: e2 });
  await repAdd(casey.token, { email: e2 });
  const w3 = await row(e2); const ev3 = await events(w3.id);
  ok(w3.source === 'website' && w3.originating_rep_id === null, 'website first: source stays website');
  ok(ev3.some((x) => x.event_type === 'duplicate_submission' && x.actor_user_id === casey.id), "Casey's touch preserved in event metadata");
}

section('Public form: identical responses & rate limiting');
{
  const e = em('pub'); const ip = '203.0.113.7';
  const a = await join({ email: e }, ip), b = await join({ email: e }, ip), c = await join({ email: em('pub2') }, ip);
  ok(a.status === 200 && a.text === b.text && a.text === c.text, 'new vs existing → identical status and body', a.text + ' | ' + b.text);
  const hp = await join({ email: em('bot'), company_website: 'http://spam' });
  ok(hp.text === a.text && !(await row(em('bot'))), 'honeypot: same response, nothing stored');
  const ip2 = `198.51.100.${Math.floor(Math.random() * 200)}`; const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await join({ email: em('rl' + i) }, ip2)).status);
  ok(codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, '6th request from one IP = 429', JSON.stringify(codes));
  ok((await join({ email: em('rlother') }, `192.0.2.${Math.floor(Math.random() * 200)}`)).status === 200, 'different IP unaffected');
  await svc.from('overflow_rate_limit').update({ window_start: new Date(Date.now() - 2 * 3600e3).toISOString() }).like('bucket', 'overflow_join:%');
  ok((await join({ email: em('rlreset') }, ip2)).status === 200, 'window resets after it elapses');
}

section('Unsubscribe is permanent (public, rep, import)');
{
  const e = em('unsub'); await repAdd(casey.token, { email: e });
  const w = await row(e);
  const s = await api('/api/admin/overflow/set-status', { token: admin.token, body: { waitlistId: w.id, status: 'unsubscribed' } });
  ok(s.status === 200 && (await row(e)).status === 'unsubscribed' && (await row(e)).unsubscribed_at, 'admin can unsubscribe');
  const p = await join({ email: e }); const r = await repAdd(casey.token, { email: e });
  const i = await importCsv(admin.token, HDR + `${env.TEST_SETTER_EMAIL},${e},Biz,Nm,2026-01-01,true\n`);
  const after = await row(e);
  ok(p.status === 200 && p.json.message === "You're on the list", 'public: generic success');
  ok(r.json.status === 'cannot_add', "rep: neutral \"Can't add\"", JSON.stringify(r.json));
  ok(i.json.rows?.[0]?.status === 'skipped_unsubscribed' && i.json.counts.skipped_unsubscribed === 1, 'import: skipped_unsubscribed');
  ok(after.status === 'unsubscribed', 'still unsubscribed after all three');
  const revive = await svc.from('overflow_waitlist').update({ status: 'waitlisted' }).eq('id', w.id);
  ok(!!revive.error, 'DB blocks unsubscribed → waitlisted', revive.error?.message);
  // removed likewise
  const e2 = em('rem'); await repAdd(casey.token, { email: e2 });
  await api('/api/admin/overflow/set-status', { token: admin.token, body: { waitlistId: (await row(e2)).id, status: 'removed' } });
  await join({ email: e2 }); await repAdd(jordan.token, { email: e2 });
  ok((await row(e2)).status === 'removed', 'removed stays removed');
}

section('Location: optional, capped, enrich-only, never blocks');
{
  // never blocks a submission on any path
  const noLoc = await repAdd(casey.token, { email: em('loc0') });
  const pubNoLoc = await join({ email: em('loc0p') });
  ok(noLoc.json.status === 'added' && pubNoLoc.status === 200, 'rep + public submit fine without location');
  ok((await row(em('loc0'))).location === null, 'no location → null');
  ok((await repAdd(casey.token, { email: em('locblank'), location: '   ' })).json.status === 'added' && (await row(em('locblank'))).location === null, 'blank location stored as null');
  const long = 'x'.repeat(200);
  const capped = await repAdd(casey.token, { email: em('loclong'), location: '  ' + long + '  ' });
  ok(capped.json.status === 'added' && (await row(em('loclong'))).location.length === 120, 'over-length location trimmed + capped at 120 (submission still succeeds)');
  const pubCapped = await join({ email: em('loclongp'), location: long });
  ok(pubCapped.status === 200 && (await row(em('loclongp'))).location.length === 120, 'public: over-length location capped, not rejected');
  ok((await repAdd(casey.token, { email: em('locweird'), location: 'Saskatoon / 25km radius; SK' })).json.status === 'added', 'free text with punctuation accepted (no validation)');
  const dbLen = await svc.from('overflow_waitlist').update({ location: long }).eq('email_normalized', em('loclong'));
  ok(!!dbLen.error, 'DB CHECK rejects >120 chars written directly');

  // enrichment: fills only when empty, never overwrites, logged
  const e = em('locenrich'); await repAdd(casey.token, { email: e });
  ok((await row(e)).location === null, 'starts empty');
  await repAdd(jordan.token, { email: e, location: 'Saskatoon' });
  let w = await row(e); let ev = await events(w.id);
  ok(w.location === 'Saskatoon' && ev.some((x) => x.event_type === 'duplicate_submission' && x.metadata.enriched?.location === 'Saskatoon'), 'duplicate fills empty location and logs the enrichment');
  await repAdd(casey.token, { email: e, location: 'Regina' });
  await join({ email: e, location: 'Calgary' });
  w = await row(e); ev = await events(w.id);
  ok(w.location === 'Saskatoon', 'later duplicates (rep + public) never overwrite location');
  ok(ev.filter((x) => x.metadata.enriched?.location).length === 1, 'only the filling event logs a location enrichment');
  ok(ev.some((x) => x.metadata.submitted_location === 'Regina'), 'ignored value still preserved in event metadata');
  const ow = await svc.from('overflow_waitlist').update({ location: 'Elsewhere' }).eq('id', w.id);
  ok(!!ow.error, 'DB blocks overwriting a non-empty location');
  const fixable = em('locfix'); await repAdd(casey.token, { email: fixable });
  ok(!(await svc.from('overflow_waitlist').update({ location: 'Prince Albert' }).eq('email_normalized', fixable)).error, 'empty location is fillable/correctable (not in immutability set)');
  const immut = await svc.from('overflow_waitlist').update({ originating_rep_id: jordan.id }).eq('email_normalized', e);
  ok(!!immut.error, 'attribution still immutable');

  // import: optional column
  const ie = em('locimp'), ie2 = em('locimp2');
  const withCol = await importCsv(admin.token, 'rep email,prospect email,business,contact name,date added,agreed_to_email,location\n'
    + `${env.TEST_SETTER_EMAIL},${ie},Biz,Pat,2026-01-05,true,"Moose Jaw, SK"\n${env.TEST_SETTER_EMAIL},${ie2},Biz,Pat,2026-01-05,true,\n`);
  ok(withCol.json.counts?.imported === 2 && (await row(ie)).location === 'Moose Jaw, SK' && (await row(ie2)).location === null, 'import: optional location column (quoted comma, blank ok)', JSON.stringify(withCol.json.counts));
  const enrichImp = await importCsv(admin.token, 'rep email,prospect email,business,contact name,date added,agreed_to_email,location\n'
    + `${env.TEST_REP_EMAIL},${ie2},,,2025-12-01,true,Weyburn\n${env.TEST_REP_EMAIL},${ie},,,2025-12-01,true,Somewhere Else\n`);
  ok((await row(ie2)).location === 'Weyburn' && (await row(ie)).location === 'Moose Jaw, SK', 'import duplicates: fill empty location, never overwrite', JSON.stringify(enrichImp.json.counts));
}

section('Bulk import');
{
  const e = em('imp'), e2 = em('imp2'), pre = em('impexist');
  await repAdd(casey.token, { email: pre }); // existing DB record, no business name
  const csv = HDR
    + `${env.TEST_REP_EMAIL},${e},,,2026-03-10,true\n`          // later date first in file
    + `${env.TEST_SETTER_EMAIL},${e.toUpperCase()},Early Roofing,Pat,2026-01-05,yes\n`  // earliest → should win
    + `${env.TEST_REP_EMAIL},${e},Late Name,,2026-02-01,true\n`
    + `${env.TEST_SETTER_EMAIL},${e2},NoConsent,,2026-01-01,false\n`
    + `nobody@example.test,${em('unk')},X,,2026-01-01,true\n`
    + `${env.TEST_SETTER_EMAIL},${em('bd1')},X,,01/02/2026,true\n`
    + `${env.TEST_SETTER_EMAIL},${em('bd2')},X,,2026-02-31,true\n`
    + `${env.TEST_SETTER_EMAIL},${em('bd3')},X,,,true\n`
    + `${env.TEST_SETTER_EMAIL},${em('fut')},X,,2999-01-01,true\n`
    + `${env.TEST_REP_EMAIL},${pre},Existing Biz,Sam,2025-12-01,true\n`;
  const r = await importCsv(admin.token, csv);
  const c = r.json.counts;
  const w = await row(e); const ev = await events(w.id);
  ok(w.originating_rep_id === casey.id && w.business_name === 'Early Roofing', 'same email 3×: earliest date_added wins regardless of row order', JSON.stringify(w));
  ok(new Date(w.created_at).toISOString().startsWith('2026-01-05'), 'created_at = claimed date_added', w.created_at);
  ok(ev.some((x) => x.event_type === 'backfilled' && x.actor_user_id === admin.id && x.metadata.imported_at), 'backfilled event: admin actor + actual import time');
  ok(ev.filter((x) => x.event_type === 'backfilled_historical_touch').length === 2 && ev.some((x) => x.metadata.rep?.id === jordan.id && x.metadata.claimed_at), 'later claims logged as historical touches with claimed rep/date');
  const wp = await row(pre); const evp = await events(wp.id);
  ok(wp.originating_rep_id === casey.id && wp.business_name === 'Existing Biz', 'existing DB row: origin unchanged, enrichment filled');
  ok(evp.some((x) => x.event_type === 'backfilled_historical_touch' && x.metadata.rep.id === jordan.id && x.metadata.claimed_at?.startsWith('2025-12-01')), 'backfilled_historical_touch has claimed rep + date');
  ok(!(await row(e2)), 'no-consent row skipped');
  ok(c.imported === 1 && c.duplicates === 2 && c.historical_touches === 1 && c.skipped_no_consent === 1 && c.failed === 5, 'report counts', JSON.stringify(c));
  ok(await Promise.all([em('bd1'), em('bd2'), em('bd3'), em('fut'), em('unk')].map(row)).then((x) => x.every((y) => !y)), 'bad-date / unknown-rep rows not imported');
  ok(w.source === 'sales_rep', 'import source = sales_rep');
}

section('Canonical link & client status never leaks to reps');
{
  const ce = em('client'); const { data: biz, error } = await svc.from('businesses').insert({ name: 'Ovf Test Co ' + run, email: ce }).select().single();
  if (error) console.log('  (skip: could not seed businesses row: ' + error.message + ')');
  else {
    const r = await repAdd(casey.token, { email: ce });
    ok(r.json.status === 'added' && Object.keys(r.json).length === 1, 'rep sees an ordinary "added" for a client email', JSON.stringify(r.json));
    const w = await row(ce); ok(w.business_id === biz.id, 'business_id linked (exact email, single business)');
    const v = await admin.client.from('overflow_waitlist_admin').select('is_existing_client').eq('id', w.id).single();
    ok(v.data?.is_existing_client === true, 'High Table view flags existing client');
    await svc.from('businesses').insert({ name: 'Ovf Twin ' + run, email: ce });
    const ce2 = em('ambig'); await svc.from('businesses').insert([{ name: 'A' + run, email: ce2 }, { name: 'B' + run, email: ce2 }]);
    await repAdd(casey.token, { email: ce2 }); ok((await row(ce2)).business_id === null, 'ambiguous match (2 businesses) → link stays null');
    await svc.from('businesses').delete().like('name', `%${run}`);
  }
}

section('Rep deactivation / deletion');
{
  const tmpEmail = `ovf-tmp-${run}@example.test`;
  const { data: u } = await svc.auth.admin.createUser({ email: tmpEmail, password: 'Tmp-' + run + '!Aa1', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, email: tmpEmail, full_name: 'Temp Rep', role: 'rep' });
  const t = await login(tmpEmail, 'Tmp-' + run + '!Aa1'); const e = em('tmp');
  await repAdd(t.token, { email: e });
  const del = await svc.from('profiles').delete().eq('id', u.user.id);
  ok(!!del.error, 'profile with Overflow history cannot be physically deleted (FK RESTRICT)', del.error?.message);
  const rm = await api('/api/admin/remove-user', { token: admin.token, body: { userId: u.user.id } });
  ok(rm.status === 409, 'remove-user guard returns 409', JSON.stringify(rm.json));
  const tg = await api('/api/admin/toggle-user', { token: admin.token, body: { userId: u.user.id, action: 'deactivate' } });
  ok(tg.status === 200, 'deactivate (ban) works');
  const w = await row(e);
  ok(w.originating_rep_id === u.user.id && w.originating_rep_email_snapshot === tmpEmail && w.originating_rep_name_snapshot === 'Temp Rep', 'attribution + snapshots intact after deactivation');
  ok((await repAdd(t.token, { email: em('tmp2') })).status === 401, 'deactivated rep token rejected (banned)');
}

section('CSV export');
{
  const csvRes = await fetch(APP + '/api/admin/overflow/export', { headers: { Authorization: 'Bearer ' + admin.token } });
  const text = await csvRes.text();
  ok(text.startsWith('email,business,contact,location,source,rep name,rep email,date,status,consent basis'), 'export header columns');
  ok(text.includes(em('spoof')) && !text.includes(em('unsub')) && !text.includes(em('rem')), 'export includes active, excludes unsubscribed/removed');
  ok(!/unsubscribed|removed/.test(text.split('\r\n').slice(1).map((l) => l.split(',').slice(-2)[0]).join(' ')), 'no unsubscribed/removed status in any exported row');
  ok(text.includes('Saskatoon'), 'export includes location values');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
