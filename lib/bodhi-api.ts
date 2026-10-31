import { createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/server-auth';

// Shared by /api/bodhi/prospects and /api/bodhi/prospects/[id] — the API
// Bodhi (Alex's AI assistant) uses instead of the Supabase service-role key.
//
// One dedicated secret, BODHI_API_KEY, sent as the `x-bulk-key` header and
// read by these routes only. It is not a Supabase key, so it's useless
// against the database directly. All access is scoped (in SQL, migrations
// 020/021) to prospects owned by the owner account.

export const BODHI_SOURCE = 'bodhi'; // existing High Table filters key off this exact value

// Everything except Closed Won — that one drives "Won This Month" and the
// lead-request rules. Commissions are never driven by prospect status
// (they come only from admin-recorded sales). Mirrored as the SQL backstop
// in bodhi_update_prospect (migrations/021).
export const BODHI_STATUSES = [
  'Not Contacted', 'Attempted', 'Contacted', 'Follow Up Required', 'Interested',
  'Demo Scheduled', 'Proposal Sent', 'Closed Lost', 'Future Opportunity',
];
export const BODHI_TIERS = ['Launch', 'Grow', 'Starter'];

// Initial pipeline stage — same mapping as getColumnForStatus() in the portal
// pages and pipeline_stage_for_status() in migrations/021.
export function stageForStatus(status: string) {
  if (['Interested', 'Demo Scheduled'].includes(status)) return 'Meeting';
  if (status === 'Proposal Sent') return 'Proposal';
  if (status === 'Closed Won') return 'Won';
  return 'New';
}

const digest = (s: string) => createHash('sha256').update(s).digest();

// Bare 401 — no body, no hint which check failed.
export const unauthorized = () => new Response(null, { status: 401 });

export function bodhiAuthorized(req: Request): boolean {
  // HTTPS only on any Vercel deployment (TLS ends at Vercel's edge, which sets
  // x-forwarded-proto). Plain HTTP is allowed off-Vercel so the staging tests
  // can run against a local `next dev`.
  if (process.env.VERCEL && req.headers.get('x-forwarded-proto') !== 'https') return false;
  const expected = process.env.BODHI_API_KEY || '';
  // Refuse a missing/short key, or one accidentally set to the service-role key.
  if (expected.length < 32 || expected === process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const given = (req.headers.get('x-bulk-key') || '').trim();
  return given.length > 0 && timingSafeEqual(digest(given), digest(expected));
}

// Separate hourly buckets for reads and writes (POST + PATCH), via the
// generic limiter from migrations/009. Env overrides exist for the tests.
const LIMITS = {
  read: () => Number(process.env.BODHI_READ_RATE_MAX) || 300,
  write: () => Number(process.env.BODHI_WRITE_RATE_MAX) || 60,
};
export async function bodhiRateLimited(admin: SupabaseClient, kind: 'read' | 'write'): Promise<Response | null> {
  const bucket = (process.env.BODHI_RATE_BUCKET || 'bodhi') + ':' + kind;
  const { data: allowed, error } = await admin.rpc('overflow_rate_limit_hit', { p_bucket: bucket, p_window: '1 hour', p_max: LIMITS[kind]() });
  if (error) return Response.json({ error: 'Something went wrong' }, { status: 500 });
  if (!allowed) return Response.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  return null;
}

// The single owner account every Bodhi prospect belongs to.
export async function getOwnerId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.from('profiles').select('id').eq('role', 'owner').limit(2);
  if (error || !data || data.length !== 1) {
    console.error('bodhi api: could not resolve a single owner profile', error);
    return null;
  }
  return data[0].id;
}

// Auth + rate limit + owner, in that order. Returns either a ready Response
// (reject) or what the handler needs.
export async function bodhiGuard(req: Request, kind: 'read' | 'write'):
  Promise<{ res: Response } | { admin: SupabaseClient; ownerId: string }> {
  if (!bodhiAuthorized(req)) return { res: unauthorized() };
  const admin = getServiceClient();
  const limited = await bodhiRateLimited(admin, kind);
  if (limited) return { res: limited };
  const ownerId = await getOwnerId(admin);
  if (!ownerId) return { res: Response.json({ error: 'Owner account not configured' }, { status: 500 }) };
  return { admin, ownerId };
}
