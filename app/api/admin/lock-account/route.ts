import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { lockClientAccount, type LockReason } from '@/lib/client-lockout';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { businessId, reason, notes, confirmName } = await req.json();
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  // The typed-name confirmation is re-checked here, not just in the dialog.
  const { data: biz } = await auth.admin.from('businesses').select('name').eq('id', businessId).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  if ((confirmName || '').trim() !== biz.name.trim()) return NextResponse.json({ error: 'Typed name does not match business name' }, { status: 400 });

  const result = await lockClientAccount(auth.admin, businessId, reason as LockReason, notes ?? null, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, pausedRoutes: result.routes });
}
