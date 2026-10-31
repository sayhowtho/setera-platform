import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { searchBusinesses, SETTER_PORTAL_ROLES } from '@/lib/lead-requests';

export const dynamic = 'force-dynamic';

// "Is this business already in Setera?" — searches every prospect, client and
// Web Lead regardless of owner, but only ever returns the setter-safe
// BusinessMatch shape (no owner names, notes or contact details).
export async function POST(req: Request) {
  const auth = await requireRole(req, SETTER_PORTAL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
  const name = str(body.name), city = str(body.city), trade = str(body.trade);
  const phones = [str(body.phone), str(body.contactPhone)].filter(Boolean);
  if (!name && phones.length === 0) return NextResponse.json({ matches: [] });

  try {
    // 'lookup' = Call Log "Check a business" box (partial names allowed);
    // anything else = Add Prospect (tight name rules + city/trade agreement).
    const matches = await searchBusinesses(auth.admin, auth.user.id, { name, phones, city, trade, prefix: body.mode === 'lookup' });
    return NextResponse.json({ matches });
  } catch (err) {
    console.error('business-search error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
