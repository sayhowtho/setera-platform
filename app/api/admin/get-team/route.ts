import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabaseAdmin = auth.admin;
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
  if (!authData || !profiles) return NextResponse.json({ team: [] });
  const team = profiles
    .filter((p: any) => !['owner', 'admin', 'client'].includes(p.role))
    .map((p: any) => {
      const au = authData.users.find((u: any) => u.id === p.id);
      return {
        ...p,
        last_sign_in_at: au?.last_sign_in_at || null,
        email_confirmed_at: au?.email_confirmed_at || null,
        banned_until: au?.banned_until || null,
      };
    });
  return NextResponse.json({ team });
}