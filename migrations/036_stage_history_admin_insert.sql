-- Step 36: let admins/owners record stage history for any prospect.
--
-- The only INSERT policy on prospect_stage_history ("Reps insert own
-- history", created outside migrations/) requires auth.uid() = rep_id. The
-- High Table Board writes rep_id = the prospect's owner, so an admin moving
-- someone else's prospect saved the new status but the history insert was
-- rejected, and the page ignored the error. Those moves never reached the
-- history, so Won This Month (which reads Won-stage history) missed them.
--
-- Additive: one permissive policy, OR-ed with the existing one, which is left
-- exactly as it is. Reps and setters are unaffected.
--
-- Applied by hand in the SQL editor: staging first, then production. Safe
-- before or after the matching app code (lib/stage-change.ts).

begin;

drop policy if exists "Admins insert any history" on public.prospect_stage_history;
create policy "Admins insert any history" on public.prospect_stage_history
  for insert to authenticated
  with check (get_my_role() = any (array['admin', 'owner']));

commit;

-- After applying, expect one row:
--   select polname from pg_policy
--   where polrelid = 'public.prospect_stage_history'::regclass and polname = 'Admins insert any history';
-- Rollback:
--   drop policy "Admins insert any history" on public.prospect_stage_history;
