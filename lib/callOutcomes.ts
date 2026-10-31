// Call outcomes for the Log Activity forms (High Table, /rep, /setter) and
// the stats that read them. Outcomes are stored as plain text in
// prospect_activities.outcome — there is no DB enum, only the not-blank check
// from migrations/026 — so this list is the single source of truth.
import { reginaToday, addDaysToDate } from './slots';

export const WRONG_NUMBER = 'Wrong Number';

export const CALL_OUTCOMES = [
  'No Answer',
  'Voicemail',
  'Spoke with Reception', // gatekeeper took our number; waiting on the decision maker
  'Referred',             // not the decision maker, but gave us the owner's name / direct number
  'Send Info',            // asked us to email or send something
  'Callback',
  'Booked',
  'Not Interested',
  WRONG_NUMBER,           // wrong or disconnected — flags prospects.bad_number (migrations/034)
];

// A logged Call that counts as a conversation in Setter Activity. There is no
// separate "conversation" field, so it is derived from the call outcome.
// Spoke with Reception and Referred don't count: the decision maker wasn't reached.
export const CONNECTED_OUTCOMES = ['Send Info', 'Not Interested', 'Callback', 'Booked'];

// Outcomes that pre-fill the follow-up date 2 days out (the setter can change it).
const FOLLOW_UP_DAYS: Record<string, number> = { 'Spoke with Reception': 2, 'Referred': 2, 'Send Info': 2, 'Callback': 2 };

export function defaultFollowUpDate(outcome: string, now: Date = new Date()): string {
  const days = FOLLOW_UP_DAYS[outcome];
  return days ? addDaysToDate(reginaToday(now), days) : '';
}

// The Log Activity form after picking a Call outcome. The follow-up date only
// follows the outcome while it is blank or still the previous outcome's
// default — a date the setter typed in is never overwritten.
export function withCallOutcome<F extends { outcome: string; follow_up_date: string }>(form: F, outcome: string, now: Date = new Date()): F {
  const wasDefault = !form.follow_up_date || form.follow_up_date === defaultFollowUpDate(form.outcome, now);
  return { ...form, outcome, follow_up_date: wasDefault ? defaultFollowUpDate(outcome, now) : form.follow_up_date };
}

// What logging an activity writes to the prospect. Every activity counts as a
// contact attempt (last_contacted_at). A follow-up date entered on the form
// becomes the prospect's; left blank, the existing one is kept — except Wrong
// Number, which marks the number bad and clears the follow-up so the prospect
// drops out of callbacks due.
export type ProspectActivityUpdate = { last_contacted_at: string; follow_up_date?: string | null; bad_number?: boolean };

export function prospectUpdateForActivity(type: string, outcome: string, followUp: string | null, nowIso: string): ProspectActivityUpdate {
  if (type === 'Call' && outcome === WRONG_NUMBER) return { last_contacted_at: nowIso, bad_number: true, follow_up_date: followUp };
  return followUp ? { last_contacted_at: nowIso, follow_up_date: followUp } : { last_contacted_at: nowIso };
}
