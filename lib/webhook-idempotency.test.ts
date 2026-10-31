// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimWebhookEvent, completeWebhookEvent, releaseWebhookEvent, normalizeEventId } from './webhook-idempotency';

type Call = { fn: string; args: Record<string, unknown> };

// In-memory stand-in for the three SQL functions in migrations/041, with the
// same rules: a new id is claimed; a completed or in-progress id is not; an
// unfinished claim older than the stale window can be re-claimed.
function fakeLedger(opts: { error?: string; now?: () => number } = {}) {
  const rows = new Map<string, { last: number; done: boolean; outcome?: string }>();
  const calls: Call[] = [];
  const now = opts.now ?? (() => Date.now());
  const STALE_MS = 10 * 60 * 1000;
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (opts.error) return { data: null, error: { message: opts.error } };
      const key = `${args.p_source}:${args.p_event_id}`;
      const row = rows.get(key);
      if (fn === 'claim_webhook_event') {
        if (!row) { rows.set(key, { last: now(), done: false }); return { data: true, error: null }; }
        if (!row.done && row.last < now() - STALE_MS) { row.last = now(); return { data: true, error: null }; }
        return { data: false, error: null };
      }
      if (fn === 'complete_webhook_event') { if (row) { row.done = true; row.outcome = args.p_outcome as string; } return { data: null, error: null }; }
      if (fn === 'release_webhook_event') { if (row && !row.done) rows.delete(key); return { data: null, error: null }; }
      throw new Error('unexpected rpc ' + fn);
    },
  };
  return { admin: admin as never, rows, calls };
}

test('first delivery is claimed, a repeat after completion is a duplicate', async () => {
  const l = fakeLedger();
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_1'), 'claimed');
  await completeWebhookEvent(l.admin, 'src', 'conv_1', 'call_saved');
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_1'), 'duplicate');
  assert.equal(l.rows.get('src:conv_1')?.outcome, 'call_saved');
});

test('a concurrent second delivery (first still processing) is a duplicate', async () => {
  const l = fakeLedger();
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_2'), 'claimed');
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_2'), 'duplicate');
});

test('after a failure is released, the retry is processed', async () => {
  const l = fakeLedger();
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_3'), 'claimed');
  await releaseWebhookEvent(l.admin, 'src', 'conv_3');
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_3'), 'claimed');
});

test('release never undoes a completed event', async () => {
  const l = fakeLedger();
  await claimWebhookEvent(l.admin, 'src', 'conv_4');
  await completeWebhookEvent(l.admin, 'src', 'conv_4', 'lead_saved');
  await releaseWebhookEvent(l.admin, 'src', 'conv_4');
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_4'), 'duplicate');
});

test('an abandoned claim can be re-claimed once stale, not before', async () => {
  let t = 1_000_000_000;
  const l = fakeLedger({ now: () => t });
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_5'), 'claimed');
  t += 9 * 60 * 1000;
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_5'), 'duplicate');
  t += 2 * 60 * 1000;
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_5'), 'claimed');
});

test('same id from different sources does not collide', async () => {
  const l = fakeLedger();
  assert.equal(await claimWebhookEvent(l.admin, 'a', 'conv_6'), 'claimed');
  assert.equal(await claimWebhookEvent(l.admin, 'b', 'conv_6'), 'claimed');
});

test('missing or unusable ids are processed without touching the ledger', async () => {
  const l = fakeLedger();
  for (const id of [null, undefined, '', '   ', 42, {}, 'x'.repeat(201)]) {
    assert.equal(await claimWebhookEvent(l.admin, 'src', id), 'no_id');
  }
  await completeWebhookEvent(l.admin, 'src', null, 'x');
  await releaseWebhookEvent(l.admin, 'src', '');
  assert.equal(l.calls.length, 0);
});

test('ledger errors fail open: the call is still processed', async () => {
  const l = fakeLedger({ error: 'function claim_webhook_event does not exist' });
  assert.equal(await claimWebhookEvent(l.admin, 'src', 'conv_7'), 'unavailable');
  await completeWebhookEvent(l.admin, 'src', 'conv_7', 'x');   // logs, doesn't throw
  await releaseWebhookEvent(l.admin, 'src', 'conv_7');
});

test('ids are trimmed and length-checked', () => {
  assert.equal(normalizeEventId('  conv_8 '), 'conv_8');
  assert.equal(normalizeEventId('x'.repeat(200)), 'x'.repeat(200));
  assert.equal(normalizeEventId('x'.repeat(201)), null);
});
