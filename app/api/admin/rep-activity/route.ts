export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { nonDemoReps } from '@/lib/prospect-allocation';
import { summarizeRep, reginaDateOf, reginaDayStartMs, type Activity, type Allocation, type OwnedProspect } from '@/lib/rep-activity';
import { loadRoleHistory, roleAt } from '@/lib/role-history';

// High Table → Rep Activity (read-only). Every non-demo rep, vp_sales and
// setter: a feed of what they logged in a Regina date range plus a per-rep
// summary (lib/rep-activity.ts). Service client behind an admin/owner check,
// like Setter Activity, so one rep's numbers are never exposed to another.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 92;
const ACT_COLS = 'id, rep_id, prospect_id, type, outcome, notes, follow_up_date, created_at';

async function inChunks<T>(ids: string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await fetch(ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

async function pagedActivities(admin: SupabaseClient, repIds: string[], from: string, to: string) {
  const out: (Activity & { prospects: { company_name: string } | null })[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await admin.from('prospect_activities').select(ACT_COLS + ', prospects(company_name)')
      .in('rep_id', repIds).gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false }).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as unknown as typeof out));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { start, end } = await req.json().catch(() => ({}));
  if (!DATE_RE.test(start || '') || !DATE_RE.test(end || '') || end < start) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD, end >= start) required' }, { status: 400 });
  }
  const fromMs = reginaDayStartMs(start), toMs = reginaDayStartMs(end) + 86400000; // end exclusive
  if ((toMs - fromMs) / 86400000 > MAX_DAYS) return NextResponse.json({ error: `At most ${MAX_DAYS} days` }, { status: 400 });
  const from = new Date(fromMs).toISOString(), to = new Date(toMs).toISOString();
  const now = Date.now();
  const todayStr = reginaDateOf(now);

  try {
    const reps = await nonDemoReps(admin);
    const ids = reps.map(r => r.id);
    if (!ids.length) return NextResponse.json({ reps: [], feed: [], now });

    const [periodActs, ownedRes, allocRes] = await Promise.all([
      pagedActivities(admin, ids, from, to),
      admin.from('prospects').select('id, rep_id, status, follow_up_date').in('rep_id', ids),
      admin.from('prospect_assignments').select('prospect_id, to_rep_id, moved_at').eq('kind', 'allocate').in('to_rep_id', ids).gte('moved_at', from).lt('moved_at', to),
    ]);
    if (ownedRes.error) throw new Error(ownedRes.error.message);
    if (allocRes.error) throw new Error(allocRes.error.message);
    const owned = (ownedRes.data || []) as OwnedProspect[];
    const allocations = (allocRes.data || []) as Allocation[];

    const allActsOnOwned = await inChunks<Activity>(owned.map(p => p.id), c => admin.from('prospect_activities').select(ACT_COLS).in('prospect_id', c));
    const allocatedIds = [...new Set(allocations.map(a => a.prospect_id))];
    const actsOnAllocated = await inChunks<Activity>(allocatedIds, c => admin.from('prospect_activities').select(ACT_COLS).in('prospect_id', c));
    // Role held when each activity was logged (role_history, migrations/027), so a
    // promoted person's numbers split into "as setter" / "as rep".
    const history = await loadRoleHistory(admin, ids);
    const currentRole = new Map(reps.map(r => [r.id, r.role]));
    const roleOf = (a: Activity) => roleAt(history, a.rep_id, a.created_at, currentRole.get(a.rep_id) ?? null) ?? 'unknown';
    const lastByRep = await Promise.all(ids.map(id =>
      admin.from('prospect_activities').select('created_at').eq('rep_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()));

    const ownedByRep = new Map<string, Set<string>>();
    for (const p of owned) (ownedByRep.get(p.rep_id) ?? ownedByRep.set(p.rep_id, new Set()).get(p.rep_id)!).add(p.id);

    const out = reps.map((r, i) => {
      const mine = ownedByRep.get(r.id) ?? new Set<string>();
      const summary = summarizeRep({
        periodActs: periodActs.filter(a => a.rep_id === r.id),
        owned: owned.filter(p => p.rep_id === r.id),
        allActsOnOwned: allActsOnOwned.filter(a => a.prospect_id && mine.has(a.prospect_id)),
        allocationsInPeriod: allocations.filter(a => a.to_rep_id === r.id),
        repActsOnAllocated: actsOnAllocated.filter(a => a.rep_id === r.id),
        todayStr,
      });
      const byRole: Record<string, { activities: number; calls: number; emails: number }> = {};
      for (const a of periodActs.filter(x => x.rep_id === r.id)) {
        const k = roleOf(a);
        byRole[k] ??= { activities: 0, calls: 0, emails: 0 };
        byRole[k].activities++;
        if (a.type === 'Call') byRole[k].calls++;
        if (a.type === 'Email') byRole[k].emails++;
      }
      return { id: r.id, name: r.full_name || r.email, role: r.role, active: r.active, lastActivityAt: lastByRep[i].data?.created_at ?? null, summary, byRole };
    // Deactivated reps only appear if they did something in the range.
    }).filter(r => r.active || r.summary.activities > 0 || r.summary.allocated > 0);

    const feed = periodActs.map(a => ({
      id: a.id, rep_id: a.rep_id, prospect_id: a.prospect_id, company_name: a.prospects?.company_name ?? null,
      type: a.type, outcome: a.outcome, notes: a.notes, follow_up_date: a.follow_up_date, created_at: a.created_at, role_at: roleOf(a),
    }));
    return NextResponse.json({ reps: out, feed, now });
  } catch (e) {
    console.error('rep-activity error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
