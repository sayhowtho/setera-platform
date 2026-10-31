import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Portal = 'admin' | 'rep' | 'setter' | 'client' | 'dashboard' | 'auth';

const clients: Partial<Record<Portal, SupabaseClient>> = {};

// Every portal gets its own localStorage key (and its own SupabaseClient
// instance) instead of one shared 'setera-auth' key for the whole app.
// Supabase's auth client listens for the browser 'storage' event to keep
// multiple tabs of the SAME account in sync — with one shared key across
// every role, signing into a different account in one tab silently
// overwrote the session in every other open tab of the same origin,
// including tabs on a completely different portal/account. Root-caused
// 2026-09-16 via a production job_prospects RLS failure that traced back
// to an owner session getting silently swapped for a setter test account.
export function portalForPath(pathname: string): Portal {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/rep')) return 'rep';
  if (pathname.startsWith('/setter')) return 'setter';
  if (pathname.startsWith('/client')) return 'client';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  return 'auth';
}

// Lazily creates (and caches) one SupabaseClient per portal, rather than
// at module-eval time. Next.js still executes top-level module code for
// 'use client' components during static prerendering, so a module-scope
// createClient() call here would run at build time — when env vars aren't
// guaranteed to be present — and throw "supabaseUrl is required".
export function getPortalClient(portal: Portal): SupabaseClient {
  let existing = clients[portal];
  if (!existing) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    existing = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'setera-auth-' + portal,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        // The 'auth' bucket only ever holds a session transiently, between
        // signInWithPassword()/updateUser() and handoffSessionToPortal().
        // It must never race the destination portal's client to rotate the
        // (shared, until handoff clears it) refresh token in the background.
        autoRefreshToken: portal !== 'auth',
      }
    });
    clients[portal] = existing;
  }
  return existing;
}

function currentPortal(): Portal {
  if (typeof window === 'undefined') return 'auth';
  return portalForPath(window.location.pathname);
}

// Proxy so every existing call site (`supabase.from(...)`, `supabase.auth...`)
// keeps working unchanged — resolves to the client for whichever portal the
// browser is currently on, re-checked on every property access.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getPortalClient(currentPortal());
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

// Hands an active session off from the 'auth' portal's storage bucket to
// the destination portal's bucket. Needed because signInWithPassword() /
// updateUser() run on /auth/login or /auth/reset-password — before the
// user's role (and therefore destination portal) is known — so the
// session initially lands in the 'auth' bucket. Call this right before
// navigating to the destination portal route.
export async function handoffSessionToPortal(destination: Portal): Promise<void> {
  if (destination === 'auth') return;
  const authClient = getPortalClient('auth');
  const { data: { session } } = await authClient.auth.getSession();
  if (!session) return;
  await getPortalClient(destination).auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  // Deliberately NOT authClient.auth.signOut() here, even with
  // { scope: 'local' } — every scope value still calls POST
  // /auth/v1/logout for the CURRENT session server-side (see
  // GoTrueClient._signOut in @supabase/auth-js: it calls
  // this.admin.signOut(accessToken, scope) whenever an access token is
  // present, unconditionally on scope). 'local' only means "don't also
  // sign out the user's OTHER sessions" — it still revokes THIS one,
  // which is the exact session just copied to the destination bucket,
  // silently breaking the login that had just succeeded. Clearing the
  // 'auth' bucket's storage entry directly, with no SDK signOut call,
  // is the only way to tidy up without revoking the handed-off session.
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('setera-auth-auth');
  }
}

// Moves the signed-in session from the current portal's bucket to another
// portal's and navigates there — e.g. a rep opening the setter tools from
// /rep. MOVES rather than copies: two buckets auto-refreshing the same
// refresh token would race and one of them would get logged out.
export async function switchPortal(destination: Exclude<Portal, 'auth'>): Promise<void> {
  if (typeof window === 'undefined') return;
  const from = currentPortal();
  const { data: { session } } = await getPortalClient(from).auth.getSession();
  if (session && from !== destination) {
    await getPortalClient(destination).auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    window.localStorage.removeItem('setera-auth-' + from);
  }
  window.location.href = '/' + destination;
}
