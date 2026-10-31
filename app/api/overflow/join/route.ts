import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getServiceClient } from '@/lib/server-auth';
import { ingestFromPublic } from '@/lib/overflow/ingest';

export const dynamic = 'force-dynamic';

const RATE_MAX = 5;            // requests per IP per window; the 6th gets 429
const RATE_WINDOW = '1 hour';

// The response for a new email and an already-listed (or unsubscribed) email
// is byte-for-byte identical, so the form can't be used to enumerate emails.
const OK = () => NextResponse.json({ success: true, message: "You're on the list" });

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const admin = getServiceClient();

  // Rate limit per IP (hashed; the raw IP is never stored). Independent of the
  // submitted email, so a 429 leaks nothing about list membership.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const bucket = 'overflow_join:' + createHash('sha256').update(ip + ':' + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')).digest('hex').slice(0, 32);
  const { data: allowed, error: rlError } = await admin.rpc('overflow_rate_limit_hit', {
    p_bucket: bucket, p_window: RATE_WINDOW, p_max: RATE_MAX,
  });
  if (rlError) return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  // Honeypot: real users never see or fill this field. Bots get the same
  // success response and nothing is written.
  if (typeof body.company_website === 'string' && body.company_website.trim() !== '') return OK();

  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : '');
  try {
    const outcome = await ingestFromPublic(admin, {
      email: str(body.email), businessName: str(body.businessName), contactName: str(body.firstName), location: str(body.location),
    });
    if (outcome === 'invalid_email') return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    return OK();   // created | duplicate | suppressed: indistinguishable
  } catch (err) {
    console.error('overflow join error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
