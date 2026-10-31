// Verifies Bodhi's API (/api/bodhi/prospects, migrations 018/020/021)
// end-to-end against STAGING over real HTTP — a running `next dev` bound to
// staging (same approach as scripts/test-remove-user.mjs).
//
// Start the dev server on staging with low limits and a per-run rate bucket
// (exported vars override .env.local, so this points next dev at staging):
//   export BODHI_API_KEY=$(openssl rand -hex 32) BODHI_READ_RATE_MAX=12 BODHI_WRITE_RATE_MAX=12 BODHI_RATE_BUCKET=bodhi-test-$(date +%s)
//   (set -a; source .env.staging; set +a; npx next dev -p 3100)
// then, in a shell with the SAME four exports:
//   BASE_URL=http://localhost:PORT BODHI_API_KEY=... BODHI_READ_RATE_MAX=12 BODHI_WRITE_RATE_MAX=12 \
//   BODHI_RATE_BUCKET=... node --env-file=.env.staging scripts/test-bodhi-api.mjs --apply
//   node --env-file=.env.staging scripts/test-bodhi-api.mjs --cleanup
//
// Checks: key auth (bare 401s), blocked statuses, blocked rep_id, owner-only
// scope, page cap + exact field set, stage-history rules, note appending,
// no DELETE, and both rate limits (separate buckets). HTTPS enforcement only
// applies on Vercel and can't be exercised locally — see lib/bodhi-api.ts.
//
// All rows use TEST_PREFIX names and 555-01XX numbers and are deleted after.

import { createClient } from '@supabase/supabase-js';

const TEST_PREFIX = 'Test Fictional Bodhi';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const KEY = process.env.BODHI_API_KEY;
const READ_MAX = Number(process.env.BODHI_READ_RATE_MAX);
const WRITE_MAX = Number(process.env.BODHI_WRITE_RATE_MAX);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.staging.');
  process.exit(1);
}
if (url.includes('your-production-project-ref')) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the production project. Use --env-file=.env.staging.');
  process.exit(1);
}
const admin = createClient(url, serviceKey);

async function cleanup() {
  const { data: rows } = await admin.from('prospects').select('id').like('company_name', TEST_PREFIX + '%');
  const ids = (rows || []).map(r => r.id);
  if (ids.length) {
    await admin.from('prospect_stage_history').delete().in('prospect_id', ids);
    await admin.from('prospects').delete().in('id', ids);
  }
  if (process.env.BODHI_RATE_BUCKET?.startsWith('bodhi-test')) {
    await admin.from('overflow_rate_limit').delete().like('bucket', process.env.BODHI_RATE_BUCKET + '%');
  }
  console.log(`Deleted ${ids.length} test prospect(s).`);
}

let reads = 0, writes = 0; // successful-auth calls, which is what the limiter counts
async function call(method, path, { key = KEY, body, headers = {} } = {}) {
  const res = await fetch(BASE_URL + '/api/bodhi/prospects' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'x-bulk-key': key } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (key === KEY && res.status !== 401 && res.status !== 405) { if (method === 'GET') reads++; else writes++; }
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, body: json };
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  -> ' + JSON.stringify(detail)}`);
  if (!ok) failures++;
}

async function apply() {
  if (!KEY || !READ_MAX || !WRITE_MAX || !process.env.BODHI_RATE_BUCKET?.startsWith('bodhi-test')) {
    console.error('Set BODHI_API_KEY, BODHI_READ_RATE_MAX, BODHI_WRITE_RATE_MAX and BODHI_RATE_BUCKET=bodhi-test-... (same values as the running next dev).');
    process.exit(1);
  }
  if (READ_MAX < 8 || WRITE_MAX < 8) { console.error('Use limits of at least 8 so the functional checks fit before the rate-limit checks.'); process.exit(1); }
  await cleanup();
  const n = Date.now() % 80 + 10;
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').single();
  const { data: setter } = await admin.from('profiles').select('id').eq('role', 'setter').limit(1).maybeSingle();

  // ── Key auth: every failure is a bare 401
  const bad = await Promise.all([
    call('GET', '', { key: null }),
    call('GET', '', { key: 'wrong-' + 'x'.repeat(40) }),
    call('GET', '', { key: serviceKey }),
    call('GET', '?x-bulk-key=' + encodeURIComponent(KEY), { key: null }),
    call('GET', '', { key: null, headers: { Authorization: 'Bearer ' + KEY } }),
    call('POST', '', { key: 'wrong-' + 'x'.repeat(40), body: { company_name: 'x' } }),
  ]);
  check('auth: missing / wrong / service-role / query-string / Bearer -> 401', bad.every(r => r.status === 401), bad.map(r => r.status));
  check('auth: 401 bodies are empty', bad.every(r => r.text === ''), bad.map(r => r.text));

  // ── POST: single object, rep_id ignored, blocked status
  const one = await call('POST', '', { body: { company_name: `${TEST_PREFIX} Solo`, phone: `306-555-01${n}`, rep_id: setter?.id ?? '00000000-0000-0000-0000-000000000000', source: 'hacked' } });
  const soloId = one.body?.results?.[0]?.id;
  const { data: solo } = soloId ? await admin.from('prospects').select('rep_id, source').eq('id', soloId).single() : { data: null };
  check('POST single object -> added', one.status === 200 && one.body?.added === 1, one.body);
  check('POST rep_id/source in body ignored -> owner + bodhi', solo?.rep_id === owner.id && solo?.source === 'bodhi', solo);
  const arr = await call('POST', '', { body: [
    { company_name: `${TEST_PREFIX} Won`, status: 'Closed Won', phone: `306-555-01${n + 1}` },
    { company_name: `${TEST_PREFIX} Gold`, tier: 'Gold' },
    { company_name: `${TEST_PREFIX} Arr`, status: 'Interested', phone: `306-555-01${n + 2}` },
  ] });
  const ar = arr.body?.results || [];
  check('POST blocked status (Closed Won) -> skipped invalid_status', ar[0]?.reason === 'invalid_status', ar[0]);
  check('POST bad tier -> skipped invalid_tier', ar[1]?.reason === 'invalid_tier', ar[1]);
  check('POST valid row -> added with Meeting stage-history row', ar[2]?.status === 'added'
    && (await admin.from('prospect_stage_history').select('stage').eq('prospect_id', ar[2].id)).data?.[0]?.stage === 'Meeting', ar[2]);

  // ── PATCH
  const p1 = await call('PATCH', '/' + soloId, { body: { rep_id: setter?.id ?? owner.id } });
  const { data: afterRep } = await admin.from('prospects').select('rep_id').eq('id', soloId).single();
  check('PATCH rep_id -> 400 and owner unchanged', p1.status === 400 && /rep_id/.test(p1.body?.error || '') && afterRep.rep_id === owner.id, p1.body);
  const p2 = await call('PATCH', '/' + soloId, { body: { status: 'Closed Won' } });
  check('PATCH status Closed Won -> 400', p2.status === 400, p2.body);
  const hBefore = (await admin.from('prospect_stage_history').select('id').eq('prospect_id', soloId)).data.length;
  const p3 = await call('PATCH', '/' + soloId, { body: { status: 'Attempted', notes: 'left a voicemail' } });
  const hSame = (await admin.from('prospect_stage_history').select('id').eq('prospect_id', soloId)).data.length;
  check('PATCH same-stage status + note -> 200, no new history row, note appended', p3.status === 200 && hSame === hBefore && /\[\d{4}-\d\d-\d\d \d\d:\d\d Bodhi\] left a voicemail$/.test(p3.body?.notes || ''), p3.body);
  const p4 = await call('PATCH', '/' + soloId, { body: { status: 'Proposal Sent', tier: 'Launch' } });
  const hist = (await admin.from('prospect_stage_history').select('stage, left_at').eq('prospect_id', soloId).order('entered_at')).data;
  check('PATCH stage change -> history row closed + Proposal opened', p4.status === 200 && hist.length === hBefore + 1 && hist.at(-1).stage === 'Proposal' && hist.filter(h => !h.left_at).length === 1, hist);
  let setterProspectId = null;
  if (setter) {
    const { data: sp } = await admin.from('prospects').insert({ rep_id: setter.id, company_name: `${TEST_PREFIX} Setter Owned`, phone: `306-555-01${n + 3}` }).select('id').single();
    setterProspectId = sp.id;
    const p5 = await call('PATCH', '/' + sp.id, { body: { notes: 'x' } });
    check("PATCH a setter's prospect -> 404", p5.status === 404, p5.body);
  } else console.log('SKIP  PATCH setter-owned (no setter profile on staging)');

  // ── GET
  const g1 = await call('GET', '?limit=500');
  const allowed = 'city,company_name,contact_name,created_at,email,id,notes,phone,source,status,tier';
  check('GET limit=500 -> at most 100, limit echoed as 100', g1.status === 200 && g1.body.items.length <= 100 && g1.body.limit === 100, { n: g1.body?.items?.length, limit: g1.body?.limit });
  check('GET returns exactly the allowed fields', (g1.body.items || []).every(it => Object.keys(it).sort().join() === allowed), Object.keys(g1.body.items?.[0] || {}));
  check("GET never returns a setter's prospect", !setterProspectId || !(g1.body.items || []).some(it => it.id === setterProspectId));
  const g2 = await call('GET', '?q=' + encodeURIComponent(`(306) 555-01${n}`));
  check('GET q=phone finds it', g2.body?.items?.length === 1 && g2.body.items[0].id === soloId, g2.body);

  // ── no DELETE / other verbs
  const verbs = await Promise.all(['DELETE', 'PUT'].map(m => call(m, '')));
  const verbsId = await Promise.all(['DELETE', 'GET', 'PUT'].map(m => call(m, '/' + soloId)));
  check('DELETE/PUT -> 405 (collection and item), GET on item -> 405', [...verbs, ...verbsId].every(r => r.status === 405), [...verbs, ...verbsId].map(r => r.status));

  // ── rate limits (writes first, then prove reads are a separate bucket, then reads)
  let wr;
  while (writes < WRITE_MAX) { wr = await call('PATCH', '/' + soloId, { body: { tier: 'Grow' } }); if (wr.status === 429) break; }
  wr = await call('PATCH', '/' + soloId, { body: { tier: 'Grow' } });
  check(`writes: call ${WRITE_MAX + 1} -> 429`, wr.status === 429, wr.status);
  const stillReads = await call('GET', '?limit=1');
  check('reads unaffected by exhausted write bucket', stillReads.status === 200, stillReads.status);
  let rd;
  while (reads < READ_MAX) { rd = await call('GET', '?limit=1'); if (rd.status === 429) break; }
  rd = await call('GET', '?limit=1');
  check(`reads: call ${READ_MAX + 1} -> 429`, rd.status === 429, rd.status);

  await cleanup();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

if (CLEANUP) await cleanup();
else if (APPLY) await apply();
else console.log('DRY RUN — see the header for how to start next dev and run with --apply against staging.');
