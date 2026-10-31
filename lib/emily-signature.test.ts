// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { checkEmilySignature, SIGNATURE_TOLERANCE_SECS } from './emily-signature';

const SECRET = 'wsec_test_only_not_a_real_secret';
const BODY = JSON.stringify({ type: 'post_call_transcription', data: { agent_id: 'agent_x', conversation_id: 'conv_1' } });
const NOW = Date.UTC(2026, 9, 16, 18, 0, 0);
const T = String(NOW / 1000);
const sign = (t: string, body: string, secret = SECRET) => 't=' + t + ',v0=' + createHmac('sha256', secret).update(t + '.' + body).digest('hex');

test('a correctly signed body is valid', () => {
  assert.equal(checkEmilySignature(sign(T, BODY), BODY, SECRET, NOW), 'valid');
});

test('part order and spaces in the header do not matter', () => {
  const [t, v0] = sign(T, BODY).split(',');
  assert.equal(checkEmilySignature(v0 + ', ' + t, BODY, SECRET, NOW), 'valid');
});

test("another workspace's secret is a mismatch", () => {
  assert.equal(checkEmilySignature(sign(T, BODY, 'wsec_other_client'), BODY, SECRET, NOW), 'mismatch');
});

test('a changed body is a mismatch', () => {
  assert.equal(checkEmilySignature(sign(T, BODY), BODY.replace('conv_1', 'conv_2'), SECRET, NOW), 'mismatch');
});

test('old and far-future timestamps are stale', () => {
  const old = String(NOW / 1000 - SIGNATURE_TOLERANCE_SECS - 1);
  const future = String(NOW / 1000 + SIGNATURE_TOLERANCE_SECS + 1);
  assert.equal(checkEmilySignature(sign(old, BODY), BODY, SECRET, NOW), 'stale');
  assert.equal(checkEmilySignature(sign(future, BODY), BODY, SECRET, NOW), 'stale');
  const edge = String(NOW / 1000 - SIGNATURE_TOLERANCE_SECS);
  assert.equal(checkEmilySignature(sign(edge, BODY), BODY, SECRET, NOW), 'valid');
});

test('missing and malformed headers are rejected', () => {
  assert.equal(checkEmilySignature(null, BODY, SECRET, NOW), 'missing');
  assert.equal(checkEmilySignature('', BODY, SECRET, NOW), 'missing');
  assert.equal(checkEmilySignature('t=' + T, BODY, SECRET, NOW), 'malformed');
  assert.equal(checkEmilySignature('v0=' + 'a'.repeat(64), BODY, SECRET, NOW), 'malformed');
  assert.equal(checkEmilySignature('t=abc,v0=' + 'a'.repeat(64), BODY, SECRET, NOW), 'malformed');
  assert.equal(checkEmilySignature('t=' + T + ',v0=zz', BODY, SECRET, NOW), 'malformed');
});
