-- Step 37: stop users promoting themselves (or creating their own profile)
-- through the API.
--
-- profiles_update_own (auth.uid() = id, created outside migrations/) has no
-- column restriction, and authenticated has UPDATE on every profiles column,
-- so any logged-in client, setter or rep could PATCH their own role to
-- 'admin' with the public anon key and then read every business's calls.
-- prevent_profiles_business_id_self_change (see 008) only guards
-- business_id. profiles_insert_own (auth.uid() = id) likewise let a user
-- with no profile insert one with any role — reachable by strangers wherever
-- public signup is on (it was on staging; disabled on production).
--
-- FIX: a BEFORE INSERT OR UPDATE trigger. Requests made as anon/authenticated
-- by a non-admin may not insert a profile, or change role, business_id, id,
-- email, is_demo, probation_start or created_at. full_name,
-- availability_schedule and setter_access stay self-editable (the rep portal
-- saves the last two). Admin/owner sessions, service_role (invite-user,
-- change-role), SECURITY DEFINER functions (change_role) and the SQL editor
-- all pass through. get_my_role() reads the caller's existing row, so the
-- update being checked can't make the caller an admin.
--
-- No policies or grants change. Applied by hand: staging (2026-10-10),
-- verified with a setter test account — role/business_id/email/is_demo
-- changes rejected with 42501, full_name/availability_schedule/setter_access
-- edits still saved, a fresh auth user's self-insert as owner rejected, admin
-- and service-role edits allowed — then production the same day.

begin;

create or replace function public.guard_profiles_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only end-user requests through the Supabase API are restricted.
  -- service_role (invite-user, change-role and other server routes),
  -- SECURITY DEFINER functions (change_role) and direct DB sessions
  -- (SQL editor) pass through.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Admins/owners keep full control. get_my_role() reads the caller's
  -- existing role, so a non-admin can't qualify by setting it here.
  if coalesce(public.get_my_role() in ('admin', 'owner'), false) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'profiles can only be created by an administrator'
      using errcode = '42501';
  end if;

  if new.role            is distinct from old.role
  or new.business_id     is distinct from old.business_id
  or new.id              is distinct from old.id
  or new.email           is distinct from old.email
  or new.is_demo         is distinct from old.is_demo
  or new.probation_start is distinct from old.probation_start
  or new.created_at      is distinct from old.created_at then
    raise exception 'only an administrator can change role, business, email or account fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profiles_privileged_columns on public.profiles;
create trigger guard_profiles_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_privileged_columns();

commit;

-- After applying, expect one enabled row:
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.profiles'::regclass and tgname = 'guard_profiles_privileged_columns';
-- Rollback:
--   drop trigger guard_profiles_privileged_columns on public.profiles;
--   drop function public.guard_profiles_privileged_columns();
