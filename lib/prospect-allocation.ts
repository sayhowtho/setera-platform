import type { SupabaseClient } from '@supabase/supabase-js';

// Shared by /api/admin/prospects/allocate and /pull-back (migrations/023).

// Roles that work prospects. owner = the reserve itself; admin = staff, not
// a seller; client = a customer account.
export const ALLOCATABLE_ROLES = ['rep', 'vp_sales', 'setter'];

type Rep = { id: string; full_name: string | null; email: string; role: string; active: boolean };

// Non-demo reps with their active flag. Deactivation is an auth ban, so it
// isn't in profiles.
export async function nonDemoReps(admin: SupabaseClient): Promise<Rep[]> {
  const { data, error } = await admin.from('profiles').select('id, full_name, email, role')
    .in('role', ALLOCATABLE_ROLES).eq('is_demo', false).order('full_name');
  if (error) throw new Error(error.message);
  const reps = (data || []) as Omit<Rep, 'active'>[];
  const checks = await Promise.all(reps.map(r => admin.auth.admin.getUserById(r.id)));
  return reps.map((r, i) => {
    const u = checks[i].data?.user as { banned_until?: string | null } | undefined;
    const banned = !!(u?.banned_until && new Date(u.banned_until).getTime() > Date.now());
    return { ...r, active: !!u && !banned };
  });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
