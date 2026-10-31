// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkManageTarget, parseInvite, parseToggle, parseUserId, authorizeManage } from './user-admin';

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', role: 'admin' };
const OWNER = { id: '22222222-2222-4222-8222-222222222222', role: 'owner' };
const uid = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

test('admins and owners can manage setters, reps and VPs', () => {
  for (const actor of [ADMIN, OWNER]) for (const role of ['setter', 'rep', 'vp_sales']) {
    assert.deepEqual(checkManageTarget(actor, { id: uid(3), role }), { ok: true });
  }
});

test('nobody can manage admin, owner or client accounts here', () => {
  for (const actor of [ADMIN, OWNER]) for (const role of ['admin', 'owner', 'client', null, '', 'Owner']) {
    const r = checkManageTarget(actor, { id: uid(4), role });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 403);
  }
});

test('an admin deactivating the owner is refused (the original hole)', () => {
  const r = checkManageTarget(ADMIN, { id: OWNER.id, role: 'owner' });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 403);
});

test('nobody can act on their own account, whatever its role', () => {
  const r = checkManageTarget(ADMIN, { id: ADMIN.id, role: 'admin' });
  assert.equal(!r.ok && r.status, 400);
  const r2 = checkManageTarget({ id: uid(5), role: 'admin' }, { id: uid(5), role: 'rep' });
  assert.equal(!r2.ok && r2.status, 400);
});

test('a missing target is a 404', () => {
  const r = checkManageTarget(ADMIN, null);
  assert.equal(!r.ok && r.status, 404);
});

test('parseInvite accepts sales roles and normalizes input', () => {
  const r = parseInvite({ email: '  New.Person@Example.com ', full_name: ' Test Person ', role: 'setter' });
  assert.deepEqual(r, { ok: true, value: { email: 'new.person@example.com', fullName: 'Test Person', role: 'setter' } });
});

test('parseInvite refuses admin/owner/client/unknown roles and bad input', () => {
  for (const role of ['admin', 'owner', 'client', 'superuser', undefined, 7]) {
    const r = parseInvite({ email: 'a@example.com', full_name: 'X', role });
    assert.equal(!r.ok && r.status, 403, String(role));
  }
  for (const body of [null, 'x', {}, { email: 'not-an-email', full_name: 'X', role: 'rep' }, { email: 'a@example.com', full_name: '   ', role: 'rep' }]) {
    assert.equal(parseInvite(body).ok, false);
  }
});

test('parseInvite ignores a client-supplied invited_by', () => {
  const r = parseInvite({ email: 'a@example.com', full_name: 'X', role: 'rep', invited_by: uid(9) });
  assert.ok(r.ok && !('invited_by' in r.value));
});

test('parseToggle needs a UUID and a known action', () => {
  assert.deepEqual(parseToggle({ userId: uid(6), action: 'deactivate' }), { ok: true, userId: uid(6), deactivate: true });
  assert.deepEqual(parseToggle({ userId: uid(6), action: 'reactivate' }), { ok: true, userId: uid(6), deactivate: false });
  for (const body of [null, {}, { userId: 'abc', action: 'deactivate' }, { userId: uid(6), action: 'ban' }, { userId: uid(6) }]) {
    assert.equal(parseToggle(body).ok, false);
  }
});

test('parseUserId needs a UUID', () => {
  assert.equal(parseUserId({ userId: uid(7) }).ok, true);
  for (const body of [null, {}, { userId: '' }, { userId: "1' or '1'='1" }]) assert.equal(parseUserId(body).ok, false);
});

// Minimal stand-in for the Supabase query builder used by authorizeManage.
function fakeAdmin(result: { data: unknown; error: unknown }) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => result };
  return { from: () => q } as never;
}

test('authorizeManage uses the role stored in profiles', async () => {
  assert.deepEqual(await authorizeManage(fakeAdmin({ data: { id: uid(8), role: 'rep' }, error: null }), ADMIN, uid(8)), { ok: true });
  const r = await authorizeManage(fakeAdmin({ data: { id: uid(8), role: 'owner' }, error: null }), ADMIN, uid(8));
  assert.equal(!r.ok && r.status, 403);
});

test('authorizeManage fails closed when the lookup errors', async () => {
  const r = await authorizeManage(fakeAdmin({ data: null, error: { message: 'boom' } }), OWNER, uid(8));
  assert.equal(!r.ok && r.status, 500);
});
