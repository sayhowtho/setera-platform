import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { getOwnerId } from '@/lib/bodhi-api';
import { nonDemoReps, UUID_RE } from '@/lib/prospect-allocation';

export const dynamic = 'force-dynamic';

// High Table → Prospects → Allocate / Pull back. The owner's prospects are
// the reserve; allocation moves a chunk of them to reps in one transaction
// (allocate_prospects, migrations/023). Admin/owner only.

const MAX_IDS = 5000;

// GET: non-demo reps (active flag included — Allocate shows active ones only,
// Pull back shows all), each with:
//   assigned          prospects they own (any status)
//   worked            of those, ones with logged activity (by anyone)
//   untouched         Not Contacted with no logged activity
//   untouchedAllocated  of those, ones whose latest move was an allocation to
//                     this rep (rep_untouched_prospects, migrations/025); the
//                     rest they added themselves or got another way
//   lastActivityAt    the rep's own most recent logged activity, any prospect
export async function GET(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  try {
    const reps = await nonDemoReps(admin);
    const ids = reps.map(r => r.id);
    const assigned: Record<string, number> = {};
    const worked: Record<string, number> = {};
    if (ids.length) {
      const { data: owned, error } = await admin.from('prospects').select('id, rep_id').in('rep_id', ids);
      if (error) throw new Error(error.message);
      const ownedIds = (owned || []).map(p => p.id);
      const hasActivity = new Set<string>();
      for (let i = 0; i < ownedIds.length; i += 500) {
        const { data: acts, error: aErr } = await admin.from('prospect_activities').select('prospect_id').in('prospect_id', ownedIds.slice(i, i + 500));
        if (aErr) throw new Error(aErr.message);
        (acts || []).forEach(a => hasActivity.add(a.prospect_id));
      }
      for (const p of owned || []) {
        assigned[p.rep_id] = (assigned[p.rep_id] || 0) + 1;
        if (hasActivity.has(p.id)) worked[p.rep_id] = (worked[p.rep_id] || 0) + 1;
      }
    }
    const perRep = await Promise.all(reps.map(async r => {
      const [u, last] = await Promise.all([
        admin.rpc('rep_untouched_prospects', { p_rep_id: r.id }),
        admin.from('prospect_activities').select('created_at').eq('rep_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (u.error) throw new Error(u.error.message);
      if (last.error) throw new Error(last.error.message);
      const rows = (u.data || []) as { allocated_at: string | null }[];
      return { untouched: rows.length, untouchedAllocated: rows.filter(x => x.allocated_at).length, lastActivityAt: last.data?.created_at ?? null };
    }));
    return NextResponse.json({
      reps: reps.map((r, i) => ({
        id: r.id, name: r.full_name || r.email, role: r.role, active: r.active,
        assigned: assigned[r.id] || 0, worked: worked[r.id] || 0, ...perRep[i],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { prospectIds, allocations: [{rep_id, count}], dryRun? }
// prospectIds in table order; dryRun returns { selected, eligible, skipped }
// without changing anything.
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const rawIds: unknown[] = Array.isArray(body.prospectIds) ? body.prospectIds : [];
  const prospectIds = [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))];
  if (prospectIds.length === 0 || prospectIds.length !== rawIds.length) {
    return NextResponse.json({ error: 'prospectIds must be a non-empty list of unique ids' }, { status: 400 });
  }
  if (prospectIds.length > MAX_IDS) return NextResponse.json({ error: `At most ${MAX_IDS} prospects per batch` }, { status: 400 });
  const dryRun = body.dryRun === true;

  let allocations: { rep_id: string; count: number }[] = [];
  if (!dryRun) {
    const raw: unknown[] = Array.isArray(body.allocations) ? body.allocations : [];
    allocations = raw.map(a => a as { rep_id?: unknown; count?: unknown })
      .map(a => ({ rep_id: typeof a.rep_id === 'string' ? a.rep_id : '', count: Number(a.count) }))
      .filter(a => a.count !== 0);
    if (allocations.length === 0) return NextResponse.json({ error: 'Enter a number for at least one rep' }, { status: 400 });
    if (allocations.some(a => !UUID_RE.test(a.rep_id) || !Number.isInteger(a.count) || a.count < 1)) {
      return NextResponse.json({ error: 'Each allocation needs a rep and a whole number of at least 1' }, { status: 400 });
    }
    const requested = allocations.reduce((s, a) => s + a.count, 0);
    if (requested > prospectIds.length) {
      return NextResponse.json({ error: `You asked for ${requested} but only selected ${prospectIds.length}` }, { status: 400 });
    }
    try {
      const allowed = new Set((await nonDemoReps(admin)).filter(r => r.active).map(r => r.id));
      if (allocations.some(a => !allowed.has(a.rep_id))) {
        return NextResponse.json({ error: 'One of those reps is deactivated or a demo account' }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const reserveId = await getOwnerId(admin);
  if (!reserveId) return NextResponse.json({ error: 'Could not resolve the owner (reserve) account' }, { status: 500 });

  const { data, error } = await admin.rpc('allocate_prospects', {
    p_admin_id: auth.user.id, p_reserve_id: reserveId, p_prospect_ids: prospectIds,
    p_allocations: allocations, p_dry_run: dryRun,
  });
  if (error) {
    const status = error.code === 'P0001' ? 400 : 500;
    if (status === 500) console.error('allocate_prospects error:', error);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
