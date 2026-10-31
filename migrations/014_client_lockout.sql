-- Step 14: client lockout — lock a business when its term ends (or on
-- immediate cutoff) so the client can't use the portal and Emily stops
-- answering, WITHOUT touching any calls/appointments/pipeline data, so
-- unlocking later is a single click.
--
-- APPLIED to staging, then production, 2026-09-27 (by hand in the SQL
-- editor; there's no CLI runner in this repo). Verified end-to-end against
-- Demo Roofing Co the same day: lock → ElevenLabs number unassigned, client
-- session sees 0 calls, data counts unchanged → unlock → fully restored.
--
-- Schema: columns only, on businesses. No new tables, no existing rows
-- modified. businesses.status already exists (text default 'active', every
-- row 'active' as of 2026-09-27, and nothing in app code writes any other
-- value) — this migration just constrains it to 'active' | 'locked'.
--
-- Lock history: unlocking sets status back to 'active' and stamps
-- unlocked_at/unlocked_by, but deliberately leaves locked_at/lock_reason/
-- lock_notes/locked_by in place as the record of the most recent lockout.
-- "Currently locked" is ONLY status = 'locked' — never infer it from
-- locked_at being non-null.
--
-- paused_el_routing: which ElevenLabs phone numbers the lock unassigned
-- from which agent, as [{phone_number_id, phone_number, agent_id}]. The
-- lock only unassigns the agent from the number inside ElevenLabs (the
-- agent and its config are untouched; the SignalWire number is untouched);
-- once unassigned, the number no longer points back at the agent, so this
-- is the only record of what to restore on unlock. Cleared on unlock.
--
-- Access control: the portal UI checks status on login/load, but that's
-- UI only — app/dashboard queries calls with no business filter at all,
-- relying purely on RLS. So the real enforcement is RESTRICTIVE policies,
-- which AND with every existing permissive policy on these tables without
-- needing to know or modify them (their predicates aren't captured in this
-- repo — see 000_baseline, LIMITATIONS #3). The helper only ever returns
-- true for a role='client' profile whose business is locked; admin/owner/
-- rep/setter/anon all get false, so their access is exactly as before.
-- Service role (emily-webhook, admin API routes) bypasses RLS entirely.
--
-- businesses itself stays SELECT-able by a locked client on purpose: the
-- portal needs to read status to show the "service ended" screen instead
-- of an empty dashboard. UPDATE (the client Settings tab) is blocked.

begin;

alter table public.businesses
  add constraint businesses_status_check check (status in ('active', 'locked'));

alter table public.businesses
  add column locked_at          timestamptz,
  add column lock_reason        text check (lock_reason in ('term_ended', 'non_payment', 'immediate_cancel', 'client_requested', 'breach_non_renewal')),
  add column lock_notes         text,
  add column locked_by          uuid references public.profiles(id) on delete set null,
  add column unlocked_at        timestamptz,
  add column unlocked_by        uuid references public.profiles(id) on delete set null,
  add column paused_el_routing  jsonb;

-- Explicit: returns false (never NULL) for no session / no profile /
-- non-client / no business, so it can't be read as "locked" by accident,
-- and `not (...)` below can never evaluate to NULL.
create or replace function public.is_my_business_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select b.status = 'locked'
    from public.profiles p
    join public.businesses b on b.id = p.business_id
    where p.id = auth.uid() and p.role = 'client'
  ), false);
$$;

revoke execute on function public.is_my_business_locked() from public, anon;
grant execute on function public.is_my_business_locked() to authenticated;

-- `(select ...)` so Postgres evaluates it once per statement, not per row.
create policy "Locked clients have no access" on public.calls
  as restrictive for all to authenticated
  using (not (select public.is_my_business_locked()))
  with check (not (select public.is_my_business_locked()));

create policy "Locked clients have no access" on public.caller_classifications
  as restrictive for all to authenticated
  using (not (select public.is_my_business_locked()))
  with check (not (select public.is_my_business_locked()));

create policy "Locked clients have no access" on public.appointments
  as restrictive for all to authenticated
  using (not (select public.is_my_business_locked()))
  with check (not (select public.is_my_business_locked()));

create policy "Locked clients cannot edit business" on public.businesses
  as restrictive for update to authenticated
  using (not (select public.is_my_business_locked()))
  with check (not (select public.is_my_business_locked()));

commit;

-- Rollback (if ever needed):
--   drop policy "Locked clients have no access" on public.calls;
--   drop policy "Locked clients have no access" on public.caller_classifications;
--   drop policy "Locked clients have no access" on public.appointments;
--   drop policy "Locked clients cannot edit business" on public.businesses;
--   drop function public.is_my_business_locked();
--   alter table public.businesses drop constraint businesses_status_check,
--     drop column locked_at, drop column lock_reason, drop column lock_notes,
--     drop column locked_by, drop column unlocked_at, drop column unlocked_by,
--     drop column paused_el_routing;
