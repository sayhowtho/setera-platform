-- Step 9: Overflow Early Access waitlist (capture only; Overflow is not live).
--
-- Run this by hand in the Supabase SQL editor — STAGING FIRST (same as prior
-- migrations, there's no CLI runner in this repo).
--
-- STATUS: not yet applied anywhere.
--
-- PRE-FLIGHT (confirm before applying):
--   select pg_get_functiondef('public.get_my_role'::regproc);
--   select table_name, column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name in ('profiles','businesses','clients')
--      and column_name in ('id','email','full_name','role','business_id');
--
-- DESIGN: every path (public form, rep quick-add, admin bulk import) calls
-- overflow_ingest_one(). Normalization, validation, consent, unsubscribe
-- suppression, canonical linking, enrichment and events live only there. All
-- writes go through security-definer functions executable by service_role;
-- authenticated/anon have SELECT only (RLS-scoped) and no write privileges.

-- ── 1. Single email definition (CHECK constraint, ingest and client lookup) ──
create or replace function public.overflow_normalize_email(p text) returns text
language sql immutable as $$
  select case when n ~ '^[^@[:space:],;<>()"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
               and length(n) <= 254 then n end
  from (select lower(btrim(coalesce(p,''))) as n) s
$$;

-- ── 2. Tables ──
create table public.overflow_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null,
  business_name text,
  contact_name text,
  location text,  -- free text "City / area"; no geocoding or parsing
  status text not null default 'waitlisted'
    check (status in ('waitlisted','invited','application_started','unsubscribed','removed')),
  source text not null
    check (source in ('sales_rep','website','existing_client','other','backfill')),
  originating_rep_id uuid references public.profiles(id) on delete restrict,
  originating_rep_email_snapshot text,
  originating_rep_name_snapshot text,
  closing_rep_id uuid references public.profiles(id) on delete restrict,
  consent_basis text not null check (consent_basis in ('web_form','verbal_on_call','other')),
  consent_scope text not null default 'overflow_invitation',
  consent_captured_at timestamptz not null,
  business_id uuid references public.businesses(id) on delete set null,
  contact_id uuid,  -- no FK: no contacts table exists yet
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  application_invited_at timestamptz,
  application_started_at timestamptz,
  converted_to_overflow_at timestamptz,
  converted_to_setera_at timestamptz,
  unsubscribed_at timestamptz,
  constraint overflow_location_len check (location is null or char_length(location) <= 120),
  constraint overflow_email_valid check (public.overflow_normalize_email(email) = email_normalized),
  constraint overflow_rep_required check (
    originating_rep_id is not null or source in ('website','other','existing_client')),
  constraint overflow_snapshot_required check (
    originating_rep_id is null or originating_rep_email_snapshot is not null)
);
create unique index overflow_waitlist_email_normalized_uidx on public.overflow_waitlist (email_normalized);
create index overflow_waitlist_rep_idx     on public.overflow_waitlist (originating_rep_id);
create index overflow_waitlist_status_idx  on public.overflow_waitlist (status);
create index overflow_waitlist_created_idx on public.overflow_waitlist (created_at desc);

create table public.overflow_waitlist_events (
  id uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references public.overflow_waitlist(id) on delete restrict,
  event_type text not null check (event_type in ('waitlist_joined','rep_submitted','duplicate_submission',
    'backfilled','backfilled_historical_touch','unsubscribed','status_changed')),
  actor_user_id uuid references public.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('rep','admin','public','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index overflow_events_waitlist_idx on public.overflow_waitlist_events (waitlist_id, created_at);
create index overflow_events_actor_idx    on public.overflow_waitlist_events (actor_user_id, created_at desc);

-- Public-form rate limiting (no Redis in this stack). service_role only.
create table public.overflow_rate_limit (
  bucket text primary key, window_start timestamptz not null, hits int not null
);

-- ── 3. Database-level guarantees ──
create or replace function public.overflow_guard_waitlist_update() returns trigger
language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.email_normalized is distinct from old.email_normalized
     or new.source is distinct from old.source
     or new.originating_rep_id is distinct from old.originating_rep_id
     or new.originating_rep_email_snapshot is distinct from old.originating_rep_email_snapshot
     or new.originating_rep_name_snapshot is distinct from old.originating_rep_name_snapshot
     or new.created_at is distinct from old.created_at
     or new.consent_basis is distinct from old.consent_basis
     or new.consent_captured_at is distinct from old.consent_captured_at then
    raise exception 'overflow_waitlist: attribution/identity/consent columns are immutable';
  end if;
  -- enrichment may only fill empty fields
  if (coalesce(old.business_name,'') <> '' and new.business_name is distinct from old.business_name)
     or (coalesce(old.contact_name,'') <> '' and new.contact_name is distinct from old.contact_name)
     or (coalesce(old.location,'') <> '' and new.location is distinct from old.location) then
    raise exception 'overflow_waitlist: existing business/contact/location values cannot be overwritten';
  end if;
  -- suppression is permanent until a future explicit re-consent flow ships (via a new migration)
  if old.status in ('unsubscribed','removed') and new.status not in ('unsubscribed','removed') then
    raise exception 'overflow_waitlist: % record cannot return to %', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger overflow_waitlist_guard_update before update on public.overflow_waitlist
  for each row execute function public.overflow_guard_waitlist_update();

create or replace function public.overflow_block_mutation() returns trigger
language plpgsql as $$
begin raise exception '% on % is not permitted (append-only / no hard delete)', tg_op, tg_table_name; end $$;
create trigger overflow_waitlist_no_delete before delete on public.overflow_waitlist
  for each row execute function public.overflow_block_mutation();
create trigger overflow_waitlist_no_truncate before truncate on public.overflow_waitlist
  for each statement execute function public.overflow_block_mutation();
create trigger overflow_events_append_only before update or delete on public.overflow_waitlist_events
  for each row execute function public.overflow_block_mutation();
create trigger overflow_events_no_truncate before truncate on public.overflow_waitlist_events
  for each statement execute function public.overflow_block_mutation();

-- ── 4. RLS: reads only; every write goes through the security-definer functions ──
alter table public.overflow_waitlist        enable row level security;
alter table public.overflow_waitlist_events enable row level security;
alter table public.overflow_rate_limit      enable row level security;
revoke all on public.overflow_waitlist, public.overflow_waitlist_events, public.overflow_rate_limit
  from anon, authenticated;
grant select on public.overflow_waitlist, public.overflow_waitlist_events to authenticated;

create policy overflow_waitlist_admin_select on public.overflow_waitlist for select to authenticated
  using (get_my_role() = any (array['admin','owner']));
create policy overflow_waitlist_rep_select on public.overflow_waitlist for select to authenticated
  using (originating_rep_id = auth.uid());
create policy overflow_events_admin_select on public.overflow_waitlist_events for select to authenticated
  using (get_my_role() = any (array['admin','owner']));
create policy overflow_events_rep_select on public.overflow_waitlist_events for select to authenticated
  using (actor_user_id = auth.uid());

-- ── 5. Canonical ingestion ──

-- Strict YYYY-MM-DD only; anything else (including other timestamp formats) is null.
create or replace function public.overflow_try_date(p text) returns timestamptz
language plpgsql immutable as $$
declare d date;
begin
  if p is null or btrim(p) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := btrim(p)::date;                       -- raises on 2026-02-31 etc.
  if to_char(d, 'YYYY-MM-DD') <> btrim(p) then return null; end if;
  return (btrim(p) || ' 12:00:00+00')::timestamptz;   -- noon UTC: no off-by-one across timezones
exception when others then return null;
end $$;

create or replace function public.overflow_ingest_one(
  p_email text, p_business_name text, p_contact_name text,
  p_path text,                           -- 'public_form' | 'rep_quick_add' | 'admin_import'
  p_actor_user_id uuid,                  -- null only for public_form
  p_consent_confirmed boolean,           -- REQUIRED true for rep_quick_add and admin_import
  p_credited_rep_id uuid default null,   -- admin_import only; IGNORED for rep_quick_add
  p_claimed_at timestamptz default null, -- admin_import only
  p_batch_id uuid default null, p_row_no int default null,
  p_location text default null           -- optional free text, trimmed and capped at 120
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm text := public.overflow_normalize_email(p_email);
  v_biz text := nullif(btrim(coalesce(p_business_name,'')),'');
  v_contact text := nullif(btrim(coalesce(p_contact_name,'')),'');
  v_loc text := left(nullif(btrim(coalesce(p_location,'')),''), 120);
  v_role text; v_actor_type text; v_source text; v_basis text;
  v_rep_id uuid; v_rep_email text; v_rep_name text;
  v_created timestamptz := now(); v_captured timestamptz := now();
  v_link uuid;
  v_id uuid; v_ex public.overflow_waitlist%rowtype;
  v_enriched jsonb := '{}'::jsonb; v_meta jsonb; v_type text;
begin
  if p_path = 'public_form' then
    v_actor_type := 'public'; v_source := 'website'; v_basis := 'web_form';
  elsif p_path in ('rep_quick_add','admin_import') then
    if p_consent_confirmed is not true then
      raise exception 'consent confirmation is required';
    end if;
    select role into v_role from profiles where id = p_actor_user_id;
    if v_role is null then raise exception 'unknown actor'; end if;
    v_actor_type := case when v_role in ('admin','owner') then 'admin' else 'rep' end;
    if p_path = 'admin_import' and v_actor_type <> 'admin' then raise exception 'forbidden'; end if;
    if p_path = 'rep_quick_add' and v_role not in ('rep','vp_sales','setter','admin','owner') then
      raise exception 'forbidden';
    end if;
    v_source := 'sales_rep'; v_basis := 'verbal_on_call';
    v_rep_id := case when p_path = 'rep_quick_add' then p_actor_user_id else p_credited_rep_id end;
    select email, full_name into v_rep_email, v_rep_name from profiles where id = v_rep_id;
    if not found then raise exception 'unknown rep'; end if;
    if p_path = 'admin_import' then v_created := coalesce(p_claimed_at, now()); v_captured := v_created; end if;
  else
    raise exception 'bad path';
  end if;

  if v_norm is null then return jsonb_build_object('outcome','invalid_email'); end if;

  -- Canonical link: exact normalized email, exactly one business, no unlinked match.
  -- Client status is NEVER returned to callers (reps must not learn it).
  select case when count(*) filter (where bid is null) = 0 and count(distinct bid) = 1
              then min(bid::text)::uuid end
    into v_link
    from (select id as bid from businesses where public.overflow_normalize_email(email) = v_norm
          union all select business_id from clients where public.overflow_normalize_email(email) = v_norm
          union all select business_id from profiles where role = 'client'
                    and public.overflow_normalize_email(email) = v_norm) m;

  v_meta := jsonb_build_object('path', p_path, 'submitted_email', btrim(p_email),
             'submitted_business', v_biz, 'submitted_location', v_loc, 'submitted_at', now(),
             'batch_id', p_batch_id, 'row_no', p_row_no,
             'rep', case when v_rep_id is null then null
                    else jsonb_build_object('id', v_rep_id, 'email', v_rep_email, 'name', v_rep_name) end);

  insert into overflow_waitlist (email, email_normalized, business_name, contact_name, location, source,
      originating_rep_id, originating_rep_email_snapshot, originating_rep_name_snapshot,
      consent_basis, consent_captured_at, business_id, created_at)
  values (btrim(p_email), v_norm, v_biz, v_contact, v_loc, v_source,
      v_rep_id, v_rep_email, v_rep_name, v_basis, v_captured, v_link, v_created)
  on conflict (email_normalized) do nothing
  returning id into v_id;

  if v_id is not null then
    v_type := case p_path when 'public_form' then 'waitlist_joined'
                          when 'rep_quick_add' then 'rep_submitted' else 'backfilled' end;
    insert into overflow_waitlist_events (waitlist_id, event_type, actor_user_id, actor_type, metadata)
    values (v_id, v_type, p_actor_user_id, v_actor_type,
      v_meta || jsonb_build_object('link', jsonb_build_object('business_id', v_link,
                 'rule', 'exact_email_single_business'),
                 'claimed_at', p_claimed_at,
                 'imported_at', case when p_path = 'admin_import' then now() end));
    return jsonb_build_object('outcome','created','waitlist_id',v_id);
  end if;

  -- Existing record: first touch wins; attribution is never touched.
  select * into v_ex from overflow_waitlist where email_normalized = v_norm for update;
  v_type := case when p_path = 'admin_import' then 'backfilled_historical_touch' else 'duplicate_submission' end;
  v_meta := v_meta || jsonb_build_object('claimed_at', p_claimed_at);

  if v_ex.status in ('unsubscribed','removed') then
    insert into overflow_waitlist_events (waitlist_id, event_type, actor_user_id, actor_type, metadata)
    values (v_ex.id, v_type, p_actor_user_id, v_actor_type, v_meta || '{"suppressed":true}'::jsonb);
    return jsonb_build_object('outcome','suppressed','waitlist_id',v_ex.id);
  end if;

  if coalesce(v_ex.business_name,'') = '' and v_biz is not null then v_enriched := v_enriched || jsonb_build_object('business_name', v_biz); end if;
  if coalesce(v_ex.contact_name,'')  = '' and v_contact is not null then v_enriched := v_enriched || jsonb_build_object('contact_name', v_contact); end if;
  if coalesce(v_ex.location,'') = ''     and v_loc is not null     then v_enriched := v_enriched || jsonb_build_object('location', v_loc); end if;
  if v_ex.business_id is null and v_link is not null then v_enriched := v_enriched || jsonb_build_object('business_id', v_link); end if;
  if v_enriched <> '{}'::jsonb then
    update overflow_waitlist set
      business_name = coalesce(nullif(business_name,''), v_biz),
      contact_name  = coalesce(nullif(contact_name,''),  v_contact),
      location      = coalesce(nullif(location,''),      v_loc),
      business_id   = coalesce(business_id, v_link)
    where id = v_ex.id;
  end if;

  insert into overflow_waitlist_events (waitlist_id, event_type, actor_user_id, actor_type, metadata)
  values (v_ex.id, v_type, p_actor_user_id, v_actor_type, v_meta || jsonb_build_object('enriched', v_enriched));
  return jsonb_build_object('outcome', case when p_path = 'admin_import' then 'historical_touch' else 'duplicate' end,
    'waitlist_id', v_ex.id, 'originally_added_at', v_ex.created_at, 'enriched', v_enriched);
end $$;

-- Bulk import: earliest valid claimed date decides first touch, not row order.
create or replace function public.overflow_ingest_import(p_admin_id uuid, p_rows jsonb,
  p_batch_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_rep uuid; v_n int; v_res jsonb; v_when timestamptz; v_key text;
  v_seen text[] := '{}'; v_out jsonb := '[]'::jsonb; v_status text; v_bucket text;
  c jsonb := '{"imported":0,"duplicates":0,"historical_touches":0,"skipped_no_consent":0,"skipped_unsubscribed":0,"failed":0}';
begin
  if not exists (select 1 from profiles where id = p_admin_id and role in ('admin','owner')) then
    raise exception 'forbidden';
  end if;
  for r in
    select (e->>'row_no')::int as row_no, e->>'rep_email' as rep_email, e->>'email' as email,
           e->>'business' as business, e->>'contact' as contact, e->>'location' as location,
           e->>'date_added' as date_added, e->>'agreed' as agreed
      from jsonb_array_elements(p_rows) e
     order by public.overflow_try_date(e->>'date_added') nulls last, (e->>'row_no')::int
  loop
    v_status := null; v_res := null;
    v_when := public.overflow_try_date(r.date_added);
    v_key := public.overflow_normalize_email(r.email);
    if lower(btrim(coalesce(r.agreed,''))) not in ('true','yes','y','1') then
      v_status := 'skipped_no_consent';
    elsif v_key is null then v_status := 'failed_invalid_email';
    elsif v_when is null or v_when > now() then v_status := 'failed_bad_date';
    else
      select count(*), min(id::text)::uuid into v_n, v_rep from profiles
       where lower(btrim(email)) = lower(btrim(coalesce(r.rep_email,'')))
         and role in ('rep','vp_sales','setter','admin','owner');
      if v_n <> 1 then v_status := 'failed_unknown_rep';
      else
        begin
          v_res := public.overflow_ingest_one(r.email, r.business, r.contact, 'admin_import',
                     p_admin_id, true, v_rep, v_when, p_batch_id, r.row_no, r.location);
          v_status := case v_res->>'outcome'
            when 'created' then 'imported'
            when 'historical_touch' then case when v_key = any(v_seen) then 'duplicate_in_batch' else 'historical_touch' end
            when 'suppressed' then 'skipped_unsubscribed'
            else 'failed_' || (v_res->>'outcome') end;
          if v_res->>'outcome' = 'created' then v_seen := v_seen || v_key; end if;
        exception when others then v_status := 'failed_error'; v_res := jsonb_build_object('error', sqlerrm);
        end;
      end if;
    end if;
    v_bucket := case when v_status like 'failed%' then 'failed'
                     when v_status = 'duplicate_in_batch' then 'duplicates'
                     when v_status = 'historical_touch' then 'historical_touches'
                     else v_status end;
    c := jsonb_set(c, array[v_bucket], to_jsonb((c->>v_bucket)::int + 1));
    v_out := v_out || jsonb_build_object('row_no', r.row_no, 'status', v_status, 'detail', v_res);
  end loop;
  return jsonb_build_object('batch_id', p_batch_id, 'counts', c, 'rows', v_out);
end $$;

-- Admin-only status changes. Only suppression states for now; nothing becomes
-- 'invited' until an email provider confirms a send (future invitations table).
create or replace function public.overflow_set_status(p_waitlist_id uuid, p_new_status text, p_admin_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not exists (select 1 from profiles where id = p_admin_id and role in ('admin','owner')) then raise exception 'forbidden'; end if;
  if p_new_status not in ('unsubscribed','removed') then raise exception 'unsupported status'; end if;
  select status into v_old from overflow_waitlist where id = p_waitlist_id for update;
  if not found then raise exception 'not found'; end if;
  update overflow_waitlist set status = p_new_status,
    unsubscribed_at = case when p_new_status = 'unsubscribed' then coalesce(unsubscribed_at, now()) else unsubscribed_at end
   where id = p_waitlist_id;
  insert into overflow_waitlist_events (waitlist_id, event_type, actor_user_id, actor_type, metadata)
  values (p_waitlist_id, case when p_new_status = 'unsubscribed' then 'unsubscribed' else 'status_changed' end,
          p_admin_id, 'admin', jsonb_build_object('from', v_old, 'to', p_new_status));
end $$;

-- Returns true while the caller is within the limit. The window resets when
-- window_start < now() - p_window (all SET expressions read the OLD row).
create or replace function public.overflow_rate_limit_hit(p_bucket text, p_window interval, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into overflow_rate_limit as t (bucket, window_start, hits) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when t.window_start < now() - p_window then 1 else t.hits + 1 end,
    window_start = case when t.window_start < now() - p_window then now() else t.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

-- Functions: service_role only (Supabase grants EXECUTE to PUBLIC by default).
revoke all on function
  public.overflow_ingest_one(text,text,text,text,uuid,boolean,uuid,timestamptz,uuid,int,text),
  public.overflow_ingest_import(uuid,jsonb,uuid), public.overflow_set_status(uuid,text,uuid),
  public.overflow_rate_limit_hit(text,interval,int) from public, anon, authenticated;
grant execute on function
  public.overflow_ingest_one(text,text,text,text,uuid,boolean,uuid,timestamptz,uuid,int,text),
  public.overflow_ingest_import(uuid,jsonb,uuid), public.overflow_set_status(uuid,text,uuid),
  public.overflow_rate_limit_hit(text,interval,int) to service_role;

-- ── 6. High Table read model: adds the existing-client flag (admin only) ──
-- Computed live so it never goes stale, and never exposed to rep sessions
-- (the view filters on get_my_role(); security_invoker keeps table RLS on too).
create or replace view public.overflow_waitlist_admin as
select w.*,
  exists (
    select 1 from businesses b where public.overflow_normalize_email(b.email) = w.email_normalized
    union all select 1 from clients c where public.overflow_normalize_email(c.email) = w.email_normalized
    union all select 1 from profiles p where p.role = 'client'
              and public.overflow_normalize_email(p.email) = w.email_normalized
  ) as is_existing_client
from public.overflow_waitlist w
where get_my_role() = any (array['admin','owner']);
alter view public.overflow_waitlist_admin set (security_invoker = on);
revoke all on public.overflow_waitlist_admin from anon;
grant select on public.overflow_waitlist_admin to authenticated;
