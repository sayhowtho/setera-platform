// Move to Signups: the tier, plan and province a converted prospect's client
// row gets (Alex, 2026-10-02).
//
// clients.tier is lowercase only (clients_tier_check; migrations/029 adds
// launch and grow next to the legacy values). A current tier also saves the
// current plan name as clients.plan ("Launch" / "Grow" / "Starter"), so the
// 15%-of-first-payment figure uses current prices before any sale is
// recorded (lib/first-payment.ts). A legacy tier (pro / regional /
// enterprise / national) keeps its tier but gets NO plan: a new conversion
// never shows a legacy price — it shows "Plan not set" / $0 until a sale is
// recorded on Launch, Grow or Starter. A blank or unrecognised tier stays
// blank. Province: the prospect's own, else inferred from the city/phone the
// same way the Bodhi import does (resolveProvince); never a default.

import { resolveProvince } from './canada-places';

export const CLIENT_TIERS = ['starter', 'pro', 'regional', 'enterprise', 'national', 'launch', 'grow'] as const;
export const CURRENT_PLAN_NAMES = ['Launch', 'Grow', 'Starter'] as const;
const CURRENT_PLAN_NAME: Record<string, string> = { launch: 'Launch', grow: 'Grow', starter: 'Starter' };

export function clientTierAndPlan(prospectTier?: string | null): { tier: string | null; plan: string | null } {
  const t = (prospectTier || '').trim().toLowerCase();
  if (CURRENT_PLAN_NAME[t]) return { tier: t, plan: CURRENT_PLAN_NAME[t] };
  if ((CLIENT_TIERS as readonly string[]).includes(t)) return { tier: t, plan: null };
  return { tier: null, plan: null };
}

type ProspectForClient = { tier?: string | null; province?: string | null; city?: string | null; phone?: string | null; contact_phone?: string | null };

// Plan dropdowns offer only Launch / Grow / Starter; blank shows unset. A
// client whose stored plan is a legacy value (only Northfield Roofing on prod,
// "Starter 3-Month", until it cancels) sees that plan read-only instead —
// isLegacyPlan() — and a save never writes it (planUpdate).
export function planForDropdown(plan?: string | null): string {
  const p = (plan || '').trim().toLowerCase();
  return CURRENT_PLAN_NAMES.find(n => n.toLowerCase() === p) ?? '';
}

export function isLegacyPlan(plan?: string | null): boolean {
  return !!(plan || '').trim() && !planForDropdown(plan);
}

// What a form save writes for the plan: only a chosen current plan. Left
// unset, the stored plan is untouched (so saving other fields can never
// blank or change a legacy client's plan).
export function planUpdate(chosen?: string | null): { plan?: string } {
  const p = planForDropdown(chosen);
  return p ? { plan: p } : {};
}

export function clientFieldsFromProspect(p: ProspectForClient): { tier: string | null; plan: string | null; province: string | null } {
  return { ...clientTierAndPlan(p.tier), province: resolveProvince(p.province, p.city, [p.phone, p.contact_phone]).province };
}
