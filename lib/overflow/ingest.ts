import type { SupabaseClient } from '@supabase/supabase-js';

// Thin wrappers over the canonical Postgres ingestion functions
// (migrations/009). No normalization, validation, dedupe, consent, or
// unsubscribe logic lives here — only the call and outcome -> UI mapping.

export type IngestOutcome = 'created' | 'duplicate' | 'suppressed' | 'invalid_email';

export type RepAddResult =
  | { status: 'added' }
  | { status: 'duplicate'; originallyAddedAt: string }
  | { status: 'cannot_add' }
  | { status: 'invalid_email' };

export async function ingestFromRep(
  admin: SupabaseClient,
  actorUserId: string,
  input: { email: string; businessName?: string; contactName?: string; location?: string; consent: boolean },
): Promise<RepAddResult> {
  // p_credited_rep_id is deliberately not passed: the DB credits the actor.
  const { data, error } = await admin.rpc('overflow_ingest_one', {
    p_email: input.email, p_business_name: input.businessName ?? null, p_contact_name: input.contactName ?? null,
    p_path: 'rep_quick_add', p_actor_user_id: actorUserId, p_consent_confirmed: input.consent, p_location: input.location ?? null,
  });
  if (error) throw error;
  switch (data.outcome as IngestOutcome) {
    case 'created': return { status: 'added' };
    case 'duplicate': return { status: 'duplicate', originallyAddedAt: data.originally_added_at };
    case 'suppressed': return { status: 'cannot_add' };
    default: return { status: 'invalid_email' };
  }
}

export async function ingestFromPublic(
  admin: SupabaseClient,
  input: { email: string; businessName?: string; contactName?: string; location?: string },
): Promise<IngestOutcome> {
  const { data, error } = await admin.rpc('overflow_ingest_one', {
    p_email: input.email, p_business_name: input.businessName ?? null, p_contact_name: input.contactName ?? null,
    p_path: 'public_form', p_actor_user_id: null, p_consent_confirmed: true, p_location: input.location ?? null,
  });
  if (error) throw error;
  return data.outcome;
}

export async function ingestImport(admin: SupabaseClient, adminUserId: string, rows: unknown[]) {
  const { data, error } = await admin.rpc('overflow_ingest_import', { p_admin_id: adminUserId, p_rows: rows });
  if (error) throw error;
  return data as {
    batch_id: string;
    counts: Record<string, number>;
    rows: { row_no: number; status: string; detail: unknown }[];
  };
}
