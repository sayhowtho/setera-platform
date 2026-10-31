// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveStatusChange, NOT_YOURS_MESSAGE, type StageChange } from './stage-change';

type Result = { data?: unknown; error: { message: string } | null };
// Minimal stand-in for the Supabase query builder: records each call as
// "table.op" and resolves with the scripted result for that call.
function fakeClient(results: Record<string, Result>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      let op = '';
      const builder = {
        update() { op = 'update'; return builder; },
        insert() { op = 'insert'; return builder; },
        eq() { return builder; },
        is() { return builder; },
        select() { return builder; },
        then(resolve: (r: Result) => unknown) {
          const key = table + '.' + op;
          calls.push(key);
          return Promise.resolve(results[key] ?? { data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const change: StageChange = { prospectId: 'p1', newStatus: 'Interested', now: '2026-10-06T19:00:00Z', columnChanged: true, newStage: 'Meeting', historyRepId: 'r1', daysInStage: 3 };
const ok = { data: [{ id: 'p1' }], error: null };

test('saved: status row updated, history closed and opened', async () => {
  const { client, calls } = fakeClient({ 'prospects.update': ok });
  assert.deepEqual(await saveStatusChange(client, change), { status: 'saved' });
  assert.deepEqual(calls, ['prospects.update', 'prospect_stage_history.update', 'prospect_stage_history.insert']);
});

test('same column: status only, no history writes', async () => {
  const { client, calls } = fakeClient({ 'prospects.update': ok });
  assert.deepEqual(await saveStatusChange(client, { ...change, columnChanged: false }), { status: 'saved' });
  assert.deepEqual(calls, ['prospects.update']);
});

test('not saved: zero rows updated (RLS) stops before any history write', async () => {
  const { client, calls } = fakeClient({ 'prospects.update': { data: [], error: null } });
  assert.deepEqual(await saveStatusChange(client, change), { status: 'not_saved', message: NOT_YOURS_MESSAGE });
  assert.deepEqual(calls, ['prospects.update']);
});

test('not saved: update error is reported with its message', async () => {
  const { client } = fakeClient({ 'prospects.update': { data: null, error: { message: 'boom' } } });
  assert.deepEqual(await saveStatusChange(client, change), { status: 'not_saved', message: 'Status not saved: boom' });
});

test('history failed: rejected insert is reported, status stays saved', async () => {
  const { client } = fakeClient({ 'prospects.update': ok, 'prospect_stage_history.insert': { error: { message: 'new row violates row-level security policy' } } });
  const r = await saveStatusChange(client, change);
  assert.equal(r.status, 'history_failed');
  assert.match((r as { message: string }).message, /^Status saved, but stage history wasn’t recorded: new row violates/);
});

test('history failed: error closing the old row is reported too', async () => {
  const { client } = fakeClient({ 'prospects.update': ok, 'prospect_stage_history.update': { error: { message: 'nope' } } });
  assert.equal((await saveStatusChange(client, change)).status, 'history_failed');
});
