import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { searchBusinesses, SETTER_PORTAL_ROLES } from '@/lib/lead-requests';
import { parseBusinessPhone } from '@/lib/business-normalize';
import { resolveProvince } from '@/lib/canada-places';
import { normalizeTrade } from '@/lib/trade-options';

export const dynamic = 'force-dynamic';

const FIELDS = [
  'company_name', 'trade', 'province', 'city', 'website', 'phone', 'email',
  'contact_name', 'contact_position', 'contact_phone', 'contact_email',
  'source', 'status', 'tier', 'follow_up_date', 'notes',
] as const;

// Setter Portal "Add Prospect". A phone match is a hard block: the check and
// the insert happen in one locked transaction (create_prospect_checked,
// migrations/018), so two setters saving the same number at once can't both
// get through. Name-only matches are warnings the setter has already seen in
// the form, so they don't block here. Setters can't insert into prospects
// directly (restrictive RLS policy, same migration).
export async function POST(req: Request) {
  const auth = await requireRole(req, SETTER_PORTAL_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const input = (body && typeof body.prospect === 'object' && body.prospect) || {};
  const fields: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = input[f];
    fields[f] = typeof v === 'string' ? v.slice(0, f === 'notes' ? 5000 : 300) : '';
  }
  fields.trade = normalizeTrade(fields.trade);
  if (!fields.company_name.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  // Junk numbers are rejected, not saved (create_prospect_checked re-checks).
  for (const f of ['phone', 'contact_phone'] as const) {
    if (parseBusinessPhone(fields[f]).status === 'invalid') {
      return NextResponse.json({ error: `${f === 'phone' ? 'Phone' : 'Direct phone'} must be a 10-digit CA/US number`, field: f }, { status: 400 });
    }
  }
  const stage = typeof body.stage === 'string' ? body.stage.slice(0, 60) : '';

  // rep_id is always the verified caller, never the request body.
  // Province: valid as given, else from the city; null (blank) if unsure, never a default.
  const province = resolveProvince(fields.province, fields.city, [fields.phone, fields.contact_phone]).province;
  const { data, error } = await auth.admin.rpc('create_prospect_checked', { p_rep_id: auth.user.id, p_fields: { ...fields, province }, p_stage: stage });
  if (error) {
    if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('create_prospect_checked error:', error);
    return NextResponse.json({ error: 'Could not save prospect' }, { status: 500 });
  }
  if (data?.blocked) {
    const matches = await searchBusinesses(auth.admin, auth.user.id, { phones: [fields.phone, fields.contact_phone] }).catch(() => []);
    return NextResponse.json({ error: 'This phone number is already in Setera', matches }, { status: 409 });
  }
  return NextResponse.json({ id: data?.id });
}
