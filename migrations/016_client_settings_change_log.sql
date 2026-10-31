-- Step 16: log every client Settings change so High Table can notify Alex
-- (bell + panel in the sidebar), with the business, fields changed, and
-- old -> new values.
--
-- Applied by hand in the SQL editor — staging first, then production.
--
-- The log row is written INSIDE update_my_business_settings() (from 015),
-- in the same transaction as the save — so a notification can't be skipped
-- by the browser, faked by a client, or exist for a save that didn't
-- happen. Clients get no policy on this table at all (can't read, insert,
-- or edit it); only the SECURITY DEFINER function inserts. Admin/owner can
-- read it and set read_at (mark read), nothing else.
--
-- Only real changes are logged: fields are compared with NULL and '' treated
-- as equal (the portal form sends '' for an empty field that's NULL in the
-- DB), and a save that changes nothing writes nothing — no log row, no
-- UPDATE.
--
-- business_name is a snapshot at change time so the notification still
-- reads correctly if the business is later renamed.

begin;

create table public.client_settings_changes (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  business_name  text not null,
  changed_by     uuid references public.profiles(id) on delete set null,
  changes        jsonb not null,  -- [{field, old, new}], old/new as text or null
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index client_settings_changes_unread_idx
  on public.client_settings_changes (created_at desc) where read_at is null;

alter table public.client_settings_changes enable row level security;

create policy "Admins read settings changes" on public.client_settings_changes
  for select to authenticated
  using (get_my_role() = any (array['admin', 'owner']));

create policy "Admins mark settings changes read" on public.client_settings_changes
  for update to authenticated
  using (get_my_role() = any (array['admin', 'owner']))
  with check (get_my_role() = any (array['admin', 'owner']));

-- Admins may only flip read_at through the API, not rewrite the record.
revoke update on public.client_settings_changes from authenticated;
grant update (read_at) on public.client_settings_changes to authenticated;
revoke insert, delete on public.client_settings_changes from anon, authenticated;

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
  b             businesses%rowtype;
  v_changes     jsonb := '[]'::jsonb;
begin
  select p.business_id into v_business_id
  from profiles p
  where p.id = auth.uid() and p.role = 'client';

  if v_business_id is null then
    raise exception 'Not a client account' using errcode = '42501';
  end if;

  -- Lock the row so the old values we diff against are the ones we replace.
  select * into b from businesses where id = v_business_id for update;
  if b.status is distinct from 'active' then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if coalesce(b.business_hours, '') is distinct from coalesce(p_business_hours, '') then
    v_changes := v_changes || jsonb_build_object('field', 'business_hours', 'old', b.business_hours, 'new', p_business_hours);
  end if;
  if coalesce(b.services, '') is distinct from coalesce(p_services, '') then
    v_changes := v_changes || jsonb_build_object('field', 'services', 'old', b.services, 'new', p_services);
  end if;
  if coalesce(b.urgent_triggers, '') is distinct from coalesce(p_urgent_triggers, '') then
    v_changes := v_changes || jsonb_build_object('field', 'urgent_triggers', 'old', b.urgent_triggers, 'new', p_urgent_triggers);
  end if;
  if coalesce(b.sms_contact_1, '') is distinct from coalesce(p_sms_contact_1, '') then
    v_changes := v_changes || jsonb_build_object('field', 'sms_contact_1', 'old', b.sms_contact_1, 'new', p_sms_contact_1);
  end if;
  if coalesce(b.sms_contact_2, '') is distinct from coalesce(p_sms_contact_2, '') then
    v_changes := v_changes || jsonb_build_object('field', 'sms_contact_2', 'old', b.sms_contact_2, 'new', p_sms_contact_2);
  end if;
  if b.avg_job_value is distinct from p_avg_job_value then
    v_changes := v_changes || jsonb_build_object('field', 'avg_job_value', 'old', b.avg_job_value::text, 'new', p_avg_job_value::text);
  end if;

  if jsonb_array_length(v_changes) = 0 then
    return;
  end if;

  update businesses set
    business_hours  = p_business_hours,
    services        = p_services,
    urgent_triggers = p_urgent_triggers,
    sms_contact_1   = p_sms_contact_1,
    sms_contact_2   = p_sms_contact_2,
    avg_job_value   = p_avg_job_value
  where id = v_business_id;

  insert into client_settings_changes (business_id, business_name, changed_by, changes)
  values (v_business_id, b.name, auth.uid(), v_changes);
end;
$$;

-- create or replace keeps 015's grants, restated here for clarity.
revoke execute on function public.update_my_business_settings(text, text, text, text, text, numeric) from public, anon;
grant execute on function public.update_my_business_settings(text, text, text, text, text, numeric) to authenticated;

commit;

-- Rollback: re-run 015's function body, then
--   drop table public.client_settings_changes;
