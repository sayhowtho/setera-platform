import type { SupabaseClient } from '@supabase/supabase-js';

// A prospect with no activity for this many days is "stale" and a setter can
// request it. Single source of truth — used by the search results and
// re-checked server-side when a request is created.
export const LEAD_STALE_DAYS = 30;

export type OwnerLabel = 'You' | 'Another setter' | 'A rep' | 'Client';

// Everything a setter is ever told about a business someone else may own.
// Never add names, notes, or contact details here — this shape is sent to
// setters as-is.
export type BusinessMatch = {
  key: string;
  source: 'prospect' | 'client' | 'lead';
  prospectId: string | null;        // only set when the match is requestable
  businessName: string;
  city: string | null;
  trade: string | null;
  status: string | null;
  ownerLabel: OwnerLabel;
  lastActivity: string | null;
  stale: boolean;
  matchedOn: 'phone' | 'name';     // phone = hard block, name = soft "Possible match"
  myRequest: 'pending' | null;      // viewer already has a pending request for it
};

type MatchRow = {
  source: 'prospect' | 'client' | 'lead';
  record_id: string;
  business_name: string | null;
  city: string | null;
  trade: string | null;
  status: string | null;
  owner_id: string | null;
  last_activity: string | null;
  match_reason: 'phone' | 'name';
};

export function isStaleActivity(lastActivity: string | null, now = Date.now()): boolean {
  if (!lastActivity) return true;
  return now - new Date(lastActivity).getTime() >= LEAD_STALE_DAYS * 86400000;
}

function ownerLabelFor(row: MatchRow, viewerId: string, roleById: Map<string, string>): OwnerLabel {
  if (row.source === 'client') return 'Client';
  if (row.owner_id && row.owner_id === viewerId) return 'You';
  // Owner/admin-held leads (e.g. website demo requests) read as "A rep" —
  // setters are only told whether it's another setter or the sales side.
  return roleById.get(row.owner_id || '') === 'setter' ? 'Another setter' : 'A rep';
}

export type SearchInput = {
  name?: string;
  phones?: string[];       // every number the business has; any exact match is a hard block
  city?: string;
  trade?: string;
  prefix?: boolean;        // Call Log lookup box: partial names ("atlas" -> "Atlas Roofing")
};

// Runs the DB matcher and reduces each hit to the setter-safe shape.
// `admin` must be the service client (find_business_matches is service_role-only).
export async function searchBusinesses(admin: SupabaseClient, viewerId: string, input: SearchInput, limit = 10): Promise<BusinessMatch[]> {
  const phones = (input.phones || []).filter(p => p && p.trim());
  const { data, error } = await admin.rpc('find_business_matches', {
    p_name: input.name?.trim() || null,
    p_phones: phones,
    p_city: input.city?.trim() || null,
    p_trade: input.trade?.trim() || null,
    p_prefix: !!input.prefix,
  });
  if (error) throw error;
  const rows = ((data || []) as MatchRow[]).slice(0, limit);
  if (rows.length === 0) return [];

  const ownerIds = [...new Set(rows.map(r => r.owner_id).filter((v): v is string => !!v))];
  const prospectIds = rows.filter(r => r.source === 'prospect').map(r => r.record_id);
  const [owners, pending] = await Promise.all([
    ownerIds.length ? admin.from('profiles').select('id, role').in('id', ownerIds) : Promise.resolve({ data: [], error: null }),
    prospectIds.length
      ? admin.from('lead_requests').select('prospect_id').eq('requester_id', viewerId).eq('status', 'pending').in('prospect_id', prospectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const roleById = new Map<string, string>(((owners.data || []) as { id: string; role: string }[]).map(p => [p.id, p.role]));
  const pendingIds = new Set(((pending.data || []) as { prospect_id: string }[]).map(p => p.prospect_id));

  const now = Date.now();
  return rows.map(r => {
    const ownerLabel = ownerLabelFor(r, viewerId, roleById);
    // Clients, Web Leads and Closed Won deals are never claimable.
    const claimableKind = r.source === 'prospect' && r.status !== 'Closed Won';
    const stale = claimableKind && isStaleActivity(r.last_activity, now);
    return {
      key: r.source + ':' + r.record_id,
      source: r.source,
      prospectId: stale && ownerLabel !== 'You' ? r.record_id : null,
      businessName: r.business_name || (r.source === 'lead' ? 'Web lead' : 'Unnamed business'),
      city: r.city,
      trade: r.trade,
      status: r.status,
      ownerLabel,
      lastActivity: r.last_activity,
      stale,
      matchedOn: r.match_reason,
      myRequest: pendingIds.has(r.record_id) ? 'pending' : null,
    };
  });
}

// Roles that can load /setter (see the gate in app/setter/page.tsx fetchData).
// Reps and VPs keep every setter capability (lead requests, the duplicate-checked
// Add Prospect, business search, the /setter tools), e.g. after a promotion.
export const SETTER_PORTAL_ROLES = ['setter', 'rep', 'vp_sales', 'owner', 'admin'];
