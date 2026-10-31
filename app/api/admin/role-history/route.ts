import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

// GET: role history for every setter / rep / VP (migrations/027), oldest first.
// role_history is service-role only, so High Table reads it through here.
export async function GET(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin.from('role_history')
    .select('user_id, role, started_at, ended_at, note, changed_by')
    .in('role', ['setter', 'rep', 'vp_sales'])
    .order('started_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data });
}
