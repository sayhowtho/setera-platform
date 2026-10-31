// Pipeline-value estimate over the given open leads/opportunities: each one
// counts at its real recorded value (calls.income_collected) when it has
// one, and at the business's average job value only when it doesn't. Shared
// by the real Analytics tab and DashboardV2's "This Month" strip so both use
// the same formula instead of two inlined copies.
//
// "Recorded" means non-null — an explicitly entered 0 counts as a real $0,
// not as "unknown, use the average".
//
// Leads already at the income_collected stage are excluded: that money is
// already reported as Revenue Recovered, and counting it here too would
// double-count it (e.g. Analytics' "recovered $X ... and $Y more in the
// pipeline").
export function estimatePipelineValue(
  leads: { income_collected?: number | null; pipeline_stage?: string | null }[],
  avgJobValue: number | null | undefined,
): number {
  return leads
    .filter(c => c.pipeline_stage !== 'income_collected')
    .reduce((sum, c) => sum + (c.income_collected != null ? Number(c.income_collected) : (avgJobValue || 0)), 0);
}
