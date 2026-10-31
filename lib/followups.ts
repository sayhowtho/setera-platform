// Setter portal "Follow-ups due": the setter's own prospects (rep_id = them)
// with a follow-up date on or before today, skipping Closed Won/Lost and Do
// Not Contact. Overdue ones stay listed (tagged) so a missed callback doesn't
// vanish at midnight. Queried server-side and paged, so no 1000-row cap.

export const FOLLOWUPS_PAGE_SIZE = 50;
export const FOLLOWUP_EXCLUDED_STATUSES = ['Closed Won', 'Closed Lost'];
// PostgREST `not.in` value for FOLLOWUP_EXCLUDED_STATUSES.
export const FOLLOWUP_EXCLUDED_IN = '(' + FOLLOWUP_EXCLUDED_STATUSES.map(s => '"' + s + '"').join(',') + ')';

// follow_up_date is a plain date, so string order is date order.
export function isOverdue(followUpDate: string, today: string): boolean {
  return followUpDate < today;
}

// A prospect's callback chip: 'overdue' / 'today' while it still counts as a
// callback due (same rules as the lists), else null.
type FollowUpFields = { follow_up_date: string | null; status: string; do_not_contact?: boolean | null };
export function followUpState(p: FollowUpFields, today: string): 'overdue' | 'today' | null {
  if (!p.follow_up_date || p.follow_up_date > today || p.do_not_contact || FOLLOWUP_EXCLUDED_STATUSES.includes(p.status)) return null;
  return isOverdue(p.follow_up_date, today) ? 'overdue' : 'today';
}

// Rep Management: callbacks due per owner, today vs overdue, from rows
// already filtered to due (prospectsQuery with `due`).
export type FollowUpTally = { today: number; overdue: number };
export function tallyFollowUpsByOwner(rows: { rep_id: string | null; follow_up_date: string | null }[], today: string): Record<string, FollowUpTally> {
  const out: Record<string, FollowUpTally> = {};
  for (const r of rows) {
    if (!r.rep_id || !r.follow_up_date || r.follow_up_date > today) continue;
    const t = out[r.rep_id] ??= { today: 0, overdue: 0 };
    if (isOverdue(r.follow_up_date, today)) t.overdue++; else t.today++;
  }
  return out;
}

// The list shows today's follow-ups first, then overdue oldest-first. That
// order can't be one server sort, so it is two queries (today, then overdue)
// read back to back: these are the parts of each needed for rows from..to of
// the combined list, given how many are due today.
export type FollowUpSlice = { segment: 'today' | 'overdue'; from: number; to: number };
export function followUpSlices(from: number, to: number, todayCount: number): FollowUpSlice[] {
  const out: FollowUpSlice[] = [];
  if (from < todayCount) out.push({ segment: 'today', from, to: Math.min(to, todayCount - 1) });
  if (to >= todayCount) out.push({ segment: 'overdue', from: Math.max(from, todayCount) - todayCount, to: to - todayCount });
  return out;
}
