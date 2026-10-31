// Businesses that see DashboardV2 (the real-data client dashboard) instead
// of the legacy fallback dashboard. In production this list held the demo
// tenant plus the live client accounts it was rolled out to; the public copy
// keeps only the demo tenant. (A database flag would be the cleaner design.)

// Demo Roofing Co test tenant (client@example.com).
export const DEMO_ROOFING_CO_BUSINESS_ID = '00000000-0000-4000-8000-0000000000d1';

// Example of a second enabled business (a real client in production).
const EXAMPLE_CLIENT_BUSINESS_ID = '00000000-0000-4000-8000-0000000000c1';

export function isDashboardV2Enabled(business: { id?: string | null } | null | undefined): boolean {
  return business?.id === DEMO_ROOFING_CO_BUSINESS_ID || business?.id === EXAMPLE_CLIENT_BUSINESS_ID;
}

// Demo Roofing Co's seeded "Spring Thaw Damage Discovery" calls are all
// dated April 1, 2026 (see scripts/seed-demo-roofing-co.mjs), but Dashboard/
// Analytics compute their rolling 7/30/90-day windows off the real clock —
// so on any day after April 2026, those views read empty for this demo
// account. Pinning "now" to the day after the seeded story (only for this
// exact business_id) keeps the demo's numbers matching the reseed spec
// whenever it's shown. Every other business, including the other id
// above, still gets the real Date.now() — this must never change what a
// real client's own rolling windows show.
const DEMO_ROOFING_CO_FIXED_NOW = new Date('2026-04-02T18:00:00.000Z'); // noon, Apr 2 2026, America/Regina (UTC-6)

export function getEffectiveNow(business: { id?: string | null } | null | undefined): Date {
  return business?.id === DEMO_ROOFING_CO_BUSINESS_ID ? DEMO_ROOFING_CO_FIXED_NOW : new Date();
}
