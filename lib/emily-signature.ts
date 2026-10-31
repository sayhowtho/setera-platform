import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Signature check for the ElevenLabs post-call webhook (/api/emily-webhook).
//
// ElevenLabs signs each delivery with
//   elevenlabs-signature: t=<unix seconds>,v0=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
// Every client has its own ElevenLabs workspace, so every client has its own
// secret. Secrets live in Supabase Vault, named emily_webhook:<business_id>
// (Setera's own marketing-site workspace: emily_webhook:setera), and are read
// only through emily_webhook_secret() (migrations/042), which is service_role
// only. The webhook picks the secret by the payload's agent_id ->
// business_agents. That lookup happens before the signature is checked, but it
// only chooses which secret to test against: a payload naming another client's
// agent has to be signed with that client's secret.
//
// Mode (app_config 'emily_webhook_signature_mode'): 'log' (default) checks and
// logs but still processes every call; 'enforce' rejects anything not 'valid'.
// Switching is one row in app_config, no deploy.

export const SIGNATURE_TOLERANCE_SECS = 30 * 60;

export type SignatureCheck = 'valid' | 'missing' | 'malformed' | 'stale' | 'mismatch';
export type SignatureMode = 'log' | 'enforce';

export function checkEmilySignature(header: string | null, rawBody: string, secret: string, nowMs = Date.now()): SignatureCheck {
  if (!header) return 'missing';
  const parts = new Map(header.split(',').map(p => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string];
  }));
  const t = parts.get('t'), v0 = parts.get('v0');
  if (!t || !/^\d+$/.test(t) || !v0 || !/^[0-9a-f]{64}$/i.test(v0)) return 'malformed';
  if (Math.abs(nowMs / 1000 - Number(t)) > SIGNATURE_TOLERANCE_SECS) return 'stale';
  const expected = createHmac('sha256', secret).update(t + '.' + rawBody).digest();
  const given = Buffer.from(v0, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected) ? 'valid' : 'mismatch';
}

// A failed config read counts as 'enforce' (fail closed).
async function signatureMode(admin: SupabaseClient): Promise<SignatureMode> {
  const { data, error } = await admin.from('app_config').select('value').eq('key', 'emily_webhook_signature_mode').maybeSingle();
  if (error) return 'enforce';
  return data?.value === 'enforce' ? 'enforce' : 'log';
}

// businessId null = Setera's own workspace (agents not linked to a business).
async function webhookSecret(admin: SupabaseClient, businessId: string | null): Promise<string | null> {
  const { data, error } = await admin.rpc('emily_webhook_secret', { p_business_id: businessId });
  if (error) {
    console.error('[emily-webhook] could not read signing secret:', error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}

export async function verifyEmilyWebhook(admin: SupabaseClient, header: string | null, rawBody: string, businessId: string | null):
  Promise<{ ok: boolean; result: SignatureCheck | 'no_secret'; mode: SignatureMode }> {
  const [mode, secret] = await Promise.all([signatureMode(admin), webhookSecret(admin, businessId)]);
  const result = secret ? checkEmilySignature(header, rawBody, secret) : 'no_secret';
  return { ok: result === 'valid' || mode === 'log', result, mode };
}
