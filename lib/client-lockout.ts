import type { SupabaseClient } from '@supabase/supabase-js';

// Client lockout (see migrations/014_client_lockout.sql). Server-only: needs
// the service-role client and ELEVENLABS_API_KEY.
//
// "Pausing Emily" = unassigning the business's agent from its ElevenLabs
// phone number(s). The agent and its config are never touched, and neither
// is the SignalWire number — releasing that is a separate manual decision.
// calls/appointments/pipeline rows are never touched either.

export const LOCK_REASONS = ['term_ended', 'non_payment', 'immediate_cancel', 'client_requested', 'breach_non_renewal'] as const;
export type LockReason = typeof LOCK_REASONS[number];

type PausedRoute = { phone_number_id: string; phone_number: string | null; agent_id: string };
type ElPhoneNumber = { phone_number_id: string; phone_number?: string; assigned_agent?: { agent_id?: string } | null };

export type LockoutResult = { ok: true; routes: PausedRoute[] } | { ok: false; status: number; error: string };

const EL_BASE = 'https://api.elevenlabs.io/v1/convai/phone-numbers';

async function elFetch(path: string, init: RequestInit = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const res = await fetch(EL_BASE + path, { ...init, headers: { 'xi-api-key': key, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  if (!res.ok) throw new Error('ElevenLabs ' + (init.method || 'GET') + ' ' + path + ' failed: ' + res.status + ' ' + (await res.text()).slice(0, 300));
  return res.json();
}

async function assignAgent(phoneNumberId: string, agentId: string | null) {
  await elFetch('/' + phoneNumberId, { method: 'PATCH', body: JSON.stringify({ agent_id: agentId }) });
  // Read back rather than trusting the PATCH response shape.
  const after: ElPhoneNumber = await elFetch('/' + phoneNumberId);
  const actual = after.assigned_agent?.agent_id ?? null;
  if (actual !== agentId) throw new Error('ElevenLabs number ' + phoneNumberId + ' still assigned to ' + actual + ' (expected ' + agentId + ')');
}

export async function lockClientAccount(admin: SupabaseClient, businessId: string, reason: LockReason, notes: string | null, lockedBy: string): Promise<LockoutResult> {
  if (!LOCK_REASONS.includes(reason)) return { ok: false, status: 400, error: 'Invalid lock reason' };

  const { data: biz, error: bizErr } = await admin.from('businesses').select('id, status').eq('id', businessId).maybeSingle();
  if (bizErr) return { ok: false, status: 500, error: bizErr.message };
  if (!biz) return { ok: false, status: 404, error: 'Business not found' };
  if (biz.status === 'locked') return { ok: false, status: 409, error: 'Business is already locked' };

  const { data: agentRows, error: agentErr } = await admin.from('business_agents').select('agent_id').eq('business_id', businessId);
  if (agentErr) return { ok: false, status: 500, error: agentErr.message };
  const agentIds = new Set((agentRows || []).map(r => r.agent_id));

  const routes: PausedRoute[] = [];
  try {
    if (agentIds.size > 0) {
      const numbers: ElPhoneNumber[] = await elFetch('');
      for (const n of numbers) {
        const agentId = n.assigned_agent?.agent_id;
        if (agentId && agentIds.has(agentId)) routes.push({ phone_number_id: n.phone_number_id, phone_number: n.phone_number ?? null, agent_id: agentId });
      }
    }
    for (const r of routes) await assignAgent(r.phone_number_id, null);
  } catch (e) {
    // Put back anything already unassigned so we never leave a half-paused
    // business that the DB still calls active.
    const rollbackErrors = await restoreRoutes(routes);
    return { ok: false, status: 502, error: (e as Error).message + (rollbackErrors.length ? ' | ROLLBACK FAILED, fix in ElevenLabs by hand: ' + rollbackErrors.join('; ') : '') };
  }

  const { error: updErr } = await admin.from('businesses').update({
    status: 'locked',
    locked_at: new Date().toISOString(),
    lock_reason: reason,
    lock_notes: notes || null,
    locked_by: lockedBy,
    paused_el_routing: routes,
  }).eq('id', businessId);
  if (updErr) {
    const rollbackErrors = await restoreRoutes(routes);
    return { ok: false, status: 500, error: updErr.message + (rollbackErrors.length ? ' | ROLLBACK FAILED, fix in ElevenLabs by hand: ' + rollbackErrors.join('; ') : '') };
  }
  return { ok: true, routes };
}

export async function unlockClientAccount(admin: SupabaseClient, businessId: string, unlockedBy: string): Promise<LockoutResult> {
  const { data: biz, error: bizErr } = await admin.from('businesses').select('id, status, paused_el_routing').eq('id', businessId).maybeSingle();
  if (bizErr) return { ok: false, status: 500, error: bizErr.message };
  if (!biz) return { ok: false, status: 404, error: 'Business not found' };
  if (biz.status !== 'locked') return { ok: false, status: 409, error: 'Business is not locked' };

  const routes: PausedRoute[] = Array.isArray(biz.paused_el_routing) ? biz.paused_el_routing : [];
  const errors = await restoreRoutes(routes);
  // Stay locked if Emily couldn't be fully restored — status must never say
  // active while the number is still unassigned. Safe to retry.
  if (errors.length) return { ok: false, status: 502, error: 'Could not restore ElevenLabs routing, account left locked: ' + errors.join('; ') };

  // locked_at/lock_reason/lock_notes/locked_by are kept as history.
  const { error: updErr } = await admin.from('businesses').update({
    status: 'active',
    unlocked_at: new Date().toISOString(),
    unlocked_by: unlockedBy,
    paused_el_routing: null,
  }).eq('id', businessId);
  if (updErr) return { ok: false, status: 500, error: updErr.message + ' (ElevenLabs routing WAS restored — Emily is answering again)' };
  return { ok: true, routes };
}

async function restoreRoutes(routes: PausedRoute[]): Promise<string[]> {
  const errors: string[] = [];
  for (const r of routes) {
    try { await assignAgent(r.phone_number_id, r.agent_id); }
    catch (e) { errors.push((r.phone_number || r.phone_number_id) + ' → ' + r.agent_id + ': ' + (e as Error).message); }
  }
  return errors;
}
