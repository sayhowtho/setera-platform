import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { parseInvite } from '@/lib/user-admin';
import { NextResponse } from 'next/server';

// High Table → Rep Management → Invite. POST { full_name, email, role }.
// Admin/owner only. Invites setters, reps and VPs only (lib/user-admin.ts);
// admin, owner and client accounts are not created through this route.
// The inviter recorded in history is always the verified caller.
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabaseAdmin = auth.admin;

  const input = parseInvite(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const { email, fullName, role } = input.value;

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: 'https://heysetera.com/auth/reset-password',
  });
  if (error || !data?.user) {
    console.error('invite-user error:', error);
    return NextResponse.json({ error: error?.message || 'Could not send the invite' }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({ id: data.user.id, email, full_name: fullName, role });
  if (profileError) {
    console.error('invite-user profile error:', profileError);
    return NextResponse.json({ error: 'Invite sent, but saving the profile failed. Check Rep Management before re-inviting.' }, { status: 500 });
  }

  // Every new setter starts compensation tracking immediately at invite time —
  // existing setters (invited before this existed) are backfilled manually
  // via the "Start Compensation Tracking" action in Setter Management instead.
  if (role === 'setter') {
    const startedAt = new Date().toISOString();
    const { error: compError } = await supabaseAdmin.from('rep_compensation').insert({
      rep_id: data.user.id,
      comp_track: 'setter_training',
      rep_started_at: startedAt,
      track_changed_at: startedAt,
    });
    const { error: historyError } = compError ? { error: null } : await supabaseAdmin.from('rep_compensation_history').insert({
      rep_id: data.user.id,
      previous_track: null,
      new_track: 'setter_training',
      changed_at: startedAt,
      changed_by: auth.user.id,
      note: 'Auto-created at invite time.',
    });
    if (compError || historyError) {
      console.error('invite-user compensation error:', compError || historyError);
      return NextResponse.json({ success: true, warning: 'Invited, but compensation tracking did not start. Use "Start Compensation Tracking" in Setter Management.' });
    }
  }

  return NextResponse.json({ success: true });
}
