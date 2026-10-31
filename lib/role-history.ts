import type { SupabaseClient } from '@supabase/supabase-js';

// role_history (migrations/027): which role someone held when. Server-side
// helpers for Setter Activity / Rep Activity, so a promoted person's
// setter-era work still counts "as setter".

export type RoleSpan = { user_id: string; role: string; started_at: string; ended_at: string | null };

export async function loadRoleHistory(admin: SupabaseClient, userIds?: string[]): Promise<RoleSpan[]> {
  let q = admin.from('role_history').select('user_id, role, started_at, ended_at').order('started_at');
  if (userIds) q = q.in('user_id', userIds);
  const { data, error } = await q;
  if (error) return []; // table not there yet (migration 027 not applied): callers fall back to current role
  return (data || []) as RoleSpan[];
}

export function roleAt(history: RoleSpan[], userId: string, iso: string, fallback: string | null = null): string | null {
  const t = Date.parse(iso);
  const span = history.find(h => h.user_id === userId && Date.parse(h.started_at) <= t && (!h.ended_at || Date.parse(h.ended_at) > t));
  return span?.role ?? fallback;
}

// Users who held `role` at any point in [fromIso, toIso).
export function heldRoleDuring(history: RoleSpan[], role: string, fromIso: string, toIso: string): Set<string> {
  const from = Date.parse(fromIso), to = Date.parse(toIso);
  return new Set(history.filter(h => h.role === role && Date.parse(h.started_at) < to && (!h.ended_at || Date.parse(h.ended_at) > from)).map(h => h.user_id));
}
