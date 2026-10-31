import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { isStaleActivity, LEAD_STALE_DAYS, SETTER_PORTAL_ROLES } from '@/lib/lead-requests';

export const dynamic = 'force-dynamic';

// Setter side of lead requests. lead_requests is service-role only
// (migrations/018), so every read/write is scoped to the caller here.

// GET: the caller's own requests (for the Call Log list + outcome notices).
export async function GET(req: Request) {
  const auth = await requireRole(req, SETTER_PORTAL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.admin
    .from('lead_requests')
    .select('id, status, note, created_at, decided_at, requester_seen_at, prospects(company_name, city, trade)')
    .eq('requester_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = { id: string; status: string; note: string | null; created_at: string; decided_at: string | null; requester_seen_at: string | null; prospects: { company_name: string; city: string | null; trade: string | null } | null };
  const requests = ((data || []) as unknown as Row[]).map(r => ({
    id: r.id, status: r.status, note: r.note, createdAt: r.created_at, decidedAt: r.decided_at,
    seen: !!r.requester_seen_at,
    businessName: r.prospects?.company_name ?? 'Business', city: r.prospects?.city ?? null, trade: r.prospects?.trade ?? null,
  }));
  return NextResponse.json({ requests });
}

// POST { prospectId, note? }: request a stale lead.
export async function POST(req: Request) {
  const auth = await requireRole(req, SETTER_PORTAL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const body = await req.json().catch(() => ({}));
  const prospectId = typeof body.prospectId === 'string' ? body.prospectId : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(prospectId)) return NextResponse.json({ error: 'Invalid lead' }, { status: 400 });

  const { data: p } = await admin.from('prospects').select('id, rep_id, status, created_at, updated_at, last_contacted_at').eq('id', prospectId).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (p.rep_id === auth.user.id) return NextResponse.json({ error: 'This lead is already yours' }, { status: 400 });
  if (p.status === 'Closed Won') return NextResponse.json({ error: 'This lead can’t be requested' }, { status: 400 });

  // Re-check staleness here — the UI's "stale" flag is only a hint.
  const { data: lastAct } = await admin.from('prospect_activities').select('created_at').eq('prospect_id', prospectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const last = [p.created_at, p.updated_at, p.last_contacted_at, lastAct?.created_at]
    .filter(Boolean).map(d => new Date(d as string).getTime()).reduce((a, b) => Math.max(a, b), 0);
  if (!isStaleActivity(last ? new Date(last).toISOString() : null)) {
    return NextResponse.json({ error: `This lead has had activity in the last ${LEAD_STALE_DAYS} days` }, { status: 409 });
  }

  const { data, error } = await admin.from('lead_requests')
    .insert({ prospect_id: prospectId, requester_id: auth.user.id, note: note || null })
    .select('id').single();
  if (error) {
    // lead_requests_one_pending: one pending request per lead per setter.
    if (error.code === '23505') return NextResponse.json({ error: 'You already have a pending request for this lead' }, { status: 409 });
    console.error('lead request insert error:', error);
    return NextResponse.json({ error: 'Could not send request' }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

// PATCH { ids }: the setter dismissed these outcome notices.
export async function PATCH(req: Request) {
  const auth = await requireRole(req, SETTER_PORTAL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true });

  const { error } = await auth.admin.from('lead_requests')
    .update({ requester_seen_at: new Date().toISOString() })
    .in('id', ids).eq('requester_id', auth.user.id).neq('status', 'pending').is('requester_seen_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
