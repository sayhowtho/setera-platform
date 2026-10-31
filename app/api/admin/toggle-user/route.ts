import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { authorizeManage, parseToggle } from '@/lib/user-admin';
import { NextResponse } from 'next/server';

// High Table → Rep/Setter Management → Deactivate / Reactivate.
// POST { userId, action: 'deactivate' | 'reactivate' }. Admin/owner only, and
// only for setters/reps/VPs other than the caller (lib/user-admin.ts).
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const input = parseToggle(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });

  const allowed = await authorizeManage(auth.admin, auth.user, input.userId);
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status });

  const { error } = await auth.admin.auth.admin.updateUserById(input.userId, {
    ban_duration: input.deactivate ? '876600h' : 'none',
  });
  if (error) {
    console.error('toggle-user error:', error);
    return NextResponse.json({ error: 'Could not update the account' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
