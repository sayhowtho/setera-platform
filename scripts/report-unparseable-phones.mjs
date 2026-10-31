// Lists every stored business phone that won't normalize to a 10-digit
// CA/US number — run BEFORE applying migrations/018 so bad numbers are known
// before duplicate blocking goes live (018 flags them as phone_normalized =
// NULL rather than rejecting existing rows; section 7 of 018 prints the same
// list from inside the DB afterwards). Read-only.
//
// Uses lib/business-normalize.ts — the TS twin of the SQL normalizer.
//
// Usage:
//   node --no-warnings --experimental-loader ./scripts/ts-relative-loader.mjs --env-file=.env.local scripts/report-unparseable-phones.mjs

import { createClient } from '@supabase/supabase-js';
import { parseBusinessPhone } from '../lib/business-normalize.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (pass --env-file).');
  process.exit(1);
}
const admin = createClient(url, serviceKey);

const sources = [
  { table: 'prospects', name: 'company_name', phones: ['phone', 'contact_phone'] },
  { table: 'clients', name: 'business_name', phones: ['phone'] },
  { table: 'leads', name: 'name', phones: ['phone'] },
];

let bad = 0, total = 0;
for (const s of sources) {
  const { data, error } = await admin.from(s.table).select(['id', s.name, ...s.phones].join(', '));
  if (error) { console.error(`${s.table}: ${error.message}`); process.exitCode = 1; continue; }
  for (const row of data) {
    for (const f of s.phones) {
      const r = parseBusinessPhone(row[f]);
      if (r.status === 'empty') continue;
      total++;
      if (r.status === 'invalid') {
        bad++;
        console.log(`${s.table.padEnd(9)} ${row.id}  ${String(row[s.name] ?? '').slice(0, 40).padEnd(40)}  ${f.padEnd(13)}  ${JSON.stringify(row[f])}`);
      }
    }
  }
}
console.log(`\n${bad} unparseable of ${total} stored phone numbers.`);
