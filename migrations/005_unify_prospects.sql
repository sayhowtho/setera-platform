-- Step 5: unify prospect entry across High Table, rep portal, and setter
-- portal onto the single `prospects` table.
--
-- Run this by hand in the Supabase SQL editor (same as prior migrations —
-- there's no CLI runner in this repo). Read through each section before
-- running; the setter_prospects migration touches real production rows.
--
-- STATUS: run in production 2026-09-15. setter_prospects was empty at run
-- time (no setters hired yet), so the migration moved 0 rows — expected.
-- Section 3 below (RLS) was NOT run as written: pg_policies showed
-- INSERT/UPDATE on all three tables already ownership-based
-- (auth.uid() = rep_id), so no new INSERT/UPDATE policy was needed. Only
-- the three "Reps view all ..." SELECT policies (prospects,
-- prospect_activities, prospect_stage_history) were role-gated and missing
-- 'setter'; those were widened in place with `alter policy ... using
-- (get_my_role() = ANY (ARRAY[..., 'setter'::text]))` instead. Once a
-- setter account exists, run the end-to-end verification checklist from
-- the Add Prospect unification work before trusting this live.

-- 1. Drop fields removed from the Add Prospect form. No fixed terms
--    anymore (clients pay until they cancel), and the Estimated Potential
--    Value card that consumed `term` is gone too. `tier` stays — it's now
--    a plain internal label (Launch/Grow/Starter), no math tied to it.
alter table prospects
  drop column if exists employees,
  drop column if exists trucks,
  drop column if exists address,
  drop column if exists term;

-- 2. Migrate every setter_prospects row into prospects, so setter-logged
--    prospects are finally visible in High Table / rep pipeline. Each
--    row's call_outcome becomes its first prospect_activities entry
--    instead of being dropped — nothing about a setter's call history is
--    lost, it just moves from a single field to an append-only log.
insert into prospects (
  rep_id, company_name, trade, city, phone,
  contact_name, notes, source, status, created_at, updated_at
)
select
  setter_id,
  business_name,
  trade,
  city,
  phone,
  decision_maker,
  notes,
  'Setter — Call Log',
  'Attempted',
  created_at,
  created_at
from setter_prospects;

-- Seed the first activity-log entry for each migrated prospect from its
-- original call_outcome. Matches on rep_id/company_name/created_at, which
-- is safe here because the insert above just ran and is 1:1 with
-- setter_prospects rows created at that exact timestamp.
insert into prospect_activities (prospect_id, rep_id, type, outcome, notes, created_at)
select
  p.id,
  sp.setter_id,
  'Call',
  sp.call_outcome,
  sp.notes,
  sp.created_at
from setter_prospects sp
join prospects p
  on p.rep_id = sp.setter_id
  and p.company_name = sp.business_name
  and p.created_at = sp.created_at
  and p.source = 'Setter — Call Log';

-- setter_prospects is intentionally left in place (not dropped) as a
-- rollback safety net until the new flow is verified live. Drop it in a
-- later migration once confirmed nothing reads from it anymore.

-- 3. RLS: prospects and prospect_activities need to allow role = 'setter'
--    to select/insert/update, matching whatever predicate reps already
--    satisfy today (the rep portal fetches prospects with no rep_id
--    filter, i.e. reps already see all prospects — setters should get the
--    same breadth, not a narrower one). The existing policies on these
--    tables aren't in this repo (they predate the migrations/ folder), so
--    inspect them in the Supabase dashboard first and adapt the policy
--    below to match the existing shape rather than assuming this is a
--    clean create.
--
-- Example (verify table/policy names against what's actually there before running):
--
-- create policy "setters can read prospects" on prospects
--   for select using (
--     exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'setter')
--   );
-- create policy "setters can insert prospects" on prospects
--   for insert with check (
--     exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'setter')
--   );
-- create policy "setters can update prospects" on prospects
--   for update using (
--     exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'setter')
--   );
-- (repeat the same three for prospect_activities and prospect_stage_history)
