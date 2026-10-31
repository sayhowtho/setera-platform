// Client edit forms (High Table Signups detail and the managed-client edit):
// a save writes ONLY the fields the person actually changed (Alex,
// 2026-10-02). The forms open with display defaults ('' for null, false for
// an unset checkbox, 'Onboarding' for a missing status), so "changed" means
// different from the value the form opened with — never from the raw row.
// Untouched fields are never sent, so a null stays null and other columns of
// the row are never rewritten.
//
// A field cleared to '' is saved as null. The plan is written only when a
// current plan (Launch / Grow / Starter) is chosen (planUpdate), so a legacy
// plan (Northfield) can't be blanked or changed by a save.

import { planUpdate } from './client-tier';

export function changedFields<T extends Record<string, unknown>>(initial: T, form: T): Partial<Record<keyof T, unknown>> {
  const out: Partial<Record<keyof T, unknown>> = {};
  for (const k of Object.keys(form) as (keyof T)[]) {
    if (form[k] === initial[k]) continue;
    if (k === 'plan') {
      const p = planUpdate(form[k] as string).plan;
      if (p) out[k] = p;
      continue;
    }
    out[k] = form[k] === '' ? null : form[k];
  }
  return out;
}
