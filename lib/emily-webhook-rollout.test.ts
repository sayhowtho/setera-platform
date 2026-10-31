// The log -> enforce rollout of Emily webhook signatures (lib/emily-signature.ts,
// migrations/042), and the order of checks in app/api/emily-webhook/route.ts.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyEmilyWebhook } from './emily-signature';

const SECRET = 'wsec_test_secret_for_unit_tests_only';
const BODY = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'conv_x' } });
const sign = (body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v0=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

// Stand-in for the two reads verifyEmilyWebhook makes: the app_config mode row
// and the emily_webhook_secret() RPC.
function fakeAdmin(o: { mode?: string | null; modeError?: boolean; secret?: string | null; secretError?: boolean }) {
  const q = {
    select: () => q, eq: () => q,
    maybeSingle: async () => o.modeError ? { data: null, error: { message: 'boom' } } : { data: o.mode == null ? null : { value: o.mode }, error: null },
  };
  return {
    from: () => q,
    rpc: async () => o.secretError ? { data: null, error: { message: 'boom' } } : { data: o.secret ?? null, error: null },
  } as never;
}

test('log mode (default): every delivery is processed, result is still reported', async () => {
  for (const mode of [null, 'log', 'LOG', 'anything-else']) {
    const unsigned = await verifyEmilyWebhook(fakeAdmin({ mode, secret: SECRET }), null, BODY, null);
    assert.deepEqual([unsigned.ok, unsigned.result, unsigned.mode], [true, 'missing', 'log']);
    const forged = await verifyEmilyWebhook(fakeAdmin({ mode, secret: SECRET }), sign(BODY, 'wrong'), BODY, null);
    assert.deepEqual([forged.ok, forged.result], [true, 'mismatch']);
  }
});

test('log mode with no secret configured yet still processes (rollout step 1)', async () => {
  const r = await verifyEmilyWebhook(fakeAdmin({ mode: 'log', secret: null }), sign(BODY), BODY, 'biz');
  assert.deepEqual([r.ok, r.result], [true, 'no_secret']);
});

test('enforce mode: only a valid signature is processed', async () => {
  const admin = fakeAdmin({ mode: 'enforce', secret: SECRET });
  assert.equal((await verifyEmilyWebhook(admin, sign(BODY), BODY, null)).ok, true);
  assert.equal((await verifyEmilyWebhook(admin, null, BODY, null)).ok, false);
  assert.equal((await verifyEmilyWebhook(admin, sign(BODY, 'other-workspace'), BODY, null)).ok, false);
  assert.equal((await verifyEmilyWebhook(admin, sign(BODY), BODY.replace('conv_x', 'conv_y'), null)).ok, false);
  assert.equal((await verifyEmilyWebhook(admin, sign(BODY, SECRET, 1_000_000_000), BODY, null)).ok, false);
});

test('enforce mode with a missing or unreadable secret rejects (fail closed)', async () => {
  assert.equal((await verifyEmilyWebhook(fakeAdmin({ mode: 'enforce', secret: null }), sign(BODY), BODY, 'biz')).ok, false);
  const r = await verifyEmilyWebhook(fakeAdmin({ mode: 'enforce', secretError: true }), sign(BODY), BODY, 'biz');
  assert.deepEqual([r.ok, r.result], [false, 'no_secret']);
});

test('an unreadable mode row counts as enforce (fail closed)', async () => {
  const bad = await verifyEmilyWebhook(fakeAdmin({ modeError: true, secret: SECRET }), null, BODY, null);
  assert.deepEqual([bad.ok, bad.mode], [false, 'enforce']);
  const good = await verifyEmilyWebhook(fakeAdmin({ modeError: true, secret: SECRET }), sign(BODY), BODY, null);
  assert.equal(good.ok, true);
});

test('webhook checks the signature before claiming the event or writing anything', () => {
  const src = readFileSync(new URL('../app/api/emily-webhook/route.ts', import.meta.url), 'utf8');
  const at = (s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
  const verify = at('verifyEmilyWebhook(');
  assert.ok(verify < at('claimWebhookEvent('), 'signature must be verified before the idempotency claim');
  assert.ok(verify < at(".from('calls').insert("), 'signature must be verified before the calls insert');
  assert.ok(verify < at(".from('leads').insert("), 'signature must be verified before the leads insert');
  assert.equal(src.includes('sigHeader ?'), false, 'the raw signature header must not be logged');
});
