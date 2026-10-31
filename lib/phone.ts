// Normalizes a caller phone number to a canonical form so the same
// person calling in different formats (e.g. "(306) 555-0199" vs
// "+13065550199") is recognized as the same number.
//
// Strips everything but digits, then drops a leading North American
// country code ("1") from 11-digit numbers so a 10-digit local format
// and its "+1" equivalent normalize to the same string. Numbers that
// don't match that 10/11-digit NA shape (e.g. international numbers)
// are left as their full digit string rather than guessed at — this
// is a real known limitation for non-NA numbers, not a bug: incorrectly
// collapsing an international number is worse than leaving it unmatched.
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}
