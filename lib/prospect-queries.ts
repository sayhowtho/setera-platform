// Server-side Prospects queries shared by The High Table (/admin) and the
// rep portal (/rep). See migrations/035 and lib/prospect-search.ts.
import { supabase } from '@/lib/supabase';
import { prospectFilterSpec, type ProspectFilters } from '@/lib/prospect-search';
import { FOLLOWUP_EXCLUDED_IN } from '@/lib/followups';

// One row of prospect_stats(): counts per rep/status/tier.
export type ProspectStatRow = { rep_id: string | null; status: string; tier: string | null; n: number };

// PostgREST caps every response at 1000 rows: fetch page after page until a
// short one. Stops (null) past `max` rows or on an error.
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = Infinity): Promise<T[] | null> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error || !data) { if (error) console.error('Supabase error (paged fetch):', error); return null; }
    all.push(...data);
    if (all.length > max) return null;
    if (data.length < 1000) return all;
  }
}

// supabase.from('prospects') with the filter bar applied. Callers add
// .order('created_at', { ascending: false }).order('id') and .range().
export function prospectsQuery(columns: string, opts: { count: 'exact'; head?: boolean } | undefined, f: ProspectFilters) {
  const spec = prospectFilterSpec(f);
  // `as '*'`: a non-literal column list types rows as an error; this client has no DB types, so rows are untyped either way.
  let q = supabase.from('prospects').select(columns as '*', opts);
  for (const [col, v] of spec.eq) q = q.eq(col, v);
  if (spec.like) q = q.like('search_text', spec.like);
  if (spec.or) q = q.or(spec.or);
  if (spec.dueBy) {
    q = spec.dueMode === 'today' ? q.eq('follow_up_date', spec.dueBy) : spec.dueMode === 'overdue' ? q.lt('follow_up_date', spec.dueBy) : q.lte('follow_up_date', spec.dueBy);
    q = q.not('status', 'in', FOLLOWUP_EXCLUDED_IN).not('do_not_contact', 'is', true);
  }
  return q;
}

// Counts for tiles, board columns and per-rep rollups.
export async function fetchProspectStats(): Promise<ProspectStatRow[] | null> {
  const rows = await fetchAllPages<ProspectStatRow>((a, b) => supabase.rpc('prospect_stats').order('rep_id').order('status').order('tier').range(a, b));
  return rows && rows.map(r => ({ ...r, n: Number(r.n) }));
}

// Prospects per status, optionally for one rep.
export function statusCounts(stats: ProspectStatRow[], repId?: string): Record<string, number> {
  const m: Record<string, number> = {};
  stats.forEach(r => { if (repId === undefined || r.rep_id === repId) m[r.status] = (m[r.status] || 0) + r.n; });
  return m;
}
export const sumStatuses = (m: Record<string, number>, statuses?: string[]) =>
  (statuses ?? Object.keys(m)).reduce((s, st) => s + (m[st] || 0), 0);
