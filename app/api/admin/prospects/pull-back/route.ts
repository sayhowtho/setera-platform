import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { getOwnerId } from '@/lib/bodhi-api';
import { nonDemoReps, UUID_RE } from '@/lib/prospect-allocation';

export const dynamic = 'force-dynamic';

// POST { repId, count | null, onlyAllocated? }: move a rep's untouched
// prospects (Not Contacted, no logged activity) back to the owner (reserve),
// oldest allocation first. count null = all. onlyAllocated (default true):
// only ones that came from an allocation, never ones the rep added. One transaction, one audit
// row per move (pull_back_prospects, migrations/023). Admin/owner only.
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const repId = typeof body.repId === 'string' ? body.repId : '';
  const count = body.count === null || body.count === undefined ? null : Number(body.count);
  const onlyAllocated = body.onlyAllocated !== false;
  if (!UUID_RE.test(repId)) return NextResponse.json({ error: 'repId required' }, { status: 400 });
  if (count !== null && (!Number.isInteger(count) || count < 1)) {
    return NextResponse.json({ error: 'Enter a whole number of at least 1, or pull back all' }, { status: 400 });
  }

  // Deactivated reps are allowed here (pulling leads back from someone who
  // left is the main use); demo accounts and non-rep roles are not.
  try {
    if (!(await nonDemoReps(admin)).some(r => r.id === repId)) {
      return NextResponse.json({ error: 'Not a rep you can pull back from' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const reserveId = await getOwnerId(admin);
  if (!reserveId) return NextResponse.json({ error: 'Could not resolve the owner (reserve) account' }, { status: 500 });

  const { data, error } = await admin.rpc('pull_back_prospects', {
    p_admin_id: auth.user.id, p_reserve_id: reserveId, p_rep_id: repId, p_count: count, p_only_allocated: onlyAllocated,
  });
  if (error) {
    const status = error.code === 'P0001' ? 400 : 500;
    if (status === 500) console.error('pull_back_prospects error:', error);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
