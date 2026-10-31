import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ADMIN_ROLES } from '@/lib/server-auth';
import { parseCsv } from '@/lib/overflow/csv';
import { ingestImport } from '@/lib/overflow/ingest';

export const dynamic = 'force-dynamic';
const MAX_ROWS = 5000;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
const COLUMNS: Record<string, string[]> = {
  rep_email: ['repemail'], email: ['prospectemail', 'email'], business: ['business', 'businessname'],
  contact: ['contactname', 'contact'], date_added: ['dateadded'], agreed: ['agreedtoemail', 'agreed'],
  location: ['location', 'cityarea'],   // optional column
};

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ADMIN_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let csv = '';
  try { csv = String((await req.json()).csv ?? ''); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const table = parseCsv(csv);
  if (table.length < 2) return NextResponse.json({ error: 'CSV needs a header row and at least one data row' }, { status: 400 });
  if (table.length - 1 > MAX_ROWS) return NextResponse.json({ error: `Maximum ${MAX_ROWS} rows per import` }, { status: 400 });

  const header = table[0].map(norm);
  const idx: Record<string, number> = {};
  for (const [key, names] of Object.entries(COLUMNS)) idx[key] = header.findIndex((h) => names.includes(h));
  const missing = Object.keys(idx).filter((k) => k !== 'location' && idx[k] < 0);
  if (missing.length) return NextResponse.json({ error: 'Missing CSV columns: ' + missing.join(', ') }, { status: 400 });

  const rows = table.slice(1).map((r, i) => ({
    row_no: i + 2,   // spreadsheet row number (header is row 1)
    rep_email: r[idx.rep_email] ?? '', email: r[idx.email] ?? '', business: r[idx.business] ?? '',
    contact: r[idx.contact] ?? '', location: idx.location >= 0 ? (r[idx.location] ?? '') : '', date_added: r[idx.date_added] ?? '', agreed: r[idx.agreed] ?? '',
  }));

  try {
    return NextResponse.json(await ingestImport(auth.admin, auth.user.id, rows));
  } catch (err) {
    console.error('overflow import error:', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
