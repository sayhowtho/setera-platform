// Staging check for Emily webhook idempotency (migrations/041,
// lib/webhook-idempotency.ts), over real HTTP against a running `next dev`
// bound to staging. Sends the same post_call_transcription payload several
// times (sequentially and concurrently) and counts the rows it produced.
//
//   migration 041 applied:     exactly 1 row per conversation_id
//   migration 041 NOT applied: the webhook must still answer 2xx and save the
//                              call (fail-open); duplicates are expected
//
// Uses fictional payloads with a test-only conversation_id prefix, and
// deletes everything it created at the end. Classification runs with
// whatever ANTHROPIC_API_KEY the dev server has (use a dummy one).
//
// Usage (staging only):
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging scripts/test-webhook-idempotency.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, BASE_URL: base } = process.env;
if (!url || !serviceKey || !base) { console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.staging) and BASE_URL.'); process.exit(1); }
try {
  const prodUrl = (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m) || [])[1]?.trim();
  if (prodUrl && prodUrl === url) { console.error('Refusing: this is the .env.local (production) project.'); process.exit(1); }
} catch { /* no .env.local: fine */ }

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
const PREFIX = 'test_idem_';
let failures = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

// Probe with release_webhook_event on an id that can't exist: a no-op when the
// migration is applied, an error when it isn't. (A HEAD select on a missing
// table doesn't surface an error through supabase-js.)
const { error: ledgerErr } = await svc.rpc('release_webhook_event', { p_source: 'probe', p_event_id: PREFIX + 'probe' });
const ledger = !ledgerErr;
console.log(`migration 041 on staging: ${ledger ? 'APPLIED' : 'NOT applied'}${ledger ? '' : ' (' + ledgerErr.message + ')'}`);

const payload = (conversationId, agentId) => ({
  type: 'post_call_transcription',
  data: {
    agent_id: agentId, conversation_id: conversationId,
    transcript: [{ role: 'agent', message: 'Test call, please ignore.' }],
    metadata: { call_duration_secs: 12, phone_call: { external_number: '+15550000000' } },
    analysis: { transcript_summary: 'Idempotency test call.', data_collection_results: { name: { value: 'Test Caller' }, caller_name: { value: 'Test Caller' } } },
  },
});
const post = body => fetch(base + '/api/emily-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, json: await r.json().catch(() => null) }));

const created = { leads: [], calls: [] };
async function run(label, table, column, agentId) {
  const id = PREFIX + randomUUID();
  created[table].push(id);
  const first = await post(payload(id, agentId));
  const second = await post(payload(id, agentId));
  const burst = await Promise.all([1, 2, 3].map(() => post(payload(id, agentId))));
  const all = [first, second, ...burst];
  check(`${label}: every delivery answered 2xx`, all.every(r => r.status >= 200 && r.status < 300), all.map(r => r.status).join(','));
  const { count } = await svc.from(table).select('id', { head: true, count: 'exact' }).eq(column, id);
  if (ledger) {
    check(`${label}: 5 deliveries -> exactly 1 ${table} row`, count === 1, `rows=${count}`);
    check(`${label}: repeats were reported as duplicates`, all.filter(r => r.json?.duplicate).length === 4);
    const { data: ev } = await svc.from('webhook_events').select('completed_at, outcome, attempts').eq('event_id', id).maybeSingle();
    check(`${label}: ledger row completed`, !!ev?.completed_at, `outcome=${ev?.outcome}`);
  } else {
    check(`${label}: fail-open, call still saved without the ledger`, (count ?? 0) >= 1, `rows=${count}`);
  }
}

try {
  await run('leads path (unknown agent)', 'leads', 'conversation_id', 'agent_test_idempotency_unknown');
  const { data: agentRow } = await svc.from('business_agents').select('agent_id').limit(1).maybeSingle();
  if (agentRow?.agent_id) await run('calls path (staging business agent)', 'calls', 'call_sid', agentRow.agent_id);
  else console.log('SKIP  calls path: no business_agents row on staging');
  const noId = await post(payload(null, 'agent_test_idempotency_unknown'));
  check('payload without conversation_id still processed', noId.status === 200, `status ${noId.status}`);
  const { data: nullLeads } = await svc.from('leads').select('id').is('conversation_id', null).eq('reason', 'Idempotency test call.');
  for (const r of nullLeads || []) await svc.from('leads').delete().eq('id', r.id);
} finally {
  for (const id of created.leads) await svc.from('leads').delete().eq('conversation_id', id);
  for (const id of created.calls) await svc.from('calls').delete().eq('call_sid', id);
  if (ledger) await svc.from('webhook_events').delete().like('event_id', PREFIX + '%');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
