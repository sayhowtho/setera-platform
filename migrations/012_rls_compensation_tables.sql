-- Step 12: enable RLS on the 7 tables Supabase's Security Advisor flagged as
-- having it fully disabled: plans, plan_links, rep_compensation,
-- rep_compensation_history, commission_earnings, sales, bonus_awards.
--
-- DO NOT RUN THIS AGAINST PRODUCTION YET. Test against staging first (same
-- policy as every prior migration in this repo). There's no CLI runner in
-- this repo; this file is applied by hand when ready.
--
-- SEVERITY / WHAT WAS ACTUALLY EXPOSED (confirmed read-only against
-- production, 2026-09-22, via direct pg_catalog/information_schema queries
-- — not guessed): with RLS disabled, Postgres's plain GRANT-based table
-- privileges were the ONLY gate. `authenticated` — every logged-in user of
-- EVERY role (client, rep, setter, admin, owner) — had SELECT, UPDATE, and
-- DELETE on all 7 tables, and INSERT on 5 of them (INSERT on sales/
-- commission_earnings was already revoked by migrations/011, same night).
-- `anon` had no grants on any of the 7, so this was never reachable by an
-- unauthenticated request — but any logged-in session, of any role, could
-- read every rep's exact commission amounts/comp track/bonus history and
-- the full company sales ledger, and could UPDATE or DELETE any row in any
-- of these tables, completely unfiltered.
--
-- ROLE MODEL, VERIFIED (not assumed) before writing this: get_my_role()
-- (pg_get_functiondef) is `select role from profiles where id = auth.uid()`
-- — a plain lookup of the CALLER's own profiles.role. profiles.role values
-- in actual use on production: 'owner' (count 1), 'admin', 'rep', 'setter',
-- 'client' (count 2). 'owner'/'admin' and 'client' are mutually exclusive
-- string values in the same column — no client-business account is ever
-- stored as 'owner' or 'admin' anywhere in this schema (confirmed against
-- every admin-gated route in app/api/admin/*, none of which ever operate on
-- role='client'). So get_my_role() = any(array['admin','owner']) below
-- means Setera-internal staff only, never a client's own account, by the
-- data model itself, not by convention.
--
-- None of these 7 tables have a business_id column — they're rep/
-- compensation/pricing tables, not tenant tables — so the pattern applied
-- here is the other one already established in this schema (profiles_select_
-- admin, overflow_waitlist_rep_select): get_my_role() for staff-wide access,
-- auth.uid() self-match for a rep's own rows. Every SELECT/INSERT/UPDATE/
-- DELETE grant below was sized to an actual call site found by grepping the
-- whole app — not guessed. See each table's comment for the call sites that
-- justify its specific policy shape.

begin;

-- ── plans ── read app-wide (pricing catalog, non-sensitive), no current
-- writer in the app at all (migration 001's seed insert is the only writer
-- on record) — write policies added for when/if an admin UI for this
-- exists, gated the same as everything else admin-only.
alter table public.plans enable row level security;

create policy "plans_select_authenticated" on public.plans
  for select to authenticated using (true);
create policy "plans_insert_admin" on public.plans
  for insert to authenticated with check (get_my_role() = any (array['admin','owner']));
create policy "plans_update_admin" on public.plans
  for update to authenticated using (get_my_role() = any (array['admin','owner']))
  with check (get_my_role() = any (array['admin','owner']));
create policy "plans_delete_admin" on public.plans
  for delete to authenticated using (get_my_role() = any (array['admin','owner']));

-- ── plan_links ── same shape as plans (app/admin/page.tsx and app/rep/page.tsx
-- both read active plan_links to show payment links; no current writer).
alter table public.plan_links enable row level security;

create policy "plan_links_select_authenticated" on public.plan_links
  for select to authenticated using (true);
create policy "plan_links_insert_admin" on public.plan_links
  for insert to authenticated with check (get_my_role() = any (array['admin','owner']));
create policy "plan_links_update_admin" on public.plan_links
  for update to authenticated using (get_my_role() = any (array['admin','owner']))
  with check (get_my_role() = any (array['admin','owner']));
create policy "plan_links_delete_admin" on public.plan_links
  for delete to authenticated using (get_my_role() = any (array['admin','owner']));

-- ── rep_compensation ── a rep reads their OWN row (lib/compensation.ts's
-- getRepCompensation(), called under the rep/setter's own session from
-- app/setter/page.tsx's getCompensationProgress() call). All writes
-- (app/admin/page.tsx's startTracking/transitionTrack/reset, and
-- app/api/admin/invite-user's auto-created row, which runs via service_role
-- and bypasses RLS regardless) are admin/owner-only in practice today.
alter table public.rep_compensation enable row level security;

create policy "rep_compensation_select_self_or_admin" on public.rep_compensation
  for select to authenticated
  using (rep_id = auth.uid() or get_my_role() = any (array['admin','owner']));
create policy "rep_compensation_insert_admin" on public.rep_compensation
  for insert to authenticated with check (get_my_role() = any (array['admin','owner']));
create policy "rep_compensation_update_admin" on public.rep_compensation
  for update to authenticated using (get_my_role() = any (array['admin','owner']))
  with check (get_my_role() = any (array['admin','owner']));
create policy "rep_compensation_delete_admin" on public.rep_compensation
  for delete to authenticated using (get_my_role() = any (array['admin','owner']));

-- ── rep_compensation_history ── admin-only in every direction. This is an
-- internal audit trail (comp-track change log, contract file storage paths,
-- admin notes) — no call site anywhere reads or writes this under a rep's
-- own session, unlike rep_compensation itself. DELETE isn't granted at all:
-- no call site in the app deletes from this table (the test script's
-- cleanup uses the service-role key, which bypasses RLS/grants regardless).
alter table public.rep_compensation_history enable row level security;

create policy "rep_compensation_history_select_admin" on public.rep_compensation_history
  for select to authenticated using (get_my_role() = any (array['admin','owner']));
create policy "rep_compensation_history_insert_admin" on public.rep_compensation_history
  for insert to authenticated with check (get_my_role() = any (array['admin','owner']));
create policy "rep_compensation_history_update_admin" on public.rep_compensation_history
  for update to authenticated using (get_my_role() = any (array['admin','owner']))
  with check (get_my_role() = any (array['admin','owner']));
revoke delete on public.rep_compensation_history from authenticated, anon;

-- ── commission_earnings ── a rep reads their OWN earnings (rep_id column
-- exists directly on this table — app/setter/page.tsx's own-earnings query,
-- and lib/compensation.ts's getCreditedSales/getCompensationProgress under
-- the rep's own session). INSERT is already record_sale()-RPC-only
-- (migrations/011); UPDATE/DELETE have no call site anywhere in the app —
-- revoked outright rather than left as "no policy, so denied" (defense in
-- depth: a grant alone should never be relied on to be harmless just
-- because no policy currently exists for it).
alter table public.commission_earnings enable row level security;

create policy "commission_earnings_select_self_or_admin" on public.commission_earnings
  for select to authenticated
  using (rep_id = auth.uid() or get_my_role() = any (array['admin','owner']));
revoke update, delete on public.commission_earnings from authenticated, anon;

-- ── sales ── sales has no rep_id column of its own (setter_id/closer_id are
-- separate, optional attribution fields, not the same as who's actually
-- compensated) — the real "is this rep's sale" question is answered by
-- commission_earnings.rep_id, which is what app/setter/page.tsx's earnings
-- query actually joins through (`commission_earnings...sales(sold_at,
-- plan_slug,...)`. PostgREST enforces RLS on the embedded table
-- independently, so sales needs its own policy recognizing that same
-- linkage, not a plain setter_id/closer_id match. INSERT is already
-- record_sale()-RPC-only (migrations/011); UPDATE/DELETE have no call site
-- (the test script's DELETE uses the service-role key) — revoked outright,
-- same reasoning as commission_earnings above.
alter table public.sales enable row level security;

create policy "sales_select_self_or_admin" on public.sales
  for select to authenticated
  using (
    get_my_role() = any (array['admin','owner'])
    or exists (
      select 1 from public.commission_earnings ce
      where ce.sale_id = sales.id and ce.rep_id = auth.uid()
    )
  );
revoke update, delete on public.sales from authenticated, anon;

-- ── bonus_awards ── a rep reads their OWN bonus history (rep_id column
-- exists directly — lib/compensation.ts's getAwardedBonuses/
-- getCompensationProgress under the rep's own session). INSERT (awardBonus()
-- in lib/compensation.ts) only ever runs today from checkAndAwardBonuses(),
-- which in production app code is only ever called from app/admin/page.tsx
-- (an admin session, after recording a sale) — admin/owner-gated to match
-- that actual usage. UPDATE/DELETE have no call site anywhere — revoked.
alter table public.bonus_awards enable row level security;

create policy "bonus_awards_select_self_or_admin" on public.bonus_awards
  for select to authenticated
  using (rep_id = auth.uid() or get_my_role() = any (array['admin','owner']));
create policy "bonus_awards_insert_admin" on public.bonus_awards
  for insert to authenticated with check (get_my_role() = any (array['admin','owner']));
revoke update, delete on public.bonus_awards from authenticated, anon;

commit;

-- VERIFY AFTER RUNNING (staging first, per the header above):
--   1. select relname, relrowsecurity from pg_class
--        where relnamespace = 'public'::regnamespace
--        and relname in ('plans','plan_links','rep_compensation',
--          'rep_compensation_history','commission_earnings','sales','bonus_awards');
--      -- all 7 should show relrowsecurity = t.
--   2. select table_name, grantee, privilege_type from information_schema.role_table_grants
--        where table_schema='public' and grantee in ('authenticated','anon')
--        and table_name in ('commission_earnings','sales','rep_compensation_history','bonus_awards')
--        and privilege_type in ('UPDATE','DELETE');
--      -- should return zero rows for commission_earnings/sales/bonus_awards entirely,
--      -- and zero DELETE rows for rep_compensation_history.
--   3. As a real non-admin test session (setter/rep), confirm:
--      - select * from rep_compensation where rep_id = auth.uid() -> their own row only.
--      - select * from rep_compensation -> only their own row comes back, not everyone's.
--      - select * from commission_earnings / bonus_awards -> same, self-only.
--      - select * from sales -> only sales they're credited on via commission_earnings.
--      - select * from rep_compensation_history -> zero rows (admin-only).
--      - any update/delete attempt on sales/commission_earnings/bonus_awards -> denied.
--   4. As an admin/owner test session, confirm all of the above return
--      EVERYONE's rows, not just their own (the get_my_role() branch).
