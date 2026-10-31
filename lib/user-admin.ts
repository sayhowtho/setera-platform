import type { SupabaseClient } from '@supabase/supabase-js';

// Who an admin/owner may invite, deactivate, reactivate or remove through
// /api/admin/{invite-user,toggle-user,remove-user}. These routes only manage
// the sales team, matching High Table (invite offers Setter/Sales Rep; the
// Deactivate/Remove buttons only exist on rep and setter cards) and
// change_role() in migrations/027. Admin, owner and client accounts are never
// changed through them, and nobody can act on their own account.

export const MANAGED_ROLES = ['setter', 'rep', 'vp_sales'] as const;
export type ManagedRole = typeof MANAGED_ROLES[number];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Denied = { ok: false; status: 400 | 403 | 404; error: string };
type Actor = { id: string; role: string };
type Target = { id: string; role: string | null };

export function isManagedRole(role: unknown): role is ManagedRole {
  return typeof role === 'string' && (MANAGED_ROLES as readonly string[]).includes(role);
}

// The caller (already verified by requireRole) against the target's role as
// stored in profiles, never as sent in the request.
export function checkManageTarget(actor: Actor, target: Target | null): { ok: true } | Denied {
  if (!target) return { ok: false, status: 404, error: 'User not found' };
  if (target.id === actor.id) return { ok: false, status: 400, error: "You can't do this to your own account" };
  if (!isManagedRole(target.role)) return { ok: false, status: 403, error: 'Only setters, reps and VPs can be managed here' };
  return { ok: true };
}

export type InviteInput = { email: string; fullName: string; role: ManagedRole };

export function parseInvite(body: unknown): { ok: true; value: InviteInput } | Denied {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, status: 400, error: 'A valid email is required' };
  if (!fullName || fullName.length > 200) return { ok: false, status: 400, error: 'Full name is required (max 200 characters)' };
  if (!isManagedRole(b.role)) return { ok: false, status: 403, error: 'Role must be setter, rep or vp_sales' };
  return { ok: true, value: { email, fullName, role: b.role } };
}

export function parseToggle(body: unknown): { ok: true; userId: string; deactivate: boolean } | Denied {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.userId !== 'string' || !UUID_RE.test(b.userId)) return { ok: false, status: 400, error: 'userId required' };
  if (b.action !== 'deactivate' && b.action !== 'reactivate') return { ok: false, status: 400, error: "action must be 'deactivate' or 'reactivate'" };
  return { ok: true, userId: b.userId, deactivate: b.action === 'deactivate' };
}

export function parseUserId(body: unknown): { ok: true; userId: string } | Denied {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.userId !== 'string' || !UUID_RE.test(b.userId)) return { ok: false, status: 400, error: 'userId required' };
  return { ok: true, userId: b.userId };
}

// Loads the target's real role and runs checkManageTarget. A lookup error is
// a 500 (nothing changed), never a pass.
export async function authorizeManage(admin: SupabaseClient, actor: Actor, userId: string):
  Promise<{ ok: true } | Denied | { ok: false; status: 500; error: string }> {
  const { data, error } = await admin.from('profiles').select('id, role').eq('id', userId).maybeSingle();
  if (error) return { ok: false, status: 500, error: 'Could not look up that user; nothing was changed.' };
  return checkManageTarget(actor, data as Target | null);
}
