import { NextResponse } from 'next/server';
import { bodhiGuard, BODHI_STATUSES, BODHI_TIERS } from '@/lib/bodhi-api';

export const dynamic = 'force-dynamic';

// PATCH /api/bodhi/prospects/:id  — body may contain ONLY:
//   notes   string, appended as "[YYYY-MM-DD HH:MM Bodhi] ..." (never replaces)
//   status  one of BODHI_STATUSES (no Closed Won)
//   tier    Launch | Grow | Starter
// Any other key (rep_id included) is rejected, not ignored. Owner-owned
// prospects only; a stage-history row is written only when the pipeline
// stage changes (bodhi_update_prospect, migrations/021).

const ALLOWED = new Set(['notes', 'status', 'tier']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await bodhiGuard(req, 'write');
  if ('res' in g) return g.res;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Send a JSON object' }, { status: 400 });
  const extra = Object.keys(body).filter(k => !ALLOWED.has(k));
  if (extra.length) return NextResponse.json({ error: `Field(s) not allowed: ${extra.join(', ')}. Only notes, status, tier.` }, { status: 400 });

  const { notes, status, tier } = body as Record<string, unknown>;
  if (notes !== undefined && (typeof notes !== 'string' || !notes.trim() || notes.length > 2000)) {
    return NextResponse.json({ error: 'notes must be a non-empty string up to 2,000 characters' }, { status: 400 });
  }
  if (status !== undefined && (typeof status !== 'string' || !BODHI_STATUSES.includes(status))) {
    return NextResponse.json({ error: `status must be one of: ${BODHI_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (tier !== undefined && (typeof tier !== 'string' || !BODHI_TIERS.includes(tier))) {
    return NextResponse.json({ error: `tier must be one of: ${BODHI_TIERS.join(', ')}` }, { status: 400 });
  }
  if (notes === undefined && status === undefined && tier === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await g.admin.rpc('bodhi_update_prospect', {
    p_owner: g.ownerId, p_id: id,
    p_note: typeof notes === 'string' ? notes.trim() : null,
    p_status: (status as string | undefined) ?? null,
    p_tier: (tier as string | undefined) ?? null,
  });
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    if (error.code === 'P0001') return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('bodhi_update_prospect error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json(data);
}
