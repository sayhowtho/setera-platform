export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { loadRoleHistory, heldRoleDuring, roleAt } from '@/lib/role-history';

// Setter activity for a Regina-time date range. Read with the service client
// behind an admin/owner check, so one setter's numbers are never exposed to
// another. Cancelled appointments are excluded (only active or completed count). Regina is a fixed UTC-6 (no DST): a Regina day is 06:00Z -> 06:00Z.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const reginaStartUtc = (d: string) => new Date(d + 'T00:00:00-06:00').toISOString();

export async function POST(req: Request) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = auth.admin;

  const { start, end } = await req.json().catch(() => ({}));
  if (!DATE_RE.test(start || '') || !DATE_RE.test(end || '') || end < start) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD, end >= start) required' }, { status: 400 });
  }
  const from = reginaStartUtc(start);
  const to = new Date(new Date(reginaStartUtc(end)).getTime() + 24 * 3600 * 1000).toISOString(); // exclusive

  // Everyone who was a setter at any point in the range (role_history,
  // migrations/027), not just people whose role is setter right now, so a
  // promoted rep's setter-era work still shows here. Only what they did while
  // a setter is counted. Falls back to current role if there's no history.
  const history = await loadRoleHistory(admin);
  const wereSetters = heldRoleDuring(history, 'setter', from, to);
  const { data: current, error: sErr } = await admin.from('profiles').select('id, full_name, email, role').eq('role', 'setter');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  (current || []).forEach((p: { id: string }) => wereSetters.add(p.id));
  const { data: people, error: pErr } = wereSetters.size
    ? await admin.from('profiles').select('id, full_name, email, role').in('id', [...wereSetters]).order('full_name')
    : { data: [], error: null };
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const setters = (people || []).map((p: { id: string; full_name: string | null; email: string; role: string }) => ({ id: p.id, full_name: p.full_name, email: p.email, now_role: p.role }));
  const ids = setters.map(s => s.id);
  if (ids.length === 0) return NextResponse.json({ setters: [], activities: [], appointments: [] });

  const [acts, appts] = await Promise.all([
    admin.from('prospect_activities').select('id, rep_id, prospect_id, type, outcome, notes, follow_up_date, created_at, prospects(company_name, contact_name)')
      .in('rep_id', ids).gte('created_at', from).lt('created_at', to).order('created_at'),
    admin.from('appointments').select('id, setter_id, business_name, contact_name, scheduled_date, scheduled_time, status, notes, created_at')
      .in('setter_id', ids).or('status.is.null,status.neq.Cancelled').gte('created_at', from).lt('created_at', to).order('created_at'),
  ]);
  if (acts.error || appts.error) return NextResponse.json({ error: (acts.error || appts.error)!.message }, { status: 500 });
  const nowRole = new Map(setters.map(s => [s.id, s.now_role]));
  const asSetter = (userId: string, at: string) => roleAt(history, userId, at, nowRole.get(userId) ?? null) === 'setter';
  const activities = (acts.data || []).filter((a: { rep_id: string; created_at: string }) => asSetter(a.rep_id, a.created_at));
  const appointments = (appts.data || []).filter((a: { setter_id: string; created_at: string }) => asSetter(a.setter_id, a.created_at));

  return NextResponse.json({ setters, activities, appointments });
}
