-- Step 26: an activity must have an outcome.
--
-- The Log Activity forms (High Table, /rep, /setter) now refuse to submit
-- without one; this makes the database refuse it too, so a direct insert
-- from the browser can't get round the form. NOT VALID: applies to new and
-- updated rows only. Existing activities with no outcome (8 on prod as of
-- 2026-10-01) are left as they are and still show up in High Table → Rep
-- Activity's "missing info" count. Notes stay optional.
--
-- Applied by hand in the SQL editor — staging first, then production.

begin;

alter table public.prospect_activities
  add constraint prospect_activities_outcome_required
  check (outcome is not null and btrim(outcome) <> '') not valid;

commit;

-- Check: the constraint exists and is NOT VALID (existing rows untouched).
select conname, convalidated from pg_constraint where conname = 'prospect_activities_outcome_required';
