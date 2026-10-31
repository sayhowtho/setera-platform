-- Step 8: setter compensation attribution safety net + dashboard config.
--
-- Run this by hand in the Supabase SQL editor (same as prior migrations —
-- there's no CLI runner in this repo). Read through each section before
-- running; this touches `clients` and `sales`, both live production tables.
--
-- WHY: today, whoever gets setter credit for a sale is chosen by hand from
-- a dropdown in High Table's "Record Sale" form (app/admin/page.tsx), with
-- no link back to which setter actually generated the client. Nothing stops
-- a sale being recorded with no setter at all, and nothing freezes the
-- credit once it's set. This migration adds a single durable
-- `booked_by_setter_id` field, auto-derived where derivable, admin can
-- reassign it up until a sale closes, and it becomes permanent afterward.
--
-- SCOPE NOTE: the setter portal spec talks about "every prospect/deal"
-- getting this field. `prospects` and `appointments` are two separate,
-- currently-unlinked tables in this schema (see 007's note — appointments
-- is the flat setter-booking table, prospects is the call-log/pipeline
-- table), and neither has a live FK to `sales`. `clients` is what
-- `sales.client_id` actually points at, so that's where this field needs to
-- live to be real (not speculative). If prospects/appointments ever get
-- formally linked into the sale pipeline, this field should move/extend to
-- match — not duplicated.

-- 1. Config: single configurable threshold so "first 6" (training cutoff
--    and the 30-Day Sprint's required paying-client count — the setter
--    portal spec ties these to the same number) doesn't need a code change
--    if the real-world number ever changes.
create table if not exists public.app_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
insert into public.app_config (key, value) values ('setter_training_client_count', '6')
on conflict (key) do nothing;

-- RLS: unlike job_prospects (see 007, admin/owner for every operation —
-- that data is genuinely sensitive), app_config's values are non-sensitive
-- numeric settings that lib/compensation.ts's getTrainingClientCount()
-- reads from every setter's own dashboard session, under their own RLS —
-- not a service role. Locking SELECT to admin/owner the same way would
-- silently deny that read and fall back to the hardcoded default (6),
-- which only happens to match today's value — the moment the threshold is
-- changed, setter dashboards would keep showing the old default instead of
-- the real one. So only writes are admin/owner-gated; reads stay open to
-- any authenticated user, same boundary job_prospects enforces, scoped to
-- the operation that actually needs it.
alter table public.app_config enable row level security;

create policy "app_config_select_authenticated"
on public.app_config
for select
to authenticated
using (true);

create policy "app_config_write_admin"
on public.app_config
for insert
to public
with check (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]));

create policy "app_config_update_admin"
on public.app_config
for update
to public
using (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]))
with check (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]));

create policy "app_config_delete_admin"
on public.app_config
for delete
to public
using (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]));

-- 2. clients.booked_by_setter_id — the durable attribution field.
alter table clients add column if not exists booked_by_setter_id uuid references profiles(id);

-- Backfill: only narrows an existing NULL to a value already sitting on the
-- row (rep_id), for clients whose rep_id is a setter. Never invents
-- attribution that wasn't already recorded. Read `select` first if you want
-- to see exactly which rows this will touch before running the `update`.
-- select id, business_name, rep_id from clients c
--   where c.booked_by_setter_id is null
--     and exists (select 1 from profiles p where p.id = c.rep_id and p.role = 'setter');

update clients c
set booked_by_setter_id = c.rep_id
where c.booked_by_setter_id is null
  and exists (select 1 from profiles p where p.id = c.rep_id and p.role = 'setter');

-- All four trigger functions below are SECURITY DEFINER with a pinned
-- search_path. Without that, each one runs with the RLS visibility of
-- whatever role performs the write — e.g. clients_select_rep scopes
-- `clients` SELECT to rep_id = auth.uid(), so a role that can't see a given
-- client row (an unauthenticated/anon session, or in principle any future
-- write path narrower than "admin sees every client") would make the
-- lookups below silently return no row instead of erroring. That's
-- indistinguishable from "this client genuinely has no setter of record",
-- so the not-null guard never trips and booked_by_setter_id just ends up
-- null with no error — exactly the silent-undercounting failure mode this
-- whole feature exists to prevent, and confirmed live: recordSale() (the
-- real app path, anon-key client) produced a null booked_by_setter_id on a
-- setter-sourced test client before this fix; a direct service-role insert
-- did not. SECURITY DEFINER makes each function's internal lookups run as
-- its owner (whoever runs this migration, typically the SQL editor's
-- `postgres` role) instead, so they always see ground truth regardless of
-- who's writing. search_path is pinned to prevent the classic
-- SECURITY DEFINER search-path-hijack vector.

-- Auto-set on insert for new clients created directly against a setter's rep_id.
create or replace function public.set_client_booked_by_setter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booked_by_setter_id is null and new.rep_id is not null then
    if exists (select 1 from profiles p where p.id = new.rep_id and p.role = 'setter') then
      new.booked_by_setter_id := new.rep_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_client_booked_by_setter on clients;
create trigger trg_set_client_booked_by_setter
  before insert on clients
  for each row execute function public.set_client_booked_by_setter();

-- Freeze booked_by_setter_id the moment any sale references this client.
-- Admin can still reassign an unworked/unclosed client freely (e.g. Alex
-- moves a lead from one setter to another before it closes), but never one
-- that has already closed.
create or replace function public.guard_client_booked_by_setter_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booked_by_setter_id is distinct from old.booked_by_setter_id
     and exists (select 1 from sales s where s.client_id = old.id) then
    raise exception 'booked_by_setter_id is frozen once a client has a closed sale';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_client_booked_by_setter_update on clients;
create trigger trg_guard_client_booked_by_setter_update
  before update on clients
  for each row execute function public.guard_client_booked_by_setter_update();

-- 3. sales.booked_by_setter_id — permanent snapshot taken at the moment of
--    sale. Auto-filled from the client's booked_by_setter_id if the app
--    didn't pass one explicitly; an explicit value from the app (admin
--    override before the sale is saved) always wins.
alter table sales add column if not exists booked_by_setter_id uuid references profiles(id);

create or replace function public.set_sale_booked_by_setter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_setter uuid;
begin
  select booked_by_setter_id into client_setter from clients where id = new.client_id;

  if new.booked_by_setter_id is null then
    new.booked_by_setter_id := client_setter;
  end if;

  -- Only setter-sourced deals are required to carry attribution forward —
  -- a direct/referral client with no setter of record is exempt. This is
  -- the hard constraint from the spec: "a closed/paid deal can never exist
  -- with a null booked_by_setter_id" scoped to deals that came from a
  -- setter in the first place.
  if client_setter is not null and new.booked_by_setter_id is null then
    raise exception 'sale for a setter-sourced client cannot be recorded without booked_by_setter_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_sale_booked_by_setter on sales;
create trigger trg_set_sale_booked_by_setter
  before insert on sales
  for each row execute function public.set_sale_booked_by_setter();

-- Closed-deal attribution is permanent — never reassignable after the fact,
-- not even by an admin.
create or replace function public.guard_sale_booked_by_setter_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booked_by_setter_id is distinct from old.booked_by_setter_id then
    raise exception 'sales.booked_by_setter_id cannot be changed once recorded';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_sale_booked_by_setter_update on sales;
create trigger trg_guard_sale_booked_by_setter_update
  before update on sales
  for each row execute function public.guard_sale_booked_by_setter_update();

create index if not exists sales_booked_by_setter_id_idx on sales (booked_by_setter_id);
create index if not exists clients_booked_by_setter_id_idx on clients (booked_by_setter_id);

-- 4. Admin-only audit view: paid deals from a setter-sourced client where
--    the sale's attribution is missing or has drifted from the client's own
--    record. Should always return zero rows in normal operation — any row
--    here means a broken tag is silently under-counting someone's progress.
--    Note: with the triggers above in place going forward this view should
--    stay empty for new sales; it exists to catch anything recorded before
--    this migration, or any future direct-SQL edit that bypasses the app.
--
-- ADMIN-ONLY, EXPLICITLY: clients_select_rep scopes SELECT on `clients` to
-- rep_id = auth.uid(), so security_invoker alone would let a setter query
-- this view and see audit rows for their own clients — not what "only I
-- see this in High Table" means. Supabase RLS here runs everyone under one
-- shared `authenticated` Postgres role and gates by auth.uid()/get_my_role()
-- inside policies, not by distinct Postgres roles/grants, so the fix is the
-- same pattern already used for admin-only access elsewhere in this schema
-- (get_my_role(), see migrations 006/007): filter the view itself on it.
-- security_invoker stays on too, as defense-in-depth — if clients/sales RLS
-- is ever narrowed, this view narrows with it rather than silently keeping
-- broader access via view-owner privileges.
create or replace view public.setter_attribution_audit as
select
  s.id as sale_id,
  s.client_id,
  c.business_name,
  c.rep_id as client_rep_id,
  c.booked_by_setter_id as client_booked_by_setter_id,
  s.booked_by_setter_id as sale_booked_by_setter_id,
  s.setter_id,
  s.plan_slug,
  s.plan_price,
  s.sold_at
from sales s
join clients c on c.id = s.client_id
where c.booked_by_setter_id is not null
  and (s.booked_by_setter_id is null or s.booked_by_setter_id is distinct from c.booked_by_setter_id)
  and get_my_role() = any (array['admin', 'owner']);

alter view public.setter_attribution_audit set (security_invoker = on);

-- Verify in the Supabase dashboard that `clients` and `sales` have an
-- admin/owner SELECT policy at least as broad as this view needs (Alex
-- must be able to see every setter's rows, not just clients where
-- rep_id = his own auth.uid()) — the get_my_role() filter above only
-- narrows who can see rows, it can't widen what security_invoker already
-- lets the querying admin see. If High Table's main Clients/Sales tabs
-- already show every client/sale to admins today, that broader policy
-- already exists and this just rides on it.
