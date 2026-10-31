import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

// High Table → Rep Management → Promote. POST { userId, role, effectiveDate?, note? }
// effectiveDate: YYYY-MM-DD (Regina), default now. change_role() (migrations/027)
// updates profiles.role and closes/opens role_history in one transaction.
// Nothing else moves: prospects, activities, allocations, demos, sales and
// commission rows are keyed by user id. Admin/owner only.
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  if (!UUID_RE.test(userId) || !['setter', 'rep', 'vp_sales'].includes(role)) {
    return NextResponse.json({ error: 'userId and role (setter, rep or vp_sales) required' }, { status: 400 });
  }
  let effectiveAt = new Date().toISOString();
  if (body.effectiveDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate)) return NextResponse.json({ error: 'effectiveDate must be YYYY-MM-DD' }, { status: 400 });
    const today = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
    if (body.effectiveDate > today) return NextResponse.json({ error: "Effective date can't be in the future" }, { status: 400 });
    // Start of that day in Regina; today means "now" so the change shows straight away.
    effectiveAt = body.effectiveDate === today ? new Date().toISOString() : new Date(body.effectiveDate + 'T00:00:00-06:00').toISOString();
  }
  const { data, error } = await auth.admin.rpc('change_role', { p_user_id: userId, p_new_role: role, p_admin_id: auth.user.id, p_effective_at: effectiveAt, p_note: note || null });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === 'P0001' ? 400 : 500;
    if (status === 500) console.error('change_role error:', error);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
