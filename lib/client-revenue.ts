// A client's monthly revenue for High Table "Active Clients" MRR and the /rep
// cancellation form's "MRR lost" pre-fill (Alex, 2026-10-02):
//   - current plan (first recorded sale, or plan Launch / Grow / Starter):
//     the current monthly price, $697 / $1,348 / $2,247;
//   - a legacy plan name (only Northfield Roofing on prod, until it cancels): the
//     legacy table in lib/legacyRevenue.ts, unchanged;
//   - no plan and no sale: 0 (nothing invented).

import { currentPlanOf, CURRENT_PLAN_PRICES } from './first-payment';
import { getMonthlyRevenueContribution } from './legacyRevenue';

export type RevenueClient = { plan?: string | null; tier?: string | null; payment_type?: string | null; created_at: string };

export function clientMonthlyRevenue(client: RevenueClient, opts: { saleSlug?: string | null; termStart?: string | null } = {}): number {
  const current = currentPlanOf(client, opts.saleSlug);
  if (current) return CURRENT_PLAN_PRICES[current];
  if (!(client.plan || '').trim()) return 0;
  return getMonthlyRevenueContribution({ ...client, plan: client.plan as string }, opts.termStart);
}
