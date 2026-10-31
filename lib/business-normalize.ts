// TypeScript twin of normalize_phone_e164() / normalize_business_name() in
// migrations/018. The DB versions are authoritative — a trigger normalizes
// every stored phone on write, whatever code path wrote it — and these exist
// for form validation and unit tests (lib/business-normalize.test.ts).
// Keep the two in lockstep: 018 asserts the same fixtures inside the
// migration and aborts if its output differs.
//
// Distinct from lib/phone.ts's normalizePhoneNumber, which is for grouping
// inbound CALLERS (keeps international numbers as raw digits). Business
// phones are CA/US only and anything that isn't 10 digits is rejected.

const EXTENSION_RE = /\s*[,;]?\s*(extension|ext\.?|x|#)\s*[0-9]{1,6}\s*$/i;

export type PhoneResult =
  | { status: 'empty'; e164: null }
  | { status: 'ok'; e164: string }
  | { status: 'invalid'; e164: null };

export function parseBusinessPhone(raw: string | null | undefined): PhoneResult {
  if (!raw || !raw.trim()) return { status: 'empty', e164: null };
  let d = raw.replace(EXTENSION_RE, '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return /^[0-9]{10}$/.test(d) ? { status: 'ok', e164: '+1' + d } : { status: 'invalid', e164: null };
}

// '+1XXXXXXXXXX', or null when blank or unparseable.
export function normalizeBusinessPhone(raw: string | null | undefined): string | null {
  return parseBusinessPhone(raw).e164;
}

const DROP_WORDS = new Set(['inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'the', 'and']);
const RENO_WORDS = new Set(['reno', 'renos', 'renovation', 'renovations', 'renovating']);

// "M.A.D. Renovations" = "MAD Renos" = "MAD Renovations" -> 'mad reno'
export function normalizeBusinessName(raw: string | null | undefined): string | null {
  const words = (raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t !== '' && !DROP_WORDS.has(t))
    .map(t => (RENO_WORDS.has(t) ? 'reno' : t));
  return words.length ? words.join(' ') : null;
}
