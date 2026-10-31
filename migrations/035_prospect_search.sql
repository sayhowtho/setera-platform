-- Step 35: server-side Prospects search for The High Table.
--
-- The Prospects page used to load the whole table into the browser and
-- filter there. PostgREST caps a response at 1000 rows, so once prospects
-- passed 1000 (prod: 1062 on 2026-10-06) the oldest silently vanished from
-- search, filters and counts. The page now filters, counts and paginates in
-- the query; this migration adds what those queries need:
--
--   1. Four search columns kept in sync by a trigger (not GENERATED columns:
--      code that writes a whole prospect row back would fail on a generated
--      column, a trigger just overwrites whatever was sent):
--        search_text   lower(company_name contact_name city trade)
--        phone_digits  digits of phone, a space, digits of contact_phone;
--                      a leading 1 on an 11-digit number is dropped, so
--                      "+1 (306) 555-0199" -> "3065550199". Unlike 018's
--                      phone_normalized (E.164 or NULL), every number keeps
--                      its digits, so partial/area-code search works.
--        province_key  lower(trim(province)), '' when blank
--        city_key      lower(trim(city)), '' when blank
--      The page searches with `search_text like '%q%'` and, for a query made
--      only of phone characters, `phone_digits like '%digits%'`.
--   2. Trigram indexes for those LIKEs (pg_trgm is already installed in
--      `extensions` by 018), plus btree indexes for the sort and filters.
--   3. prospect_filter_options(): Province/City dropdown options with counts.
--   4. prospect_stats(): per rep/status/tier counts for the Board column
--      counts, Overview tiles and per-rep rollups.
--   5. prospect_ids_in_order(): orders a selection like the table, for
--      Allocate (ids go in a POST body; thousands of ids don't fit in a URL).
--
-- All functions are SECURITY INVOKER: they see exactly the rows the caller's
-- RLS lets them see, same as the old select('*').
--
-- Applied by hand in the SQL editor: staging first, then production. Must be
-- applied BEFORE the app code that queries search_text / phone_digits /
-- province_key / city_key is deployed, or the Prospects page errors.

begin;

-- ── 1. search columns ─────────────────────────────────────────────────────

alter table public.prospects
  add column if not exists search_text  text,
  add column if not exists phone_digits text,
  add column if not exists province_key text,
  add column if not exists city_key     text;

create or replace function public.prospect_phone_digits(p text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^1([0-9]{10})$', '\1')
$$;

create or replace function public.set_prospect_search_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  new.search_text := lower(coalesce(new.company_name, '') || ' ' || coalesce(new.contact_name, '') || ' '
                           || coalesce(new.city, '') || ' ' || coalesce(new.trade, ''));
  new.phone_digits := public.prospect_phone_digits(new.phone) || ' ' || public.prospect_phone_digits(new.contact_phone);
  new.province_key := lower(btrim(coalesce(new.province, '')));
  new.city_key := lower(btrim(coalesce(new.city, '')));
  return new;
end $$;

revoke execute on function public.set_prospect_search_columns() from public, anon, authenticated;

-- Fixtures: abort if the phone digits come out wrong.
do $$
declare f record;
begin
  for f in select * from (values
    ('+1 (306) 555-0199', '3065550199'), ('306-555-0199', '3065550199'), ('13065550199', '3065550199'),
    ('3065550199', '3065550199'), ('306.555.0199 ext 12', '306555019912'), ('', ''), (null, '')
  ) v(raw, expected) loop
    if public.prospect_phone_digits(f.raw) is distinct from f.expected then
      raise exception 'prospect_phone_digits(%) = %, expected %', f.raw, public.prospect_phone_digits(f.raw), f.expected;
    end if;
  end loop;
end $$;

-- Backfill with user triggers off, as in 018: touching every row must not
-- bump updated_at or fire anything else. Values are set directly here.
alter table public.prospects disable trigger user;
update public.prospects set
  search_text  = lower(coalesce(company_name, '') || ' ' || coalesce(contact_name, '') || ' '
                       || coalesce(city, '') || ' ' || coalesce(trade, '')),
  phone_digits = public.prospect_phone_digits(phone) || ' ' || public.prospect_phone_digits(contact_phone),
  province_key = lower(btrim(coalesce(province, ''))),
  city_key     = lower(btrim(coalesce(city, '')));
alter table public.prospects enable trigger user;

-- Lists its own columns too, so a direct write to them is overwritten.
create trigger prospects_search_columns before insert or update of
  company_name, contact_name, city, trade, phone, contact_phone, province,
  search_text, phone_digits, province_key, city_key
  on public.prospects for each row execute function public.set_prospect_search_columns();

-- ── 2. indexes ────────────────────────────────────────────────────────────

create index if not exists prospects_search_text_trgm_idx  on public.prospects using gin (search_text extensions.gin_trgm_ops);
create index if not exists prospects_phone_digits_trgm_idx on public.prospects using gin (phone_digits extensions.gin_trgm_ops);
-- Table/Board sort: newest first, id breaks ties so pages never shift.
create index if not exists prospects_created_at_id_idx     on public.prospects (created_at desc, id);
create index if not exists prospects_status_created_at_idx on public.prospects (status, created_at desc, id);
create index if not exists prospects_province_city_key_idx on public.prospects (province_key, city_key);
-- rep_id already has prospects_rep_id_idx (010).

-- ── 3. Province / City dropdown options ───────────────────────────────────
-- Every province_key / city_key in the table with its last-alphabetical
-- spelling as the label (so "SK" wins over "sk"), and n = matches under
-- Search + Status + Rep (City also limited to p_province_key). The page
-- hides n = 0 unless selected.
-- province key '' = "No province". p_text_like / p_phone_like are the same
-- LIKE patterns the page uses (null = no search); a row matches either.
-- Can exceed 1000 rows (one per distinct city), so the page pages it.
create or replace function public.prospect_filter_options(
  p_text_like text default null, p_phone_like text default null,
  p_status text default null, p_rep uuid default null, p_province_key text default null)
returns table (kind text, key text, label text, n bigint)
language sql stable security invoker set search_path = public as $$
  with base as (
    select p.province_key, p.city_key from public.prospects p
    where (p_text_like is null or p.search_text like p_text_like or (p_phone_like is not null and p.phone_digits like p_phone_like))
      and (p_status is null or p.status = p_status)
      and (p_rep is null or p.rep_id = p_rep)
  ),
  prov_all as (select p.province_key as k, max(btrim(p.province)) as lbl from public.prospects p group by 1),
  prov_n   as (select b.province_key as k, count(*) as n from base b group by 1),
  city_all as (select p.city_key as k, max(btrim(p.city)) as lbl from public.prospects p where p.city_key <> '' group by 1),
  city_n   as (select b.city_key as k, count(*) as n from base b
               where b.city_key <> '' and (p_province_key is null or b.province_key = p_province_key) group by 1)
  select 'province', a.k, coalesce(a.lbl, ''), coalesce(c.n, 0) from prov_all a left join prov_n c on c.k = a.k
  union all
  select 'city', a.k, a.lbl, coalesce(c.n, 0) from city_all a left join city_n c on c.k = a.k
$$;

-- ── 4. counts for Board / Overview / per-rep rollups ──────────────────────
-- (Won This Month comes from prospect_stage_history, not from here.)
create or replace function public.prospect_stats()
returns table (rep_id uuid, status text, tier text, n bigint)
language sql stable security invoker set search_path = public as $$
  select p.rep_id, p.status, p.tier, count(*)
  from public.prospects p
  group by 1, 2, 3
$$;

-- ── 5. selection in table order ───────────────────────────────────────────
-- Returns (id, created_at); the page orders and pages the result itself,
-- since PostgREST caps an RPC response at 1000 rows too.
create or replace function public.prospect_ids_in_order(p_ids uuid[])
returns table (id uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.created_at from public.prospects p where p.id = any(p_ids)
$$;

revoke execute on function public.prospect_filter_options(text, text, text, uuid, text) from public, anon;
revoke execute on function public.prospect_stats() from public, anon;
revoke execute on function public.prospect_ids_in_order(uuid[]) from public, anon;
grant execute on function public.prospect_filter_options(text, text, text, uuid, text) to authenticated;
grant execute on function public.prospect_stats() to authenticated;
grant execute on function public.prospect_ids_in_order(uuid[]) to authenticated;

commit;

-- After applying, sanity check (expect 0 and the full row count):
--   select count(*) filter (where search_text is null or phone_digits is null) as missing, count(*) from public.prospects;
-- Rollback:
--   drop trigger prospects_search_columns on public.prospects;
--   drop function public.set_prospect_search_columns(), public.prospect_phone_digits(text),
--     public.prospect_filter_options(text, text, text, uuid, text),
--     public.prospect_stats(), public.prospect_ids_in_order(uuid[]);
--   alter table public.prospects drop column search_text, drop column phone_digits,
--     drop column province_key, drop column city_key;   -- drops their indexes too
