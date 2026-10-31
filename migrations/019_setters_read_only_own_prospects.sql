-- Step 19: setters can read only their OWN prospects (+ those prospects'
-- activities and stage history).
--
-- ⚠ DECISION REQUIRED BEFORE APPLYING — this narrows a policy that was made
-- deliberately broad on 2026-09-15 (migrations/005: "Reps view all ..."
-- widened to include 'setter'). Kept separate from 018 so 018 can ship on
-- its own.
--
-- Why: the duplicate-prevention feature (018) promises setters see only
-- business name / city / trade / status / owner label / last activity for
-- anyone else's lead. With 005's broad SELECT, any setter can still run
-- supabase.from('prospects').select('*') in the browser console and get
-- every prospect's contact names, phones, emails and notes. That makes the
-- limited search results cosmetic. Setters no longer need that read access:
-- the Setter Portal only ever queries rep_id = self, and duplicate checks now
-- go through /api/business-search (service role).
--
-- Reps / vp_sales / admin / owner are untouched — /rep's duplicate warning
-- and "All Reps" toggle keep working. RESTRICTIVE policies AND with the
-- existing permissive ones, so nothing existing is dropped or edited.
--
-- Staging first, then production. Not verified against live policies from
-- this repo (they predate migrations/) — confirm in the dashboard after.

begin;

create policy "Setters read only own prospects" on public.prospects
  as restrictive for select to authenticated
  using (coalesce(get_my_role(), '') <> 'setter' or rep_id = auth.uid());

create policy "Setters read only own prospect activities" on public.prospect_activities
  as restrictive for select to authenticated
  using (
    coalesce(get_my_role(), '') <> 'setter'
    or exists (select 1 from public.prospects p where p.id = prospect_activities.prospect_id and p.rep_id = auth.uid())
  );

create policy "Setters read only own prospect stage history" on public.prospect_stage_history
  as restrictive for select to authenticated
  using (
    coalesce(get_my_role(), '') <> 'setter'
    or exists (select 1 from public.prospects p where p.id = prospect_stage_history.prospect_id and p.rep_id = auth.uid())
  );

commit;

-- Verify as a setter session in the browser console:
--   (await supabase.from('prospects').select('rep_id')).data.every(r => r.rep_id === <own id>)  -> true
--   Call Log, prospect detail, activity timeline all still load normally.
