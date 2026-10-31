-- Step 18: duplicate-prevention (phone is the key, name is the fallback) +
-- lead requests for the Setter Portal.
--
-- Applied by hand in the SQL editor — staging first, then production (same
-- as every prior migration; there's no CLI runner in this repo).
--
-- BEFORE APPLYING: run the unparseable-phone report so bad numbers are
-- known before the check goes live:
--   node --env-file=.env.local scripts/report-unparseable-phones.mjs
-- (Section 7 below prints the same list from inside the DB afterwards.)
--
-- What this adds:
--   1. normalize_phone_e164() — THE phone normalizer. Every table that holds
--      a business gets a phone_normalized column kept in sync by a trigger,
--      so every write path (setter/rep/admin Add Prospect, website demo
--      requests, client records, anything future) normalizes on write
--      without app changes. lib/business-normalize.ts is its TypeScript twin
--      (UI validation + unit tests); section 1b asserts they agree on the
--      same fixtures and aborts the migration if not.
--   2. normalize_business_name() — same idea for names (twin in the same TS
--      file, same fixture check).
--   3. find_business_matches() — searches EVERY business regardless of owner:
--      prospects (setter + rep pipeline), clients, Web Leads (`leads`,
--      phone-only). Exact phone_normalized match = 'phone' (hard block).
--      Otherwise a tight name match = 'name' (soft "Possible match").
--   4. create_prospect_checked() — the only way a setter can add a prospect:
--      global advisory lock, re-check phones, insert only if no phone match.
--      Plus a RESTRICTIVE insert policy so setters can't insert directly.
--   5. lead_requests + decide_lead_request().
--
-- New functions run as the caller (no SECURITY DEFINER); the matching /
-- create / decide functions are executable by service_role only — every call
-- goes through a Next.js API route behind requireRole(). lead_requests has RLS
-- on and no policies: anon/authenticated can't touch it at all.

begin;

-- pg_trgm lives in `extensions` on Supabase; functions put both schemas on
-- search_path so similarity() resolves wherever it was installed.
create extension if not exists pg_trgm with schema extensions;

-- ── 1. Normalizers ───────────────────────────────────────────────────────

-- '+1XXXXXXXXXX', or NULL when blank OR unparseable (callers that need to
-- tell those apart check the raw value for blankness). Trailing extensions
-- ("ext 12", "ext. 12", "x12", "#12") are dropped first; then digits only;
-- 11 digits with a leading 1 -> drop the 1; anything but 10 digits -> NULL.
create or replace function public.normalize_phone_e164(p text)
returns text language sql immutable set search_path = public as $$
  select case when d ~ '^[0-9]{10}$' then '+1' || d end
  from (
    select case when length(d0) = 11 and left(d0, 1) = '1' then substr(d0, 2) else d0 end as d
    from (
      select regexp_replace(
        regexp_replace(coalesce(p, ''), '\s*[,;]?\s*(extension|ext\.?|x|#)\s*[0-9]{1,6}\s*$', '', 'i'),
        '[^0-9]', '', 'g') as d0
    ) a
  ) b
$$;

-- lower-case; "&" -> "and"; periods/apostrophes dropped ("M.A.D." = "MAD",
-- "Bob's" = "Bobs"); other punctuation -> space; suffix/filler words dropped
-- (inc, incorporated, llc, ltd, limited, corp, corporation, co, company, the,
-- and); reno/renos/renovation(s)/renovating -> "reno".
--   "M.A.D. Renovations" = "MAD Renos" = "MAD Renovations" = 'mad reno'
create or replace function public.normalize_business_name(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(array_to_string(array(
    select case when t in ('reno', 'renos', 'renovation', 'renovations', 'renovating') then 'reno' else t end
    from unnest(string_to_array(
      regexp_replace(
        regexp_replace(replace(lower(coalesce(p, '')), '&', ' and '), '[''’.]', '', 'g'),
        '[^a-z0-9]+', ' ', 'g'),
      ' ')) with ordinality as u(t, i)
    where t <> '' and t not in ('inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'the', 'and')
    order by i
  ), ' '), '')
$$;

-- ── 1b. Fixture check: must match lib/business-normalize.test.ts ─────────
do $$
declare
  f record;
begin
  for f in select * from (values
    ('(403) 555-0123', '+14035550123'), ('403-555-0123', '+14035550123'), ('403.555.0123', '+14035550123'),
    ('+14035550123', '+14035550123'), ('1 403 555 0123', '+14035550123'), ('4035550123', '+14035550123'),
    ('403-555-0123 ext 12', '+14035550123'), ('403-555-0123 ext. 12', '+14035550123'), ('(403) 555-0123 x12', '+14035550123'),
    ('403 555 0123 #4', '+14035550123'), ('403-555-0123, extension 204', '+14035550123'),
    ('+1 (403) 555-0123', '+14035550123'), ('403-555-0123 EXT12', '+14035550123'), ('4035550123x12', '+14035550123'),
    ('', null), ('   ', null), ('abc', null), ('630-6311', null), ('2 403 555 0123', null), ('403555012399', null), ('call me', null),
    ('---', null), ('+44 20 7946 0958', null)
  ) v(raw, expected) loop
    if public.normalize_phone_e164(f.raw) is distinct from f.expected then
      raise exception 'normalize_phone_e164(%) = %, expected %', f.raw, public.normalize_phone_e164(f.raw), f.expected;
    end if;
  end loop;
  for f in select * from (values
    ('M.A.D. Renovations', 'mad reno'), ('MAD Renos', 'mad reno'), ('MAD Renovations', 'mad reno'),
    ('Smith Roofing & Renos Ltd.', 'smith roofing reno'), ('Smith Roofing and Renovations Inc', 'smith roofing reno'),
    ('The Atlas Roofing Co.', 'atlas roofing'), ('Bob''s Plumbing, LLC', 'bobs plumbing'), ('', null), ('Inc.', null)
  ) v(raw, expected) loop
    if public.normalize_business_name(f.raw) is distinct from f.expected then
      raise exception 'normalize_business_name(%) = %, expected %', f.raw, public.normalize_business_name(f.raw), f.expected;
    end if;
  end loop;
end $$;

-- ── 2. phone_normalized columns, kept in sync on every write ─────────────

alter table public.prospects add column if not exists phone_normalized text;
alter table public.prospects add column if not exists contact_phone_normalized text;
alter table public.clients   add column if not exists phone_normalized text;
alter table public.leads     add column if not exists phone_normalized text;

create or replace function public.set_prospect_phone_normalized()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone_normalized := public.normalize_phone_e164(new.phone);
  new.contact_phone_normalized := public.normalize_phone_e164(new.contact_phone);
  return new;
end $$;

create or replace function public.set_phone_normalized()
returns trigger language plpgsql set search_path = public as $$
begin
  new.phone_normalized := public.normalize_phone_e164(new.phone);
  return new;
end $$;

revoke execute on function public.set_prospect_phone_normalized() from public, anon, authenticated;
revoke execute on function public.set_phone_normalized() from public, anon, authenticated;

-- Backfill with user triggers off: an UPDATE of every row must not fire
-- anything else (e.g. an updated_at bump would make every lead look
-- recently active and hide real stale leads; clients has the migration-008
-- booked_by_setter guards). Values are set directly here.
alter table public.prospects disable trigger user;
alter table public.clients   disable trigger user;
alter table public.leads     disable trigger user;
update public.prospects set phone_normalized = public.normalize_phone_e164(phone),
                            contact_phone_normalized = public.normalize_phone_e164(contact_phone);
update public.clients set phone_normalized = public.normalize_phone_e164(phone);
update public.leads   set phone_normalized = public.normalize_phone_e164(phone);
alter table public.prospects enable trigger user;
alter table public.clients   enable trigger user;
alter table public.leads     enable trigger user;

create trigger prospects_phone_normalized before insert or update of phone, contact_phone, phone_normalized, contact_phone_normalized
  on public.prospects for each row execute function public.set_prospect_phone_normalized();
create trigger clients_phone_normalized before insert or update of phone, phone_normalized
  on public.clients for each row execute function public.set_phone_normalized();
create trigger leads_phone_normalized before insert or update of phone, phone_normalized
  on public.leads for each row execute function public.set_phone_normalized();

create index if not exists prospects_phone_normalized_idx on public.prospects (phone_normalized) where phone_normalized is not null;
create index if not exists prospects_contact_phone_normalized_idx on public.prospects (contact_phone_normalized) where contact_phone_normalized is not null;
create index if not exists clients_phone_normalized_idx on public.clients (phone_normalized) where phone_normalized is not null;
create index if not exists leads_phone_normalized_idx on public.leads (phone_normalized) where phone_normalized is not null;

-- ── 3. Matching ──────────────────────────────────────────────────────────
-- 'phone' (hard block): any query phone equals any of the row's normalized
--   phones (prospects: phone + contact_phone; clients/leads: phone).
-- 'name' (soft warning), only when there's no phone match:
--   • normalized names equal, or trigram similarity >= 0.7
--   • AND city agrees when both sides have one; same for trade
--   • AND phone decides: if the query has a phone and the row has a phone,
--     they're different businesses — no name match.
--   • p_prefix (Call Log lookup box only): also match when the query is a
--     word-prefix of the name ("atlas" -> "Atlas Roofing"), since there the
--     setter is typing a partial name to look something up.
-- Web Leads have no company name, so they only ever match on phone.

create or replace function public.find_business_matches(
  p_name text, p_phones text[], p_city text default null, p_trade text default null, p_prefix boolean default false
)
returns table (
  source text, record_id uuid, business_name text, city text, trade text,
  status text, owner_id uuid, last_activity timestamptz, match_reason text
)
language sql stable set search_path = public, extensions as $$
  with q as (
    select
      (select n from (select public.normalize_business_name(p_name) as n) x where length(n) >= 3) as n,
      array(select distinct public.normalize_phone_e164(x) from unnest(coalesce(p_phones, '{}')) x
            where public.normalize_phone_e164(x) is not null) as phs,
      nullif(lower(trim(coalesce(p_city, ''))), '') as city,
      nullif(lower(trim(coalesce(p_trade, ''))), '') as trade
  ),
  cand as (
    select 'prospect'::text as source, p.id, p.company_name as bname, p.city, p.trade, p.status, p.rep_id as owner_id,
           greatest(p.created_at, p.updated_at, p.last_contacted_at,
                    (select max(a.created_at) from public.prospect_activities a where a.prospect_id = p.id)) as last_activity,
           array_remove(array[p.phone_normalized, p.contact_phone_normalized], null) as phones,
           public.normalize_business_name(p.company_name) as nname
    from public.prospects p
    union all
    select 'client', c.id, c.business_name, c.city, null, c.status, c.rep_id, c.created_at,
           array_remove(array[c.phone_normalized], null), public.normalize_business_name(c.business_name)
    from public.clients c
    union all
    select 'lead', l.id, null, null, l.business_type, l.status, l.assigned_to, l.created_at,
           array_remove(array[l.phone_normalized], null), null
    from public.leads l
  ),
  scored as (
    select cand.*,
      (cand.phones && q.phs) as phone_hit,
      (q.n is not null and cand.nname is not null
        and (cardinality(q.phs) = 0 or cardinality(cand.phones) = 0)
        and (q.city is null or nullif(lower(trim(coalesce(cand.city, ''))), '') is null or lower(trim(cand.city)) = q.city)
        and (q.trade is null or nullif(lower(trim(coalesce(cand.trade, ''))), '') is null or lower(trim(cand.trade)) = q.trade)
        and (cand.nname = q.n
             or similarity(cand.nname, q.n) >= 0.7
             or (p_prefix and (' ' || cand.nname) like ('% ' || q.n || '%')))
      ) as name_hit,
      case when q.n is not null and cand.nname is not null then similarity(cand.nname, q.n) else 0 end as sim
    from cand, q
  )
  select source, id, bname, city, trade, status, owner_id, last_activity,
         case when phone_hit then 'phone' else 'name' end
  from scored
  where phone_hit or name_hit
  order by (case when phone_hit then 0 else 1 end), sim desc, last_activity desc nulls last
$$;

-- ── 4. Setter add-prospect (the only setter write path) ──────────────────

create or replace function public.create_prospect_checked(p_rep_id uuid, p_fields jsonb, p_stage text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  v_id uuid;
  v_phone_hits int;
begin
  if p_rep_id is null or coalesce(trim(p_fields->>'company_name'), '') = '' then
    raise exception 'rep and company name are required' using errcode = '22023';
  end if;
  -- Junk numbers are rejected, never saved (the API checks first; this is the backstop).
  if (coalesce(trim(p_fields->>'phone'), '') <> '' and public.normalize_phone_e164(p_fields->>'phone') is null)
     or (coalesce(trim(p_fields->>'contact_phone'), '') <> '' and public.normalize_phone_e164(p_fields->>'contact_phone') is null) then
    raise exception 'invalid phone number' using errcode = '22023';
  end if;

  -- Serialize every checked create; released at commit. The match query
  -- below is a new statement after the lock, so it sees any prospect a
  -- concurrent create committed while we waited.
  perform pg_advisory_xact_lock(hashtext('setera:create_prospect_checked'));

  select count(*) into v_phone_hits
  from public.find_business_matches(null, array[p_fields->>'phone', p_fields->>'contact_phone'])
  where match_reason = 'phone';
  if v_phone_hits > 0 then
    return jsonb_build_object('blocked', true);
  end if;

  insert into public.prospects (
    rep_id, company_name, trade, province, city, website, phone, email,
    contact_name, contact_position, contact_phone, contact_email,
    source, status, tier, follow_up_date, notes
  ) values (
    p_rep_id, trim(p_fields->>'company_name'), p_fields->>'trade', p_fields->>'province', p_fields->>'city',
    p_fields->>'website', p_fields->>'phone', p_fields->>'email',
    p_fields->>'contact_name', p_fields->>'contact_position', p_fields->>'contact_phone', p_fields->>'contact_email',
    p_fields->>'source', coalesce(nullif(p_fields->>'status', ''), 'Not Contacted'), p_fields->>'tier',
    nullif(p_fields->>'follow_up_date', '')::date, p_fields->>'notes'
  ) returning id into v_id;

  insert into public.prospect_stage_history (prospect_id, rep_id, stage, entered_at)
  values (v_id, p_rep_id, coalesce(nullif(p_stage, ''), 'New'), now());

  return jsonb_build_object('blocked', false, 'id', v_id);
end $$;

-- Setters must go through create_prospect_checked (via /api/prospects/create).
-- RESTRICTIVE, so it ANDs with the existing permissive insert policy without
-- touching it; every other role is unaffected. coalesce: a NULL role (no
-- profile row) isn't a setter, and the permissive policy still gates it.
create policy "Setters add prospects only via checked create" on public.prospects
  as restrictive for insert to authenticated
  with check (coalesce(get_my_role(), '') <> 'setter');

-- ── 5. Lead requests ─────────────────────────────────────────────────────

create table public.lead_requests (
  id                 uuid primary key default gen_random_uuid(),
  prospect_id        uuid not null references public.prospects(id) on delete cascade,
  requester_id       uuid not null references public.profiles(id) on delete cascade,
  note               text check (note is null or char_length(note) <= 1000),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  previous_owner_id  uuid references public.profiles(id) on delete set null,  -- snapshot at approval
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  decided_by         uuid references public.profiles(id) on delete set null,
  requester_seen_at  timestamptz  -- setter dismissed the outcome notice
);

-- One pending request per (lead, setter), enforced in the DB so a
-- double-click can't create two.
create unique index lead_requests_one_pending
  on public.lead_requests (prospect_id, requester_id) where status = 'pending';
create index lead_requests_pending_idx
  on public.lead_requests (created_at desc) where status = 'pending';
create index lead_requests_requester_idx
  on public.lead_requests (requester_id, created_at desc);

alter table public.lead_requests enable row level security;
revoke all on public.lead_requests from anon, authenticated;

-- Approve: reassign the prospect to the requester, snapshot the previous
-- owner, and deny every other pending request for the same lead (those
-- setters see "denied"). updated_at = now() restarts the stale clock, so the
-- lead isn't immediately requestable again.
create or replace function public.decide_lead_request(p_request_id uuid, p_approve boolean, p_admin_id uuid)
returns jsonb language plpgsql set search_path = public as $$
declare
  r public.lead_requests%rowtype;
  v_prev uuid;
begin
  select * into r from public.lead_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'Request already %', r.status using errcode = 'P0001';
  end if;

  if p_approve then
    select rep_id into v_prev from public.prospects where id = r.prospect_id for update;
    update public.prospects set rep_id = r.requester_id, updated_at = now() where id = r.prospect_id;
    update public.lead_requests
      set status = 'approved', decided_at = now(), decided_by = p_admin_id, previous_owner_id = v_prev
      where id = r.id;
    update public.lead_requests
      set status = 'denied', decided_at = now(), decided_by = p_admin_id
      where prospect_id = r.prospect_id and status = 'pending' and id <> r.id;
  else
    update public.lead_requests
      set status = 'denied', decided_at = now(), decided_by = p_admin_id
      where id = r.id;
  end if;

  return jsonb_build_object('id', r.id, 'status', case when p_approve then 'approved' else 'denied' end);
end $$;

-- ── 6. Grants: service_role only ─────────────────────────────────────────
revoke execute on function public.find_business_matches(text, text[], text, text, boolean) from public, anon, authenticated;
revoke execute on function public.create_prospect_checked(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.decide_lead_request(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.find_business_matches(text, text[], text, text, boolean) to service_role;
grant execute on function public.create_prospect_checked(uuid, jsonb, text) to service_role;
grant execute on function public.decide_lead_request(uuid, boolean, uuid) to service_role;

commit;

-- ── 7. Report: stored numbers that didn't normalize (flagged, not changed) ─
-- Run after the commit; the SQL editor shows the result grid. These rows
-- keep their raw phone but phone_normalized is NULL, so they can't be
-- phone-matched until someone fixes the number.
select 'prospects' as tbl, id, company_name as name, 'phone' as field, phone as raw
  from public.prospects where coalesce(trim(phone), '') <> '' and phone_normalized is null
union all
select 'prospects', id, company_name, 'contact_phone', contact_phone
  from public.prospects where coalesce(trim(contact_phone), '') <> '' and contact_phone_normalized is null
union all
select 'clients', id, business_name, 'phone', phone
  from public.clients where coalesce(trim(phone), '') <> '' and phone_normalized is null
union all
select 'leads', id, name, 'phone', phone
  from public.leads where coalesce(trim(phone), '') <> '' and phone_normalized is null
order by 1, 3;
