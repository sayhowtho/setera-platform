// "Commission (15% of first payment)" — one calculation shared by High Table
// → Rep Management and the /rep Earnings "Total Earned" card (Alex,
// 2026-10-01). Kept separate from the sales-based engine in compensation.ts.
//
// Current plans (Launch $697 / Grow $1,348 / Starter $2,247) pay 15% of that
// price: $104.55 / $202.20 / $337.05. Legacy clients (pre-V2 Starter $2,500 /
// Pro / Regional, by term) keep the old price table — DISPLAY ONLY, for the
// one existing legacy client (prod: Northfield Roofing, "Starter 3-Month"); deleted
// after Northfield cancels (Alex, 2026-10-02). New data can't reach
// it: every plan input offers only Launch / Grow / Starter, and Move to
// Signups never gives a legacy tier a plan (lib/client-tier.ts).
//
// Which is which: "Starter" exists in both systems. A client is on a current
// plan when (1) their first recorded sale is on a current plan slug (launch /
// grow / starter_v2) — the source of truth — or (2) their plan text is a
// current plan name: starts with Launch or Grow (current-only names), or is
// exactly "Starter" (what Move to Signups saves, lib/client-tier.ts; legacy
// plans always carry a term, e.g. "Starter Monthly"), or (3) their tier is
// launch / grow (migrations/029). A client with no recorded sale and no plan
// shows $0 "Plan not set", whatever its tier — Move to Signups leaves legacy
// tiers without a plan, so a new conversion never shows a legacy price. The
// legacy table applies only to a legacy plan name (e.g. prod's Jul 3 client,
// "Starter 3-Month").

export const CURRENT_PLAN_PRICES: Record<'Launch' | 'Grow' | 'Starter', number> = { Launch: 697, Grow: 1348, Starter: 2247 };
const SLUG_TO_PLAN: Record<string, keyof typeof CURRENT_PLAN_PRICES> = { launch: 'Launch', grow: 'Grow', starter_v2: 'Starter' };
const RATE = 0.15;

// Legacy upfront table (same figures as lib/legacyRevenue.ts and the old
// getUpfrontCommission in both portals).
const LEGACY_UPFRONT: Record<'starter' | 'pro' | 'regional', Record<'monthly' | '3_month' | '6_month' | 'annual', number>> = {
  starter: { monthly: 2500, '3_month': 6000, '6_month': 10500, annual: 21000 },
  pro: { monthly: 6500, '3_month': 15600, '6_month': 27300, annual: 54600 },
  regional: { monthly: 8000, '3_month': 19200, '6_month': 33600, annual: 84000 },
};

export type FirstPaymentClient = { plan?: string | null; tier?: string | null; payment_type?: string | null };
export type FirstPaymentCommission = { amount: number; basis: 'current' | 'legacy' | 'unknown'; planLabel: string };

// The client's current plan, or null (legacy plan name, or not set). Shared
// with Active Clients MRR (lib/client-revenue.ts).
export function currentPlanOf(client: FirstPaymentClient, saleSlug?: string | null): keyof typeof CURRENT_PLAN_PRICES | null {
  const planName = (client.plan || '').trim().toLowerCase();
  const tierName = (client.tier || '').trim().toLowerCase();
  return (saleSlug && SLUG_TO_PLAN[saleSlug])
    || (/^launch\b/.test(planName) || tierName === 'launch' ? 'Launch'
      : /^grow\b/.test(planName) || tierName === 'grow' ? 'Grow'
      : planName === 'starter' ? 'Starter' : null);
}

export function firstPaymentCommission(client: FirstPaymentClient, saleSlug?: string | null): FirstPaymentCommission {
  const planName = (client.plan || '').trim().toLowerCase();
  const current = currentPlanOf(client, saleSlug);
  if (current) {
    return { amount: Math.round(CURRENT_PLAN_PRICES[current] * RATE * 100) / 100, basis: 'current', planLabel: current };
  }
  if (!saleSlug && !planName) return { amount: 0, basis: 'unknown', planLabel: 'Plan not set' };
  const text = `${client.tier || ''} ${client.plan || ''}`.toLowerCase();
  const tier = text.includes('regional') ? 'regional' : text.includes('pro') ? 'pro' : 'starter';
  const pt = (client.payment_type || '').toLowerCase();
  const plan = (client.plan || '').toLowerCase();
  const term = pt.includes('annual') || plan.includes('annual') || plan.includes('year') ? 'annual'
    : pt === '6_month' || plan.includes('6 month') || plan.includes('6-month') ? '6_month'
    : pt === '3_month' || plan.includes('3 month') || plan.includes('3-month') ? '3_month'
    : 'monthly';
  return { amount: Math.round(LEGACY_UPFRONT[tier][term] * RATE), basis: 'legacy', planLabel: `${tier[0].toUpperCase()}${tier.slice(1)} (legacy)` };
}

// "$8,565" / "$104.55": cents only when there are some.
export const fmtCommission = (n: number) => '$' + n.toLocaleString('en-CA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
