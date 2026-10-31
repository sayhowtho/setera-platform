// Shared monthly-revenue calculation for the pre-V2 tier system
// (Starter/Pro/Regional, monthly/3-month/6-month/annual). Replaces the two
// duplicate, disagreeing implementations that used to live separately in
// app/admin/page.tsx (getMRRFromPlan) and app/rep/page.tsx (getMRRFromTier +
// TIER_MRR) — that duplication is why admin and rep dashboards could show
// different numbers for the same client.
//
// A fixed-term prepay (3/6/12-month) is not recurring revenue — it's a lump
// sum covering a defined period. This amortizes that lump sum evenly across
// the term and stops counting once the term has actually elapsed, rather
// than treating the full amount as if it renews every month forever.
//
// New-system (Launch/Grow/Starter CAD) plans are unaffected — this module is
// legacy-tier only, matching how the rest of that boundary was drawn earlier.

export type LegacyRevenueClient = {
  plan: string;
  tier?: string | null;
  payment_type?: string | null;
  created_at: string;
};

type TierKey = 'starter' | 'pro' | 'regional';
type TermKey = 'monthly' | '3_month' | '6_month' | 'annual';

// Matches app/admin/page.tsx's getUpfrontCommission and app/rep/page.tsx's
// UPFRONT_MATRIX exactly — those two already agreed with each other; this is
// the single copy going forward.
const UPFRONT_MATRIX: Record<TierKey, Record<TermKey, number>> = {
  starter: { monthly: 2500, '3_month': 6000, '6_month': 10500, annual: 21000 },
  pro: { monthly: 6500, '3_month': 15600, '6_month': 27300, annual: 54600 },
  regional: { monthly: 8000, '3_month': 19200, '6_month': 33600, annual: 84000 },
};

const TERM_MONTHS: Record<TermKey, number> = { monthly: 1, '3_month': 3, '6_month': 6, annual: 12 };

function detectTier(client: LegacyRevenueClient): TierKey {
  const t = (client.tier || client.plan || '').toLowerCase();
  if (t.includes('regional')) return 'regional';
  if (t.includes('pro')) return 'pro';
  return 'starter';
}

function detectTerm(client: LegacyRevenueClient): TermKey {
  const pt = (client.payment_type || '').toLowerCase();
  if (pt.includes('annual')) return 'annual';
  if (pt === '6_month') return '6_month';
  if (pt === '3_month') return '3_month';
  if (pt === 'monthly') return 'monthly';

  // payment_type isn't populated for every legacy client (e.g. Sam's) —
  // fall back to the same free-text plan parsing getUpfrontCommission uses.
  const p = (client.plan || '').toLowerCase();
  if (p.includes('annual') || p.includes('year')) return 'annual';
  if (p.includes('6 month') || p.includes('6-month')) return '6_month';
  if (p.includes('3 month') || p.includes('3-month')) return '3_month';
  return 'monthly';
}

// termStart: pass the client's business.go_live_date when available (more
// accurate — billing/term effectively starts at go-live); falls back to the
// client's created_at when not.
export function getMonthlyRevenueContribution(client: LegacyRevenueClient, termStart?: string | null): number {
  const tier = detectTier(client);
  const term = detectTerm(client);
  const totalUpfront = UPFRONT_MATRIX[tier][term];

  if (term === 'monthly') return totalUpfront; // genuinely recurring — no term to expire

  const termMonths = TERM_MONTHS[term];
  const monthlyEquivalent = totalUpfront / termMonths;
  const start = new Date(termStart || client.created_at).getTime();
  const end = start + termMonths * 30 * 86_400_000;
  return Date.now() <= end ? monthlyEquivalent : 0;
}
