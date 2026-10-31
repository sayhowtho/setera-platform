-- Step 38: client_touchpoints is admin/owner only.
--
-- Its only policy, "Authenticated access" (created outside migrations/), was
-- FOR ALL USING (auth.role() = 'authenticated') with no WITH CHECK, so every
-- logged-in user (clients, setters, reps) could read, insert, edit and
-- delete every business's touchpoints. These are Setera's internal notes
-- about a client relationship; the only reader and writer is High Table's
-- managed-client panel (app/admin/page.tsx — select latest 10 per business,
-- insert with rep_id = the admin), which already requires admin/owner.
-- Nothing updates or deletes rows, and no route, function or view uses the
-- table.
--
-- FIX: replace it with the same admin/owner policy calls, businesses and
-- clients use. Reps, setters and clients (including for their own business)
-- now get no rows and can't write; service_role and the SQL editor are
-- unaffected. No data changes.
--
-- Applied by hand: staging (2026-10-10), verified — admin insert/read on
-- two businesses works; rep, setter and a temporary client get 0 rows, are
-- rejected on insert and change 0 rows on update/delete; their portal reads
-- and the rep portal saves still work — then production the same day (its
-- single Northfield row unchanged).

begin;

drop policy if exists "Authenticated access" on public.client_touchpoints;
drop policy if exists client_touchpoints_all_admin on public.client_touchpoints;
create policy client_touchpoints_all_admin on public.client_touchpoints
  for all to authenticated
  using (get_my_role() = any (array['admin', 'owner']))
  with check (get_my_role() = any (array['admin', 'owner']));

commit;

-- After applying, expect exactly one row, client_touchpoints_all_admin:
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'client_touchpoints';
-- Rollback (restores the original policy exactly):
--   drop policy client_touchpoints_all_admin on public.client_touchpoints;
--   create policy "Authenticated access" on public.client_touchpoints
--     for all to public using (auth.role() = 'authenticated');
