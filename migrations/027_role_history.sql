-- Step 27: role history, so a promotion (setter -> rep) keeps everything a
-- person did before it counted "as setter".
--
--   1. role_history — one row per role a person has held: started_at /
--      ended_at (null = current), who changed it, a note. Backfilled with one
--      open row per existing profile, starting at the profile's created_at.
--   2. Trigger on profiles.role: any change (High Table's Promote button, or
--      a hand edit in the SQL editor) closes the open row and opens a new one,
--      so history can't silently go missing.
--   3. change_role(user, new_role, admin, effective_at, note) — the Promote
--      action. One transaction; the effective date can be in the past (e.g.
--      "promoted on the 1st") but not before their current role started.
--   4. role_at(user, at) — what role someone held at a moment. Setter
--      Activity / Rep Activity use it to split "as setter" / "as rep".
--
-- Role changes never touch prospects, activities, allocations, demos, sales
-- or commission rows — those were always keyed by user id. Applied by hand
-- in the SQL editor — staging first, then production.

begin;

create table if not exists public.role_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  changed_by  uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists role_history_one_open on public.role_history (user_id) where ended_at is null;
create index if not exists role_history_user_idx on public.role_history (user_id, started_at);

alter table public.role_history enable row level security;
revoke all on public.role_history from anon, authenticated;

insert into public.role_history (user_id, role, started_at, note)
select p.id, p.role, coalesce(p.created_at, now()), 'backfill (migration 027)'
from public.profiles p
where not exists (select 1 from public.role_history h where h.user_id = p.id);

-- change_role() sets these for the trigger; a bare UPDATE (SQL editor) gets
-- now() and no changed_by, but is still recorded.
create or replace function public.profiles_role_history_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := coalesce(nullif(current_setting('setera.role_effective_at', true), '')::timestamptz, now());
  v_by uuid := nullif(current_setting('setera.role_changed_by', true), '')::uuid;
  v_note text := nullif(current_setting('setera.role_note', true), '');
begin
  if new.role is distinct from old.role then
    update public.role_history set ended_at = v_at where user_id = new.id and ended_at is null;
    insert into public.role_history (user_id, role, started_at, changed_by, note)
    values (new.id, new.role, v_at, v_by, coalesce(v_note, 'role changed from ' || coalesce(old.role, '(none)')));
  end if;
  return new;
end $$;
revoke execute on function public.profiles_role_history_trg() from public, anon, authenticated;

drop trigger if exists profiles_role_history on public.profiles;
create trigger profiles_role_history after update of role on public.profiles
  for each row execute function public.profiles_role_history_trg();

-- New profiles get their first history row too.
create or replace function public.profiles_role_history_insert_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.role_history (user_id, role, started_at, note)
  values (new.id, new.role, coalesce(new.created_at, now()), 'account created')
  on conflict do nothing;
  return new;
end $$;
revoke execute on function public.profiles_role_history_insert_trg() from public, anon, authenticated;

drop trigger if exists profiles_role_history_insert on public.profiles;
create trigger profiles_role_history_insert after insert on public.profiles
  for each row execute function public.profiles_role_history_insert_trg();

create or replace function public.change_role(
  p_user_id uuid, p_new_role text, p_admin_id uuid, p_effective_at timestamptz default now(), p_note text default null
)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_old text;
  v_open_start timestamptz;
begin
  if p_new_role not in ('setter', 'rep', 'vp_sales') then
    raise exception 'Role must be setter, rep or vp_sales' using errcode = 'P0001';
  end if;
  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found' using errcode = 'P0002'; end if;
  if v_old not in ('setter', 'rep', 'vp_sales') then
    raise exception 'Only setters, reps and VPs can be moved here' using errcode = 'P0001';
  end if;
  if v_old = p_new_role then raise exception 'They are already %', p_new_role using errcode = 'P0001'; end if;
  select started_at into v_open_start from public.role_history where user_id = p_user_id and ended_at is null;
  if p_effective_at > now() + interval '1 minute' then
    raise exception 'Effective date can''t be in the future' using errcode = 'P0001';
  end if;
  if v_open_start is not null and p_effective_at < v_open_start then
    raise exception 'Effective date is before their current role started (%)', v_open_start::date using errcode = 'P0001';
  end if;

  perform set_config('setera.role_effective_at', p_effective_at::text, true);
  perform set_config('setera.role_changed_by', p_admin_id::text, true);
  perform set_config('setera.role_note', coalesce(p_note, 'promoted from ' || v_old || ' to ' || p_new_role), true);
  update public.profiles set role = p_new_role where id = p_user_id;

  return jsonb_build_object('user_id', p_user_id, 'from', v_old, 'to', p_new_role, 'effective_at', p_effective_at);
end $$;

create or replace function public.role_at(p_user_id uuid, p_at timestamptz)
returns text language sql stable set search_path = public as $$
  select role from public.role_history
  where user_id = p_user_id and started_at <= p_at and (ended_at is null or ended_at > p_at)
  order by started_at desc limit 1
$$;

revoke execute on function public.change_role(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.role_at(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.change_role(uuid, text, uuid, timestamptz, text) to service_role;
grant execute on function public.role_at(uuid, timestamptz) to service_role;
grant select, insert, update on public.role_history to service_role;

commit;

-- Check: every profile has exactly one open row.
select count(*) as profiles,
       (select count(*) from public.role_history where ended_at is null) as open_history_rows
from public.profiles;
