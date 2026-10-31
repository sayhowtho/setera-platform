// Every API route must check who is calling before it does anything, because
// route handlers use the service-role client, which bypasses RLS. A route
// passes if it calls requireRole() (session + role from profiles) or
// bodhiGuard() (Bodhi's API key). The only exceptions are the deliberately
// public routes listed below, each with the protection it relies on instead.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const APP = join(ROOT, 'app');

const PUBLIC_ROUTES: Record<string, string> = {
  'app/api/emily-webhook/route.ts': 'ElevenLabs server-to-server webhook (signature check)',
  'app/api/demo-request/route.ts': 'website demo form (IP rate limit + honeypot)',
  'app/api/overflow/join/route.ts': 'website waitlist form (IP rate limit + honeypot)',
};

const GUARD = /\b(requireRole|bodhiGuard)\s*\(/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (/^route\.(ts|tsx|js|mjs)$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

const routes = routeFiles(APP);

test('there are API routes to check (the scan itself works)', () => {
  assert.ok(routes.length > 20, `found only ${routes.length} route files`);
});

test('every route either authenticates the caller or is a listed public route', () => {
  const unguarded = routes.filter(f => !PUBLIC_ROUTES[f] && !GUARD.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(unguarded, [], 'route(s) with no requireRole()/bodhiGuard() and not listed as public');
});

test('every listed public route still exists (no stale exceptions)', () => {
  for (const f of Object.keys(PUBLIC_ROUTES)) assert.ok(routes.includes(f), `${f} is listed as public but no longer exists`);
});

test('no route under app/ outside app/api/', () => {
  assert.deepEqual(routes.filter(f => !f.startsWith('app/api/')), []);
});
