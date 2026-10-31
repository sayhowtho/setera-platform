import type { SupabaseClient } from '@supabase/supabase-js';

// Deduplicates webhook deliveries via the webhook_events ledger
// (migrations/041_webhook_event_idempotency.sql). Server-only.
//
// claim -> 'claimed'     first delivery (or a stale, unfinished one): process it
//          'duplicate'   already processed, or being processed right now: skip
//          'no_id'       payload has no usable event id: process, can't dedupe
//          'unavailable' ledger unreachable (e.g. migration not applied yet):
//                        process anyway, like before this existed — a missed
//                        duplicate is better than a lost call
// After a claim, call complete() on every path that answers 2xx, and release()
// on every path that answers 5xx so the sender's retry is processed.

export type ClaimResult = 'claimed' | 'duplicate' | 'no_id' | 'unavailable';

export function normalizeEventId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const t = id.trim();
  return t.length >= 1 && t.length <= 200 ? t : null;
}

export async function claimWebhookEvent(admin: SupabaseClient, source: string, eventId: unknown): Promise<ClaimResult> {
  const id = normalizeEventId(eventId);
  if (!id) return 'no_id';
  const { data, error } = await admin.rpc('claim_webhook_event', { p_source: source, p_event_id: id });
  if (error) {
    console.error(`[webhook-idempotency] claim failed for ${source}, processing without dedupe:`, error.message);
    return 'unavailable';
  }
  return data === true ? 'claimed' : 'duplicate';
}

export async function completeWebhookEvent(admin: SupabaseClient, source: string, eventId: unknown, outcome: string): Promise<void> {
  const id = normalizeEventId(eventId);
  if (!id) return;
  const { error } = await admin.rpc('complete_webhook_event', { p_source: source, p_event_id: id, p_outcome: outcome });
  if (error) console.error(`[webhook-idempotency] complete failed for ${source}:`, error.message);
}

export async function releaseWebhookEvent(admin: SupabaseClient, source: string, eventId: unknown): Promise<void> {
  const id = normalizeEventId(eventId);
  if (!id) return;
  const { error } = await admin.rpc('release_webhook_event', { p_source: source, p_event_id: id });
  if (error) console.error(`[webhook-idempotency] release failed for ${source}:`, error.message);
}
