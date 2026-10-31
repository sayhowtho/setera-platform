import { supabase } from './supabase';

export type CompTrack = 'setter_training' | 'setter' | 'setter_closer' | 'closer';
export type BonusType = 'sprint_30_day' | 'mrr_milestone_1' | 'mrr_milestone_2' | 'mrr_milestone_3';

export type Plan = {
  slug: string;
  display_name: string;
  monthly_price: number;
  currency: string;
  minutes_included: number;
  active: boolean;
};

export type RepCompensation = {
  rep_id: string;
  comp_track: CompTrack;
  rep_started_at: string;
  track_changed_at: string;
};

export type Sale = {
  id: string;
  client_id: string;
  prospect_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  plan_slug: string;
  plan_price: number;
  currency: string;
  sold_at: string;
};

export type CommissionEarning = {
  id: string;
  sale_id: string;
  rep_id: string;
  comp_track_snapshot: CompTrack;
  commission_rate: number;
  is_milestone_override: boolean;
  commission_amount: number;
  currency: string;
};

export type BonusAward = {
  id: string;
  rep_id: string;
  bonus_type: BonusType;
  amount: number;
  comp_track_at_award: CompTrack;
  qualifying_window_start: string | null;
  qualifying_window_end: string | null;
  awarded_at: string;
  due_at: string | null; // sprint: period close + 7 days (migrations/028)
};

const MILESTONE_OVERRIDE_INTERVAL = 10;

// Monthly MRR sprint (Sales Compensation Structure): new MRR in a person's
// monthly performance period; highest tier reached only; evaluated at period
// close; due within 7 days of close. No client-count gate.
export const SPRINT_TIERS = [
  { threshold: 4_182, amount: 1_000, label: 'Launch equivalent' },
  { threshold: 8_088, amount: 2_000, label: 'Grow equivalent' },
  { threshold: 13_482, amount: 4_000, label: 'Starter equivalent' },
] as const;
const SPRINT_PAYOUT_DAYS = 7;

const DEFAULT_TRAINING_CLIENT_COUNT = 6;

const MRR_MILESTONES: { type: BonusType; threshold: number; amount: number }[] = [
  { type: 'mrr_milestone_1', threshold: 89_880, amount: 30_000 },
  { type: 'mrr_milestone_2', threshold: 179_760, amount: 60_000 },
  { type: 'mrr_milestone_3', threshold: 269_640, amount: 100_000 },
];

// The permanent 5% Setter election is the only comp_track state that kills
// bonuses forever. Intended (Alex, 2026-10-01, #16): a permanent Setter earns
// a flat 5% commission and NO bonuses — no monthly sprint, no 12-month
// milestones, no every-10th payout. record_sale() (migrations/028) applies the
// same rule in the database.
//
// Each sale is credited to exactly ONE person (record_sale's p_rep_id); setter
// and closer credit on the same client is not split. Intended (#17). setter_training / setter_closer / closer are otherwise
// treated identically by the compensation engine — there's no separate
// "advance to Closer" election gating payability; whether a given
// milestone/bonus is payable depends on sale count vs. the training
// threshold (see isPastTraining below), not on which of those three values
// comp_track happens to hold.
export function isPermanentSetter(track: CompTrack): boolean {
  return track === 'setter';
}

// Has this rep recorded at least `trainingClientCount` qualifying sales
// already — i.e. is the NEXT sale (the 7th, by default) past training.
// The training-period sales themselves never retroactively trigger a
// milestone/10th-sale payout even after this flips true; they only count
// toward the running totals that later sales build on.
export function isPastTraining(qualifyingClientCount: number, trainingClientCount: number): boolean {
  return qualifyingClientCount >= trainingClientCount;
}

async function getActivePlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*').eq('active', true);
  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  return (data ?? []) as Plan[];
}

// Configurable "first N clients" threshold — governs both the training
// cutoff and the 30-Day Sprint's required paying-client count (the spec
// ties these to the same number). Falls back to 6 if app_config has no row
// yet, so this is additive and doesn't require the config table to exist
// for existing behavior to keep working.
async function getTrainingClientCount(): Promise<number> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'setter_training_client_count').maybeSingle();
  const n = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TRAINING_CLIENT_COUNT;
}

export async function getRepCompensation(repId: string): Promise<RepCompensation> {
  const { data, error } = await supabase.from('rep_compensation').select('*').eq('rep_id', repId).single();
  if (error || !data) {
    throw new Error(
      `No rep_compensation record for rep ${repId} — an admin must set up their compensation track before recording sales for them.`
    );
  }
  return data as RepCompensation;
}

export type RecordSaleParams = {
  clientId: string;
  repId: string; // the rep whose compensation this sale is credited toward
  planSlug: string;
  prospectId?: string;
  setterId?: string;
  closerId?: string;
  soldAt?: string; // defaults to now
  // Identifies ONE SUBMISSION ATTEMPT, not one client/plan — a caller that
  // retries after a timeout or a double-click should pass the SAME key each
  // time, so the retry is recognized as the same attempt rather than a new
  // sale. Omit only for a one-shot/scripted call with no retry path (e.g.
  // scripts/test-setter-attribution.mjs); the RPC generates one itself if
  // none is supplied, so that path stays safe, just not retry-idempotent.
  idempotencyKey?: string;
};

export type RecordSaleResult = {
  sale: Sale;
  commissionEarning: CommissionEarning;
  // true if this call matched an existing idempotency_key and returned the
  // sale/commission that a PRIOR call already created, rather than
  // inserting a new one.
  alreadyExisted: boolean;
};

// Delegates to the record_sale() Postgres function (migrations/011) — the
// two inserts (sales, then commission_earnings), the plan/rep-comp lookups,
// and the every-10th-sale override math all happen inside one
// security-definer transaction now, atomically, with a caller-supplied
// idempotency key so a retry can never create a duplicate. This function
// used to do both inserts itself via two separate REST calls with no
// transaction between them — see migrations/011's header for the three
// distinct ways that could silently leave an orphaned sales row.
export async function recordSale(params: RecordSaleParams): Promise<RecordSaleResult> {
  const { data, error } = await supabase.rpc('record_sale', {
    p_client_id: params.clientId,
    p_rep_id: params.repId,
    p_plan_slug: params.planSlug,
    p_idempotency_key: params.idempotencyKey ?? crypto.randomUUID(),
    p_prospect_id: params.prospectId ?? null,
    p_setter_id: params.setterId ?? null,
    p_closer_id: params.closerId ?? null,
    p_sold_at: params.soldAt ?? new Date().toISOString(),
  });

  if (error || !data) throw new Error(`Failed to record sale: ${error?.message ?? 'no result returned'}`);

  return {
    sale: data.sale as Sale,
    commissionEarning: data.commission_earning as CommissionEarning,
    alreadyExisted: !!data.already_existed,
  };
}


// ── Credited clients ──────────────────────────────────────────────────────
// One row per client credited to a person (credited_clients(), migrations/028):
// the client's FIRST credited sale (plan/price/date), how many sales, and
// whether the client is cancelled. A client counts once they've paid their
// first month and keeps counting for good: a later cancellation never removes
// credit toward training, milestones, the sprint or every-10th (Alex,
// 2026-10-01). `cancelled` is for display only. Upgrades and repeat sales for
// the same client never count again.
export type CreditedClient = { clientId: string; planSlug: string; planPrice: number; firstSoldAt: string; salesCount: number; cancelled: boolean };

export async function getCreditedClients(repId: string): Promise<CreditedClient[]> {
  const { data, error } = await supabase.rpc('credited_clients', { p_rep_id: repId });
  if (error) throw new Error(`Failed to load credited clients for ${repId}: ${error.message}`);
  return ((data ?? []) as { client_id: string; plan_slug: string; plan_price: number; first_sold_at: string; sales_count: number; cancelled: boolean }[])
    .map(r => ({ clientId: r.client_id, planSlug: r.plan_slug, planPrice: Number(r.plan_price), firstSoldAt: r.first_sold_at, salesCount: r.sales_count, cancelled: r.cancelled }));
}

// ── Regina calendar dates ─────────────────────────────────────────────────
// Periods and windows run on Regina calendar days (fixed UTC-6, no DST).
const REGINA_OFFSET_MS = 6 * 3_600_000;
export const reginaDateOf = (iso: string | Date) => new Date(new Date(iso).getTime() - REGINA_OFFSET_MS).toISOString().slice(0, 10);
export const reginaMidnightMs = (dateStr: string) => Date.parse(dateStr + 'T00:00:00-06:00');

// Same day-of-month k months later, clamped to the month's last day
// (Jan 31 -> Feb 28 -> Mar 31: each step is from the ORIGINAL day).
export function addMonthsToDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const shiftDate = (dateStr: string, days: number) => new Date(Date.parse(dateStr + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

// Kept for callers of the earlier helper (same calendar rule, Date in/out).
export function addMonths(d: Date, months: number): Date {
  return new Date(reginaMidnightMs(addMonthsToDate(reginaDateOf(d), months)));
}

// ── Monthly sprint periods ───────────────────────────────────────────────
// Period k = start date + k months (same day) through the day before the
// next one, e.g. start Sep 23 -> Sep 23–Oct 22, Oct 23–Nov 22. New MRR =
// initial plan of each client first paid inside the period (cancelled included).
export type SprintTierResult = { threshold: number; amount: number; label: string; achieved: boolean };
export type SprintPeriod = {
  index: number;            // 0-based
  startDate: string;        // Regina date, inclusive
  endDate: string;          // Regina date, inclusive (the day before the next period)
  closesAt: string;         // ISO: the moment the period closes (next period's start)
  dueAt: string;            // closesAt + 7 days
  closed: boolean;
  newMRR: number;
  clients: number;          // clients first paid in the period (cancelled included)
  tier: { threshold: number; amount: number; label: string } | null; // highest reached
};

export function computeSprintPeriods(startedAtIso: string, clients: CreditedClient[], now = new Date()): SprintPeriod[] {
  const startDate = reginaDateOf(startedAtIso);
  const paying = clients; // cancelled included: credit is permanent
  const periods: SprintPeriod[] = [];
  for (let k = 0; k < 600; k++) {
    const ps = addMonthsToDate(startDate, k);
    const next = addMonthsToDate(startDate, k + 1);
    const fromMs = reginaMidnightMs(ps), toMs = reginaMidnightMs(next);
    if (fromMs > now.getTime()) break;
    const inPeriod = paying.filter(c => { const t = Date.parse(c.firstSoldAt); return t >= fromMs && t < toMs; });
    const newMRR = inPeriod.reduce((sum, c) => sum + c.planPrice, 0);
    const reached = [...SPRINT_TIERS].reverse().find(t => newMRR >= t.threshold) ?? null;
    periods.push({
      index: k, startDate: ps, endDate: shiftDate(next, -1),
      closesAt: new Date(toMs).toISOString(), dueAt: new Date(toMs + SPRINT_PAYOUT_DAYS * 86_400_000).toISOString(),
      closed: toMs <= now.getTime(), newMRR, clients: inPeriod.length,
      tier: reached ? { threshold: reached.threshold, amount: reached.amount, label: reached.label } : null,
    });
  }
  return periods;
}

// ── 12-month milestones ──────────────────────────────────────────────────
// Window = start date -> same date 12 months later (Regina days). MRR = the
// initial plan of each client first paid inside the window (cancelled included), first 6
// included. Awards: each threshold pays its own amount — they stack ($30k +
// $60k + $100k = $190k total). Confirmed by Alex 2026-10-01 (#3).
export type MilestoneClient = { clientId: string; planSlug: string; planPrice: number; firstSoldAt: string; inWindow: boolean; sales: number; cancelled: boolean };
export type MilestoneProgress = {
  windowStart: string;
  windowEnd: string;
  windowOpen: boolean;
  paidClientCount: number;      // distinct clients who paid a first month, all-time
  clients: MilestoneClient[];
  windowMRR: number;
  thresholds: { type: BonusType; threshold: number; amount: number; reached: boolean; awarded: boolean }[];
  next: { threshold: number; remaining: number; percent: number } | null;
  notes: string[];              // what's excluded and why (informational)
};

export function computeMilestoneProgress(startedAtIso: string, clients: CreditedClient[], awarded: Set<BonusType>, now = new Date()): MilestoneProgress {
  const startDate = reginaDateOf(startedAtIso);
  const startMs = reginaMidnightMs(startDate), endMs = reginaMidnightMs(addMonthsToDate(startDate, 12));
  const list: MilestoneClient[] = clients.map(c => {
    const t = Date.parse(c.firstSoldAt);
    return { clientId: c.clientId, planSlug: c.planSlug, planPrice: c.planPrice, firstSoldAt: c.firstSoldAt, inWindow: t >= startMs && t < endMs, sales: c.salesCount, cancelled: c.cancelled };
  }).sort((a, b) => a.firstSoldAt.localeCompare(b.firstSoldAt));
  const counted = list.filter(c => c.inWindow);
  const windowMRR = counted.reduce((s, c) => s + c.planPrice, 0);
  const thresholds = MRR_MILESTONES.map(m => ({ ...m, reached: windowMRR >= m.threshold, awarded: awarded.has(m.type) }));
  const nextM = MRR_MILESTONES.find(m => windowMRR < m.threshold) ?? null;
  const notes: string[] = [];
  const outside = list.filter(c => !c.inWindow);
  if (outside.length) notes.push(`${outside.length} client(s) first paid after the 12-month window: not counted.`);
  const repeat = list.filter(c => c.sales > 1);
  if (repeat.length) notes.push(`${repeat.length} client(s) with an upgrade or repeat sale: counted once, at their initial plan.`);
  const cancelled = list.filter(c => c.cancelled);
  if (cancelled.length) notes.push(`${cancelled.length} client(s) cancelled since: still counted (credit is kept once the first month is paid).`);
  return {
    windowStart: new Date(startMs).toISOString(), windowEnd: new Date(endMs).toISOString(), windowOpen: now.getTime() < endMs,
    paidClientCount: clients.length, clients: list, windowMRR, thresholds,
    next: nextM ? { threshold: nextM.threshold, remaining: nextM.threshold - windowMRR, percent: Math.min(100, Math.round((windowMRR / nextM.threshold) * 100)) } : null,
    notes,
  };
}

// ── Awards ───────────────────────────────────────────────────────────────
async function getAwards(repId: string): Promise<BonusAward[]> {
  const { data, error } = await supabase.from('bonus_awards').select('*').eq('rep_id', repId).order('awarded_at');
  if (error) throw new Error(`Failed to load bonus awards for rep ${repId}: ${error.message}`);
  return (data ?? []) as BonusAward[];
}

async function awardBonus(repId: string, bonusType: BonusType, amount: number, compTrack: CompTrack, windowStart: string, windowEnd: string, dueAt: string | null): Promise<BonusAward | null> {
  const { data, error } = await supabase
    .from('bonus_awards')
    .insert({ rep_id: repId, bonus_type: bonusType, amount, comp_track_at_award: compTrack, qualifying_window_start: windowStart, qualifying_window_end: windowEnd, due_at: dueAt })
    .select()
    .single();
  if (error) {
    // Already recorded (unique per milestone / per sprint period) — not a failure.
    if (error.code === '23505') return null;
    throw new Error(`Failed to award ${bonusType} to rep ${repId}: ${error.message}`);
  }
  return data as BonusAward;
}

// ── Progress snapshot (read-only; the single source every dashboard reads) ─
export type PlanMilestoneProgress = {
  planSlug: string;
  displayName: string;
  countTowardNext: number;  // 0-9 in the current cycle of 10
  remaining: number;
  payoutAmount: number;     // full plan price, replaces the 15% on that client
  payable: boolean;         // false during training; the count still carries forward
};

export type CompensationProgress = {
  compTrack: CompTrack;
  repStartedAt: string;
  bonusEligible: boolean;
  trainingClientCount: number;
  qualifyingClientCount: number;   // distinct clients who paid a first month (not commission records)
  sprint: {
    current: SprintPeriod;
    tiers: SprintTierResult[];     // for the current period
    daysRemaining: number;
    history: (SprintPeriod & { award: BonusAward | null })[]; // closed periods, newest first
    payable: boolean;
  } | null;
  planMilestones: PlanMilestoneProgress[]; // separate count per plan (Launch / Grow / Starter) — confirmed 2026-10-01 (#13)
  mrrProgress: {
    cumulativeMRR: number;         // 12-month window MRR (same as MilestoneProgress.windowMRR)
    nextMilestone: { type: BonusType; threshold: number; amount: number } | null;
    percentComplete: number;
    remainingToNext: number;
    thresholds: { type: BonusType; threshold: number; amount: number; awarded: boolean }[];
  } | null;
  awards: BonusAward[];
};

export async function getCompensationProgress(repId: string): Promise<CompensationProgress> {
  const repComp = await getRepCompensation(repId);
  const [trainingClientCount, clients, awards] = await Promise.all([getTrainingClientCount(), getCreditedClients(repId), getAwards(repId)]);
  const paying = clients; // cancelled included: credit is permanent
  const qualifyingClientCount = paying.length;
  const pastTraining = isPastTraining(qualifyingClientCount, trainingClientCount);
  const base = { compTrack: repComp.comp_track, repStartedAt: repComp.rep_started_at, trainingClientCount, qualifyingClientCount, awards };

  if (isPermanentSetter(repComp.comp_track)) {
    return { ...base, bonusEligible: false, sprint: null, planMilestones: [], mrrProgress: null };
  }

  const plans = await getActivePlans();
  const now = new Date();
  const periods = computeSprintPeriods(repComp.rep_started_at, clients, now);
  const current = periods[periods.length - 1];
  const sprintAwards = awards.filter(a => a.bonus_type === 'sprint_30_day');
  const history = periods.filter(p => p.closed).reverse().map(p => ({
    ...p, award: sprintAwards.find(a => a.qualifying_window_start && Date.parse(a.qualifying_window_start) === reginaMidnightMs(p.startDate)) ?? null,
  }));

  const planMilestones: PlanMilestoneProgress[] = plans.map(p => {
    const prior = paying.filter(c => c.planSlug === p.slug).length;
    const pos = prior % MILESTONE_OVERRIDE_INTERVAL;
    return { planSlug: p.slug, displayName: p.display_name, countTowardNext: pos, remaining: MILESTONE_OVERRIDE_INTERVAL - pos, payoutAmount: p.monthly_price, payable: pastTraining };
  });

  const awardedTypes = new Set(awards.map(a => a.bonus_type));
  const ms = computeMilestoneProgress(repComp.rep_started_at, clients, awardedTypes, now);
  const nextMilestone = MRR_MILESTONES.find(m => ms.windowMRR < m.threshold) ?? null;
  const nextIdx = nextMilestone ? MRR_MILESTONES.indexOf(nextMilestone) : MRR_MILESTONES.length;
  const prevThreshold = nextIdx > 0 ? MRR_MILESTONES[nextIdx - 1].threshold : 0;

  return {
    ...base,
    bonusEligible: pastTraining,
    sprint: {
      current,
      tiers: SPRINT_TIERS.map(t => ({ ...t, achieved: current.newMRR >= t.threshold })),
      daysRemaining: Math.max(0, Math.ceil((Date.parse(current.closesAt) - now.getTime()) / 86_400_000)),
      history,
      payable: true,
    },
    planMilestones,
    mrrProgress: {
      cumulativeMRR: ms.windowMRR,
      nextMilestone,
      percentComplete: nextMilestone ? Math.min(100, Math.max(0, Math.round(((ms.windowMRR - prevThreshold) / (nextMilestone.threshold - prevThreshold)) * 100))) : 100,
      remainingToNext: nextMilestone ? nextMilestone.threshold - ms.windowMRR : 0,
      thresholds: MRR_MILESTONES.map(m => ({ ...m, awarded: awardedTypes.has(m.type) })),
    },
  };
}

// Read-time award check — no cron. Run after recording a sale and whenever
// an admin opens Rep Management. Only adds awards, never revokes.
//   Sprint: every CLOSED period that reached a tier gets one award (highest
//   tier only), due 7 days after close. An open period is never awarded.
//   Milestones: once past training (distinct clients who paid a first month), each threshold
//   the 12-month-window MRR reaches is awarded once; they stack (#3, confirmed).
export async function checkAndAwardBonuses(repId: string): Promise<BonusAward[]> {
  const repComp = await getRepCompensation(repId);
  if (isPermanentSetter(repComp.comp_track)) return [];
  const [clients, trainingClientCount, awards] = await Promise.all([getCreditedClients(repId), getTrainingClientCount(), getAwards(repId)]);
  const newAwards: BonusAward[] = [];

  const sprintStarts = new Set(awards.filter(a => a.bonus_type === 'sprint_30_day' && a.qualifying_window_start).map(a => Date.parse(a.qualifying_window_start!)));
  for (const p of computeSprintPeriods(repComp.rep_started_at, clients)) {
    if (!p.closed || !p.tier || sprintStarts.has(reginaMidnightMs(p.startDate))) continue;
    const award = await awardBonus(repId, 'sprint_30_day', p.tier.amount, repComp.comp_track, new Date(reginaMidnightMs(p.startDate)).toISOString(), p.closesAt, p.dueAt);
    if (award) newAwards.push(award);
  }

  if (isPastTraining(clients.length, trainingClientCount)) {
    const awardedTypes = new Set(awards.map(a => a.bonus_type));
    const ms = computeMilestoneProgress(repComp.rep_started_at, clients, awardedTypes);
    for (const t of ms.thresholds) {
      if (!t.reached || t.awarded) continue;
      const award = await awardBonus(repId, t.type, t.amount, repComp.comp_track, ms.windowStart, ms.windowEnd, null);
      if (award) newAwards.push(award);
    }
  }
  return newAwards;
}

// null = no rep_compensation row yet (tracking not started).
export async function getMilestoneProgress(repId: string): Promise<MilestoneProgress | null> {
  const { data: rc } = await supabase.from('rep_compensation').select('rep_started_at').eq('rep_id', repId).maybeSingle();
  if (!rc) return null;
  const [clients, awards] = await Promise.all([getCreditedClients(repId), getAwards(repId)]);
  return computeMilestoneProgress(rc.rep_started_at, clients, new Set(awards.map(a => a.bonus_type)));
}

// Distinct clients who paid a first month, per person (the "4/6 paid clients" count).
export async function getPaidClientCounts(repIds: string[]): Promise<Record<string, number>> {
  const counts = await Promise.all(repIds.map(id => getCreditedClients(id).then(c => c.length).catch(() => 0)));
  return Object.fromEntries(repIds.map((id, i) => [id, counts[i]]));
}

export const PROMOTION_PAID_CLIENTS = DEFAULT_TRAINING_CLIENT_COUNT; // "eligible, their choice" at 6
export { MRR_MILESTONES };
