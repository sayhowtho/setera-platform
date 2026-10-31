import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { authorizeManage, parseUserId } from '@/lib/user-admin';
import { NextResponse } from 'next/server';

// High Table → Rep/Setter Management → Remove. POST { userId }. Admin/owner
// only, and only for setters/reps/VPs other than the caller
// (lib/user-admin.ts) — checked before any of the steps below run.
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabaseAdmin = auth.admin;

  const input = parseUserId(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const { userId } = input;

  const allowed = await authorizeManage(supabaseAdmin, auth.user, userId);
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status });

  // Overflow attribution is permanent (FKs are ON DELETE RESTRICT), so a rep
  // with waitlist history can't be physically deleted. Check first, before the
  // detach steps below make any changes, and point at deactivation instead.
  const [byRep, byCloser, byActor] = await Promise.all([
    supabaseAdmin.from('overflow_waitlist').select('id', { count: 'exact', head: true }).eq('originating_rep_id', userId),
    supabaseAdmin.from('overflow_waitlist').select('id', { count: 'exact', head: true }).eq('closing_rep_id', userId),
    supabaseAdmin.from('overflow_waitlist_events').select('id', { count: 'exact', head: true }).eq('actor_user_id', userId),
  ]);
  if (byRep.error || byCloser.error || byActor.error) {
    return NextResponse.json({ error: 'Could not verify Overflow history; nothing was changed.' }, { status: 500 });
  }
  if ((byRep.count ?? 0) + (byCloser.count ?? 0) + (byActor.count ?? 0) > 0) {
    return NextResponse.json({ error: 'This user has Overflow Early Access attribution history, which is permanent. Deactivate the account instead of deleting it.' }, { status: 409 });
  }

  // Same policy for prospect/pipeline attribution: clients.rep_id,
  // prospects.rep_id, prospect_activities.rep_id, and
  // prospect_stage_history.rep_id are ON DELETE RESTRICT once
  // migrations/010_add_missing_profile_fks.sql is applied (compensation/
  // commission history depends on knowing who gets credit for a sale — see
  // that migration's header). Checked here too, ahead of that migration
  // landing, so the app enforces the same rule the database will.
  const [byClient, byProspect, byActivity, byStageHistory] = await Promise.all([
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('rep_id', userId),
    supabaseAdmin.from('prospects').select('id', { count: 'exact', head: true }).eq('rep_id', userId),
    supabaseAdmin.from('prospect_activities').select('id', { count: 'exact', head: true }).eq('rep_id', userId),
    supabaseAdmin.from('prospect_stage_history').select('id', { count: 'exact', head: true }).eq('rep_id', userId),
  ]);
  if (byClient.error || byProspect.error || byActivity.error || byStageHistory.error) {
    return NextResponse.json({ error: 'Could not verify prospect/pipeline history; nothing was changed.' }, { status: 500 });
  }
  if ((byClient.count ?? 0) + (byProspect.count ?? 0) + (byActivity.count ?? 0) + (byStageHistory.count ?? 0) > 0) {
    return NextResponse.json({ error: 'This user has prospect/pipeline history (clients, prospects, or activity log), which is permanent. Deactivate the account instead of deleting it.' }, { status: 409 });
  }

  // Detach (don't destroy) historical records tied to this user, so
  // appointment/availability/call history survives account removal instead
  // of blocking the delete on a foreign key constraint. All four columns
  // below carry a real `ON DELETE NO ACTION` (blocking) foreign key to
  // auth.users(id) in the live schema, confirmed directly against both
  // staging and production on 2026-09-22 — see migrations/010's header for
  // the full story. Detaching all four, not just setter_id on two tables, is
  // required: appointments.assigned_to and setter_availability.created_by
  // were previously left out here and would silently block
  // auth.admin.deleteUser() below for anyone who was ever assigned an
  // appointment or created an availability slot.
  const [apptSetter, apptAssigned, setterProspect, availability] = await Promise.all([
    supabaseAdmin.from('appointments').update({ setter_id: null }).eq('setter_id', userId),
    supabaseAdmin.from('appointments').update({ assigned_to: null }).eq('assigned_to', userId),
    supabaseAdmin.from('setter_prospects').update({ setter_id: null }).eq('setter_id', userId),
    supabaseAdmin.from('setter_availability').update({ created_by: null }).eq('created_by', userId),
  ]);
  const detachError = apptSetter.error || apptAssigned.error || setterProspect.error || availability.error;
  if (detachError) return NextResponse.json({ error: detachError.message }, { status: 400 });

  // Delete the auth.users row BEFORE the profiles row, not after. This used
  // to run last: a failure here (an FK this route didn't yet know about, a
  // transient error, etc.) left profiles already deleted but auth.users
  // still intact — a half-deleted account with a live session and no
  // profile, which every role-lookup elsewhere in the app expects to exist.
  // Deleting auth first means a failure here changes nothing: the account is
  // still fully intact and the caller can just retry.
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  // Some profiles (seed/test data) were never backed by a real auth.users
  // row — a 404 here just means there's nothing on that side to delete, not
  // a failure; still proceed to remove the profile below.
  if (authError && authError.status !== 404) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
