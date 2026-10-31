import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

type Row = {
  id: string; prospect_id: string; requester_id: string; note: string | null; status: string;
  previous_owner_id: string | null; created_at: string; decided_at: string | null; decided_by: string | null;
  prospects: { company_name: string; city: string | null; trade: string | null; status: string | null; rep_id: string | null; last_contacted_at: string | null; updated_at: string | null } | null;
};

// High Table → Lead Requests. Admin/owner only: this is the one place real
// owner and setter names are shown next to a request.

// GET: pending requests + the 30 most recent decisions.
export async function GET(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const select = 'id, prospect_id, requester_id, note, status, previous_owner_id, created_at, decided_at, decided_by, prospects(company_name, city, trade, status, rep_id, last_contacted_at, updated_at)';
  const [pending, decided] = await Promise.all([
    admin.from('lead_requests').select(select).eq('status', 'pending').order('created_at', { ascending: true }),
    admin.from('lead_requests').select(select).neq('status', 'pending').order('decided_at', { ascending: false }).limit(30),
  ]);
  if (pending.error || decided.error) return NextResponse.json({ error: (pending.error || decided.error)!.message }, { status: 500 });

  const pendingRows = (pending.data || []) as unknown as Row[];
  const decidedRows = (decided.data || []) as unknown as Row[];
  const rows = [...pendingRows, ...decidedRows];
  const ids = new Set<string>();
  for (const r of rows) [r.requester_id, r.previous_owner_id, r.decided_by, r.prospects?.rep_id].forEach(id => id && ids.add(id));
  const { data: people } = ids.size
    ? await admin.from('profiles').select('id, full_name, email, role').in('id', [...ids])
    : { data: [] };
  const nameOf = new Map<string, string>(((people || []) as { id: string; full_name: string | null; email: string | null }[]).map(p => [p.id, p.full_name || p.email || 'Unknown']));

  const shape = (r: Row) => ({
    id: r.id, status: r.status, note: r.note, createdAt: r.created_at, decidedAt: r.decided_at,
    prospectId: r.prospect_id,
    businessName: r.prospects?.company_name ?? '(deleted)', city: r.prospects?.city ?? null, trade: r.prospects?.trade ?? null,
    leadStatus: r.prospects?.status ?? null,
    lastActivity: r.prospects ? ([r.prospects.last_contacted_at, r.prospects.updated_at].filter(Boolean).sort().pop() ?? null) : null,
    requesterName: nameOf.get(r.requester_id) ?? 'Unknown',
    currentOwnerName: r.prospects?.rep_id ? (nameOf.get(r.prospects.rep_id) ?? 'Unknown') : null,
    previousOwnerName: r.previous_owner_id ? (nameOf.get(r.previous_owner_id) ?? 'Unknown') : null,
    decidedByName: r.decided_by ? (nameOf.get(r.decided_by) ?? 'Unknown') : null,
  });
  return NextResponse.json({ pending: pendingRows.map(shape), decided: decidedRows.map(shape) });
}

// POST { id, action: 'approve' | 'deny' }. Approve reassigns the lead to the
// requesting setter and denies any other pending requests for it
// (decide_lead_request, migrations/018 — one transaction, row-locked).
export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id || (body.action !== 'approve' && body.action !== 'deny')) {
    return NextResponse.json({ error: 'id and action (approve|deny) required' }, { status: 400 });
  }
  const { data, error } = await auth.admin.rpc('decide_lead_request', { p_request_id: id, p_approve: body.action === 'approve', p_admin_id: auth.user.id });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === 'P0001' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
