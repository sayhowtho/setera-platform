import { NextRequest, NextResponse } from 'next/server';
import { requireRole, QUICK_ADD_ROLES } from '@/lib/server-auth';
import { ingestFromRep } from '@/lib/overflow/ingest';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, QUICK_ADD_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  // Only these fields are read. Any rep_id / rep fields in the body are ignored:
  // the acting rep is auth.user.id from the verified session, and the database
  // credits the actor itself.
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
  try {
    const result = await ingestFromRep(auth.admin, auth.user.id, {
      email: str(body.email), businessName: str(body.businessName), contactName: str(body.contactName), location: str(body.location),
      consent: body.consent === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? '';
    if (/consent confirmation is required/.test(msg)) return NextResponse.json({ error: 'Consent confirmation is required' }, { status: 400 });
    console.error('overflow rep-add error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
