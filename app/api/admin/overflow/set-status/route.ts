import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { waitlistId, status } = await req.json().catch(() => ({}));
  if (typeof waitlistId !== 'string' || (status !== 'unsubscribed' && status !== 'removed')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { error } = await auth.admin.rpc('overflow_set_status', { p_waitlist_id: waitlistId, p_new_status: status, p_admin_id: auth.user.id });
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 400 });
  return NextResponse.json({ success: true });
}
