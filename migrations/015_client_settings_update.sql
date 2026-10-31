-- Step 15: let clients actually save the client-portal Settings tab.
--
-- APPLIED to staging, then production, 2026-09-27 (by hand in the SQL
-- editor). Verified on production with a real client@example.com session on
-- Demo Roofing Co: all six fields save and nothing else changes; direct
-- UPDATEs of status/plan/minutes_limit still match 0 rows; extra params are
-- rejected; anon, a setter, and a locked business are all refused. Demo
-- Roofing's row was restored byte-for-byte afterward.
--
-- BUG: businesses has only two permissive policies — businesses_all_admin
-- (admin/owner, ALL) and businesses_select_client (client, SELECT own row).
-- No policy grants a client UPDATE, so the Settings tab's
-- `update(...).eq('id', business.id)` has always matched 0 rows. PostgREST
-- reports that as success (no error), and the page never checked the result
-- anyway — it showed "Settings saved." and patched local state, so the
-- client saw their edits until the next reload. Confirmed 2026-09-27 via
-- pg_policies and a real client session (update returned 0 rows, no error).
--
-- WHY NOT JUST ADD AN UPDATE POLICY: RLS is row-level, not column-level. An
-- "own row" UPDATE policy would let a client PATCH any column of their
-- business straight through the REST API — status (a locked client could
-- unlock themselves, see 014), lock_*, plan, tier, minutes_limit, etc.
-- Column-level GRANTs don't help either: admins write businesses from the
-- browser as the same `authenticated` role, so restricting its columns
-- would break High Table's client edit form.
--
-- FIX: a SECURITY DEFINER function that updates exactly the six Settings
-- fields, only on the caller's own business, only for role='client', and
-- never while locked. Checks are written to fail CLOSED on NULL — a bare
-- `IF get_my_role() <> 'client'` would treat NULL (no session / deleted
-- profile) as false and fall through; see 013's record_sale bypass.

begin;

create or replace function public.update_my_business_settings(
  p_business_hours  text,
  p_services        text,
  p_urgent_triggers text,
  p_sms_contact_1   text,
  p_sms_contact_2   text,
  p_avg_job_value   numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_status      text;
begin
  select p.business_id into v_business_id
  from profiles p
  where p.id = auth.uid() and p.role = 'client';

  if v_business_id is null then
    raise exception 'Not a client account' using errcode = '42501';
  end if;

  select b.status into v_status from businesses b where b.id = v_business_id;
  if v_status is distinct from 'active' then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  update businesses set
    business_hours  = p_business_hours,
    services        = p_services,
    urgent_triggers = p_urgent_triggers,
    sms_contact_1   = p_sms_contact_1,
    sms_contact_2   = p_sms_contact_2,
    avg_job_value   = p_avg_job_value
  where id = v_business_id;
end;
$$;

revoke execute on function public.update_my_business_settings(text, text, text, text, text, numeric) from public, anon;
grant execute on function public.update_my_business_settings(text, text, text, text, text, numeric) to authenticated;

commit;

-- Rollback:
--   drop function public.update_my_business_settings(text, text, text, text, text, numeric);
