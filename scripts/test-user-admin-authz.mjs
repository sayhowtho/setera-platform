// Staging check for the authorization rules in lib/user-admin.ts, over real
// HTTP against a running `next dev` bound to staging:
//   toggle-user / remove-user / invite-user only act on setters, reps and VPs,
//   never on admin/owner/client accounts or the caller's own account, and the
//   role always comes from profiles, not the request.
// Refused calls must change nothing. The one positive path uses a fictional
// setter this script creates (email_confirm, so no email is sent) and removes.
//
// Usage (staging only):
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging scripts/test-user-admin-authz.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, BASE_URL: base } = process.env;
if (!url || !anonKey || !serviceKey || !adminEmail || !adminPassword || !base) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD (from .env.staging) and BASE_URL.');
  process.exit(1);
}
// Refuse to run against the production project (.env.local).
try {
  const prodUrl = (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m) || [])[1]?.trim();
  if (prodUrl && prodUrl === url) { console.error('Refusing: this is the .env.local (production) project.'); process.exit(1); }
} catch { /* no .env.local: fine */ }

const TEST_EMAIL = 'authz.test.setter@example.com';
const svc = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failures = 0;
const check = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
async function call(path, token, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return res.status;
}

const { data: login, error: loginErr } = await anon.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (loginErr) { console.error('Staging admin login failed:', loginErr.message); process.exit(1); }
const token = login.session.access_token;
const me = login.user.id;

// Proves the dev server is bound to staging: a staging token only works there.
const teamRes = await fetch(base + '/api/admin/get-team', { headers: { Authorization: 'Bearer ' + token } });
check('dev server accepts a staging admin token (server is on staging)', teamRes.status === 200, `status ${teamRes.status}`);
if (teamRes.status !== 200) process.exit(1);

const { data: profiles } = await svc.from('profiles').select('id, role');
const byRole = r => (profiles || []).find(p => p.role === r && p.id !== me)?.id;
const targets = { owner: byRole('owner'), admin: byRole('admin'), client: byRole('client'), self: me };
console.log('caller role:', (profiles || []).find(p => p.id === me)?.role, '| targets found:', Object.entries(targets).filter(([, v]) => v).map(([k]) => k).join(', '));

const bannedUntil = async id => (await svc.auth.admin.getUserById(id)).data?.user?.banned_until ?? null;
const before = {};
for (const [k, id] of Object.entries(targets)) if (id) before[k] = await bannedUntil(id);

check('no token -> 401', await call('/api/admin/toggle-user', null, { userId: me, action: 'deactivate' }) === 401);
for (const [k, id] of Object.entries(targets)) {
  if (!id) continue;
  const want = k === 'self' ? 400 : 403;
  check(`toggle-user on ${k} refused`, await call('/api/admin/toggle-user', token, { userId: id, action: 'deactivate' }) === want);
  check(`remove-user on ${k} refused`, await call('/api/admin/remove-user', token, { userId: id }) === want);
}
for (const role of ['admin', 'owner', 'client']) {
  check(`invite-user as ${role} refused`, await call('/api/admin/invite-user', token, { email: `authz.never.${role}@example.com`, full_name: 'Never Sent', role }) === 403);
}
check('toggle-user unknown action -> 400', await call('/api/admin/toggle-user', token, { userId: me, action: 'ban' }) === 400);
check('remove-user non-UUID -> 400', await call('/api/admin/remove-user', token, { userId: 'abc' }) === 400);
for (const [k, id] of Object.entries(targets)) {
  if (!id) continue;
  const { data: still } = await svc.from('profiles').select('id').eq('id', id).maybeSingle();
  check(`${k} account unchanged (not banned, not deleted)`, !!still && (await bannedUntil(id)) === before[k]);
}

// Positive path on a fictional setter created here.
const { data: existing } = await svc.auth.admin.listUsers({ perPage: 1000 });
for (const u of existing?.users || []) if (u.email === TEST_EMAIL) { await svc.from('profiles').delete().eq('id', u.id); await svc.auth.admin.deleteUser(u.id); }
const { data: created, error: createErr } = await svc.auth.admin.createUser({ email: TEST_EMAIL, email_confirm: true, password: crypto.randomUUID() + 'Aa1!' });
if (createErr) { console.error('could not create test setter:', createErr.message); process.exit(1); }
const sid = created.user.id;
try {
  await svc.from('profiles').upsert({ id: sid, email: TEST_EMAIL, full_name: 'Authz Test Setter', role: 'setter' });
  check('deactivate a setter -> 200', await call('/api/admin/toggle-user', token, { userId: sid, action: 'deactivate' }) === 200);
  check('setter is now banned', !!(await bannedUntil(sid)) && new Date(await bannedUntil(sid)) > new Date());
  check('reactivate the setter -> 200', await call('/api/admin/toggle-user', token, { userId: sid, action: 'reactivate' }) === 200);
  check('remove the setter -> 200', await call('/api/admin/remove-user', token, { userId: sid }) === 200);
  const { data: gone } = await svc.from('profiles').select('id').eq('id', sid).maybeSingle();
  check('setter profile deleted', !gone);
} finally {
  await svc.from('profiles').delete().eq('id', sid);
  await svc.auth.admin.deleteUser(sid).catch(() => {});
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
