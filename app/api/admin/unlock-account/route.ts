import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { unlockClientAccount } from '@/lib/client-lockout';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { businessId } = await req.json();
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });
  const result = await unlockClientAccount(auth.admin, businessId, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, restoredRoutes: result.routes });
}
