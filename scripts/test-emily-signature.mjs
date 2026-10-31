// Staging check for Emily webhook signatures (lib/emily-signature.ts,
// migrations/042), over real HTTP against a running `next dev` bound to
// staging. Sends a correctly signed, an unsigned and a forged delivery for
// Setera's own workspace (the leads path) and checks the outcome for the
// current mode. With --enforce it switches staging's app_config mode to
// 'enforce' for the run and always restores the previous value.
//
// Before it can test real verification, staging needs migration 042 and a
// Vault secret named emily_webhook:setera whose value you also pass here as
// EMILY_TEST_SECRET (any test string; never a production secret).
//
// Usage (staging only):
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging scripts/test-emily-signature.mjs
//   BASE_URL=... EMILY_TEST_SECRET=... node --env-file=.env.staging scripts/test-emily-signature.mjs [--enforce]
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, BASE_URL: base, EMILY_TEST_SECRET: secret } = process.env;
if (!url || !serviceKey || !base) { console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.staging) and BASE_URL.'); process.exit(1); }
try {
  const prodUrl = (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m) || [])[1]?.trim();
  if (prodUrl && prodUrl === url) { console.error('Refusing: this is the .env.local (production) project.'); process.exit(1); }
} catch { /* no .env.local: fine */ }

const ENFORCE = process.argv.includes('--enforce');
const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
const PREFIX = 'test_sig_';
let failures = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

const { error: fnErr } = await svc.rpc('emily_webhook_secret', { p_business_id: null });
const has042 = !fnErr;
console.log(`migration 042 on staging: ${has042 ? 'APPLIED' : 'NOT applied'} | EMILY_TEST_SECRET: ${secret ? 'set' : 'not set'}`);
if (ENFORCE && (!has042 || !secret)) { console.error('--enforce needs migration 042 on staging and EMILY_TEST_SECRET matching Vault emily_webhook:setera.'); process.exit(1); }

const { data: modeRow } = await svc.from('app_config').select('value').eq('key', 'emily_webhook_signature_mode').maybeSingle();
const previousMode = modeRow?.value ?? null;
const setMode = async v => v === null
  ? svc.from('app_config').delete().eq('key', 'emily_webhook_signature_mode')
  : svc.from('app_config').upsert({ key: 'emily_webhook_signature_mode', value: v, updated_at: new Date().toISOString() });

const payload = id => JSON.stringify({ type: 'post_call_transcription', data: {
  agent_id: 'agent_test_signature_unknown', conversation_id: id,
  transcript: [{ role: 'agent', message: 'Test call, please ignore.' }],
  analysis: { transcript_summary: 'Signature test call.', data_collection_results: {} } } });
const sign = (body, s, t = Math.floor(Date.now() / 1000)) => `t=${t},v0=${createHmac('sha256', s).update(`${t}.${body}`).digest('hex')}`;
const post = (body, sig) => fetch(base + '/api/emily-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sig ? { 'elevenlabs-signature': sig } : {}) }, body }).then(r => r.status);
const saved = async id => ((await svc.from('leads').select('id', { head: true, count: 'exact' }).eq('conversation_id', id)).count ?? 0) > 0;

const ids = [];
try {
  if (ENFORCE) await setMode('enforce');
  const mode = ENFORCE ? 'enforce' : (previousMode === 'enforce' ? 'enforce' : 'log');
  console.log('mode for this run:', mode);
  const cases = [
    ['correctly signed', s => s ? sign(s.body, secret) : null, true],
    ['unsigned', () => null, false],
    ['forged (wrong secret)', s => sign(s.body, 'not-the-secret'), false],
    ['stale timestamp', s => secret ? sign(s.body, secret, 1_000_000_000) : sign(s.body, 'x', 1_000_000_000), false],
  ];
  for (const [label, makeSig, legit] of cases) {
    if (label === 'correctly signed' && !secret) { console.log('SKIP  correctly signed: EMILY_TEST_SECRET not set'); continue; }
    const id = PREFIX + randomUUID(); ids.push(id);
    const body = payload(id);
    const status = await post(body, makeSig({ body }));
    const wantSaved = mode === 'log' || legit;
    check(`${label}: ${wantSaved ? 'processed' : 'rejected'} in ${mode} mode`, wantSaved ? (status === 200 && await saved(id)) : (status === 401 && !(await saved(id))), `status ${status}`);
  }
} finally {
  if (ENFORCE) await setMode(previousMode);
  for (const id of ids) await svc.from('leads').delete().eq('conversation_id', id);
  await svc.from('webhook_events').delete().like('event_id', PREFIX + '%').then(() => {}, () => {});
}
const { data: after } = await svc.from('app_config').select('value').eq('key', 'emily_webhook_signature_mode').maybeSingle();
check('staging mode restored to what it was', (after?.value ?? null) === previousMode, `now ${after?.value ?? '(no row = log)'}`);
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
