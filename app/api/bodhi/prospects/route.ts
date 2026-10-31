import { NextResponse } from 'next/server';
import { bodhiGuard, BODHI_SOURCE, BODHI_STATUSES, BODHI_TIERS, stageForStatus } from '@/lib/bodhi-api';
import { resolveProvince } from '@/lib/canada-places';
import { normalizeTrade } from '@/lib/trade-options';

export const dynamic = 'force-dynamic';

// Bodhi's prospect API (auth, scope and limits: lib/bodhi-api.ts).
//   GET   /api/bodhi/prospects?source=&tier=&status=&q=&limit=&offset=
//   POST  /api/bodhi/prospects   body: one prospect object, or an array of up to 100
// No DELETE, no other tables.

const MAX_ROWS = 100;
const FIELDS = [
  'company_name', 'trade', 'province', 'city', 'website', 'phone', 'email',
  'contact_name', 'contact_position', 'contact_phone', 'contact_email',
  'status', 'tier', 'follow_up_date', 'notes',
] as const;

export async function GET(req: Request) {
  const g = await bodhiGuard(req, 'read');
  if ('res' in g) return g.res;

  const sp = new URL(req.url).searchParams;
  const opt = (k: string) => { const v = (sp.get(k) || '').trim(); return v ? v.slice(0, 200) : null; };
  const int = (k: string, def: number, min: number, max: number) => {
    const n = Number.parseInt(sp.get(k) || '', 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
  };
  const limit = int('limit', 50, 1, 100);
  const offset = int('offset', 0, 0, 10000);

  const { data, error } = await g.admin.rpc('bodhi_list_prospects', {
    p_owner: g.ownerId, p_source: opt('source'), p_tier: opt('tier'), p_status: opt('status'), p_q: opt('q'),
    p_limit: limit, p_offset: offset,
  });
  if (error) {
    console.error('bodhi_list_prospects error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  return NextResponse.json({ items: data || [], limit, offset });
}

// Same duplicate handling, lock, per-row report and stage-history rows as the
// setter path (create_prospects_batch, migrations/020). Never fails as a
// whole. rep_id/source/anything not in FIELDS is ignored: rows are always
// owned by the owner account with source 'bodhi'.
export async function POST(req: Request) {
  const g = await bodhiGuard(req, 'write');
  if ('res' in g) return g.res;

  const body = await req.json().catch(() => null);
  const input: unknown[] = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  if (input.length === 0) return NextResponse.json({ error: 'Send a prospect object or a non-empty array' }, { status: 400 });
  if (input.length > MAX_ROWS) return NextResponse.json({ error: `At most ${MAX_ROWS} prospects per request` }, { status: 413 });

  const skipped: Record<string, unknown>[] = [];
  const rows: Record<string, string | number>[] = [];
  const provinceByRow = new Map<number, ReturnType<typeof resolveProvince>>();
  input.forEach((raw, i) => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const row: Record<string, string | number> = { _row: i };
    for (const f of FIELDS) {
      const v = r[f];
      row[f] = typeof v === 'string' ? v.slice(0, f === 'notes' ? 5000 : 300) : typeof v === 'number' ? String(v) : '';
    }
    const status = String(row.status).trim() || 'Not Contacted';
    const tier = String(row.tier).trim();
    if (!BODHI_STATUSES.includes(status)) { skipped.push({ row: i, status: 'skipped', reason: 'invalid_status', company_name: row.company_name }); return; }
    if (tier && !BODHI_TIERS.includes(tier)) { skipped.push({ row: i, status: 'skipped', reason: 'invalid_tier', company_name: row.company_name }); return; }
    row.status = status;
    row.trade = normalizeTrade(String(row.trade));
    row.stage = stageForStatus(status);
    // A valid province as sent wins; else from the city (and phone area code);
    // else blank. Never defaults to SK (migrations/024).
    const prov = resolveProvince(String(row.province), String(row.city), [String(row.phone), String(row.contact_phone)]);
    row.province = prov.province ?? '';
    provinceByRow.set(i, prov);
    rows.push(row);
  });

  let results: Record<string, unknown>[] = [];
  if (rows.length) {
    const { data, error } = await g.admin.rpc('create_prospects_batch', { p_rep_id: g.ownerId, p_rows: rows, p_source: BODHI_SOURCE });
    if (error) {
      console.error('create_prospects_batch error:', error);
      return NextResponse.json({ error: 'Import failed; nothing was saved' }, { status: 500 });
    }
    results = (data || []) as Record<string, unknown>[];
  }
  // Tell Bodhi which province each added row got and why (given / inferred / none = left blank).
  results = results.map(r => {
    const prov = r.status === 'added' ? provinceByRow.get(r.row as number) : undefined;
    return prov ? { ...r, province: prov.province, province_source: prov.source } : r;
  });
  results = [...results, ...skipped].sort((a, b) => (a.row as number) - (b.row as number));
  return NextResponse.json({
    added: results.filter(r => r.status === 'added').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  });
}
