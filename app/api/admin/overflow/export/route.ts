import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { toCsv } from '@/lib/overflow/csv';

export const dynamic = 'force-dynamic';

// The sending list. Suppression and consent-scope filters are enforced here,
// server-side, regardless of anything the High Table UI has filtered.
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const out: unknown[][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await auth.admin.from('overflow_waitlist')
      .select('email, business_name, contact_name, location, source, originating_rep_name_snapshot, originating_rep_email_snapshot, created_at, status, consent_basis')
      .not('status', 'in', '(unsubscribed,removed)')
      .eq('consent_scope', 'overflow_invitation')
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    for (const w of data ?? []) {
      out.push([w.email, w.business_name, w.contact_name, w.location, w.source, w.originating_rep_name_snapshot,
        w.originating_rep_email_snapshot, w.created_at, w.status, w.consent_basis]);
    }
    if (!data || data.length < 1000) break;
  }
  const csv = toCsv(['email', 'business', 'contact', 'location', 'source', 'rep name', 'rep email', 'date', 'status', 'consent basis'], out);
  return new NextResponse(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="overflow-early-access-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  } });
}
