import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side session verification for API routes. Sessions live in the
// browser's localStorage (see lib/supabase.ts), so clients send their access
// token as `Authorization: Bearer <token>`. The role always comes from the
// profiles table, never from the request.

export type AuthedUser = { id: string; role: string; email: string | null };
export type AuthResult =
  | { ok: true; user: AuthedUser; admin: SupabaseClient }
  | { ok: false; status: 401 | 403; error: string };

export const ADMIN_ROLES = ['admin', 'owner'];
export const QUICK_ADD_ROLES = ['rep', 'vp_sales', 'setter', 'admin', 'owner'];

export function getServiceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireRole(req: Request, allowed: string[]): Promise<AuthResult> {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, error: 'Authentication required' };

  const admin = getServiceClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: 'Invalid or expired session' };

  // Deactivation is a ban; an already-issued JWT stays valid until it expires,
  // so check the ban explicitly.
  const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
    return { ok: false, status: 401, error: 'Account deactivated' };
  }

  const { data: profile } = await admin.from('profiles').select('role, email').eq('id', data.user.id).maybeSingle();
  if (!profile || !allowed.includes(profile.role)) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, user: { id: data.user.id, role: profile.role, email: profile.email ?? null }, admin };
}
