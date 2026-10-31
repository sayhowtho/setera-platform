// High Table → Prospects: the filter bar turned into server-side query
// pieces (migrations/035). The page applies them to
// supabase.from('prospects') and to prospect_filter_options().
//
// search_text is lower(company contact city trade); phone_digits is the
// digits of phone and contact_phone with a leading 1 dropped from 11-digit
// numbers, space-separated. Both are kept in sync by a DB trigger.

export const PROSPECTS_PAGE_SIZE = 50;
// /api/admin/prospects/allocate rejects more ids than this per batch.
export const ALLOCATE_MAX_IDS = 5000;
// Province select value for prospects with no province (province_key '').
export const NO_PROVINCE = '__none__';

// due: today's date when "Callbacks due" is on — follow-up on or before it,
// skipping Closed Won/Lost and Do Not Contact (lib/followups.ts). dueMode
// narrows that to exactly today or to before today (overdue).
// trade is the stored value, matched exactly (free text, so "Renovation" and
// "Renovations" are separate options); missing = All.
export type DueMode = 'today' | 'overdue';
export type ProspectFilters = { search: string; status: string; rep: string; province: string; city: string; trade?: string; due?: string; dueMode?: DueMode };

// LIKE patterns for a search box value; null when the box is blank.
// `"` and `\` would break PostgREST's quoted or= values, `%` and `*` are
// wildcards there; each becomes `_` (any one character), which still matches
// the literal character. A query made only of phone characters also gets a
// digits pattern, so "306", "(306) 555", "306-555-0199" and "+1 306 555 0199"
// all find a number stored in any format.
export function searchPatterns(search: string): { text: string | null; phone: string | null } {
  const t = search.trim().toLowerCase();
  if (!t) return { text: null, phone: null };
  const text = '%' + t.replace(/["\\%*]/g, '_') + '%';
  if (!/^\+?[\d\s().-]+$/.test(t)) return { text, phone: null };
  const d = t.replace(/\D/g, '');
  const digits = t.startsWith('+1') || (d.length === 11 && d.startsWith('1')) ? d.slice(1) : d;
  return { text, phone: digits ? '%' + digits + '%' : null };
}

// What to apply to a prospects query: `eq` filters plus either one `like`
// on search_text or an `or` across search_text and phone_digits, and the
// callbacks-due date and mode (null mode = today or earlier).
export function prospectFilterSpec(f: ProspectFilters): { eq: [string, string][]; like: string | null; or: string | null; dueBy: string | null; dueMode: DueMode | null } {
  const eq: [string, string][] = [];
  if (f.status !== 'All') eq.push(['status', f.status]);
  if (f.rep !== 'All') eq.push(['rep_id', f.rep]);
  if (f.province !== 'All') eq.push(['province_key', f.province === NO_PROVINCE ? '' : f.province]);
  if (f.city !== 'All') eq.push(['city_key', f.city]);
  if (f.trade && f.trade !== 'All') eq.push(['trade', f.trade]);
  const dueBy = f.due || null;
  const dueMode = dueBy ? f.dueMode ?? null : null;
  const { text, phone } = searchPatterns(f.search);
  if (!text) return { eq, like: null, or: null, dueBy, dueMode };
  if (!phone) return { eq, like: text, or: null, dueBy, dueMode };
  return { eq, like: null, or: `search_text.like."${text}",phone_digits.like."${phone}"`, dueBy, dueMode };
}

// Arguments for prospect_filter_options(): options are counted under
// Search + Status + Rep, and City also under the selected Province.
export function filterOptionArgs(f: ProspectFilters) {
  const { text, phone } = searchPatterns(f.search);
  return {
    p_text_like: text, p_phone_like: phone,
    p_status: f.status === 'All' ? null : f.status,
    p_rep: f.rep === 'All' ? null : f.rep,
    p_province_key: f.province === 'All' ? null : f.province === NO_PROVINCE ? '' : f.province,
  };
}

export type FilterOptionRow = { kind: 'province' | 'city'; key: string; label: string; n: number };
export type DropdownOption = { key: string; label: string; count: number };

// Dropdown entries, biggest first; zero-count options are hidden unless
// selected (a selected option stays listed even at 0). Province key '' is
// "No province" and goes last, under the NO_PROVINCE value.
export function dropdownOptions(rows: FilterOptionRow[], kind: 'province' | 'city', selected: string): DropdownOption[] {
  const sel = kind === 'province' && selected === NO_PROVINCE ? '' : selected;
  const shown = rows.filter(r => r.kind === kind && (Number(r.n) > 0 || r.key === sel));
  const named = shown.filter(r => r.key !== '').map(r => ({ key: r.key, label: r.label || r.key, count: Number(r.n) }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
  const blank = kind === 'province' ? shown.find(r => r.key === '') : undefined;
  return blank ? [...named, { key: NO_PROVINCE, label: 'No province', count: Number(blank.n) }] : named;
}

// Arguments for prospect_trade_options() (migrations/040): trades are
// counted under every other table filter.
export function tradeOptionArgs(f: ProspectFilters) {
  return { ...filterOptionArgs(f), p_city_key: f.city === 'All' ? null : f.city };
}

// A string key for the current filters: cached id lists are only valid for it.
export function filtersKey(f: ProspectFilters): string {
  return JSON.stringify([f.search.trim().toLowerCase(), f.status, f.rep, f.province, f.city, f.trade && f.trade !== 'All' ? f.trade : '', f.due || '', f.due ? f.dueMode || '' : '']);
}
