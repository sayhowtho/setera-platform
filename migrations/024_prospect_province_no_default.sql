-- Step 24: stop defaulting prospect province to SK.
--
-- Until now a prospect saved without a province became 'SK': the column
-- default (any insert that leaves province out, e.g. the website demo
-- request) and create_prospects_batch (Bodhi's import), which coalesced a
-- blank province to 'SK'. On 2026-10-01 that put 400 Bodhi prospects from
-- across Canada under SK (fixed by hand; backup in
-- prospects_province_backup_20261001).
--
-- Now: no column default, and the batch import keeps only a valid two-letter
-- code (anything else -> NULL). The API routes fill a missing province from
-- the city/phone (lib/canada-places.ts) before calling in; when they can't
-- tell, it stays blank, which the High Table Province filter lists as
-- "No province".
--
-- create_prospects_batch below is migration 020's function unchanged except
-- the province expression. Applied by hand in the SQL editor — staging first,
-- then production.

begin;

alter table public.prospects alter column province drop default;

-- 'ab ' -> 'AB'; blanks and anything not a Canadian province/territory -> NULL.
create or replace function public.prospect_province_code(p text)
returns text language sql immutable set search_path = public as $$
  select case when upper(trim(coalesce(p, ''))) in ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')
              then upper(trim(p)) end
$$;
revoke execute on function public.prospect_province_code(text) from public, anon;

create or replace function public.create_prospects_batch(p_rep_id uuid, p_rows jsonb, p_source text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  r          jsonb;
  i          int;
  v_name     text;
  v_phones   text[];
  v_bad      text;
  v_prior    int;
  v_hit      record;
  v_possible jsonb;
  v_id       uuid;
  v_seen     jsonb := '{}'::jsonb;   -- normalized phone -> first row index that used it
  v_results  jsonb := '[]'::jsonb;
  v_status   text;
begin
  if p_rep_id is null then
    raise exception 'owner is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('setera:create_prospect_checked'));

  -- `_row` lets the caller keep its own numbering when it has already
  -- skipped some rows before calling (the API validates status/tier first).
  for r, i in select value, coalesce((value->>'_row')::int, (ordinality - 1)::int) from jsonb_array_elements(p_rows) with ordinality loop
    v_name := trim(coalesce(r->>'company_name', ''));
    if v_name = '' then
      v_results := v_results || jsonb_build_object('row', i, 'status', 'skipped', 'reason', 'missing_name');
      continue;
    end if;

    if trim(coalesce(r->>'status', '')) = 'Closed Won' then
      v_results := v_results || jsonb_build_object('row', i, 'status', 'skipped', 'reason', 'invalid_status', 'company_name', v_name);
      continue;
    end if;

    v_bad := case
      when coalesce(trim(r->>'phone'), '') <> '' and public.normalize_phone_e164(r->>'phone') is null then 'phone'
      when coalesce(trim(r->>'contact_phone'), '') <> '' and public.normalize_phone_e164(r->>'contact_phone') is null then 'contact_phone'
    end;
    if v_bad is not null then
      v_results := v_results || jsonb_build_object('row', i, 'status', 'skipped', 'reason', 'invalid_phone',
        'company_name', v_name, 'field', v_bad, 'value', r->>v_bad);
      continue;
    end if;

    v_phones := array(select distinct x from unnest(array[public.normalize_phone_e164(r->>'phone'), public.normalize_phone_e164(r->>'contact_phone')]) x where x is not null);

    -- Within the batch first, so the report says "same as row N" rather than
    -- pointing at a row this same batch just inserted.
    select min((v_seen->>ph)::int) into v_prior from unnest(v_phones) ph where v_seen ? ph;
    if v_prior is not null then
      v_results := v_results || jsonb_build_object('row', i, 'status', 'skipped', 'reason', 'duplicate_in_batch',
        'company_name', v_name, 'duplicate_of_row', v_prior);
      continue;
    end if;
    select coalesce(v_seen, '{}'::jsonb) || coalesce(jsonb_object_agg(ph, i), '{}'::jsonb) into v_seen from unnest(v_phones) ph;

    select * into v_hit from public.find_business_matches(null, v_phones) where match_reason = 'phone' limit 1;
    if found then
      -- Only the KIND of record matched — the bulk key is write-only, so the
      -- report never echoes back another record's name, city or status.
      v_results := v_results || jsonb_build_object('row', i, 'status', 'skipped', 'reason', 'duplicate_existing',
        'company_name', v_name, 'matched_kind', v_hit.source);
      continue;
    end if;

    begin
      -- Name-only matches are checked before the insert (so the row can't
      -- match itself) and flagged, not blocked. Kind only, no record details.
      select coalesce(jsonb_agg(m.source), '[]'::jsonb)
        into v_possible
        from (select * from public.find_business_matches(v_name, v_phones, r->>'city', r->>'trade') where match_reason = 'name' limit 5) m;

      v_status := coalesce(nullif(trim(r->>'status'), ''), 'Not Contacted');
      insert into public.prospects (
        rep_id, company_name, trade, province, city, website, phone, email,
        contact_name, contact_position, contact_phone, contact_email,
        source, status, tier, follow_up_date, notes
      ) values (
        p_rep_id, v_name, coalesce(nullif(trim(r->>'trade'), ''), 'Roofing'), public.prospect_province_code(r->>'province'),
        r->>'city', r->>'website', r->>'phone', r->>'email',
        r->>'contact_name', r->>'contact_position', r->>'contact_phone', r->>'contact_email',
        p_source, v_status, nullif(trim(r->>'tier'), ''),
        nullif(trim(r->>'follow_up_date'), '')::date, r->>'notes'
      ) returning id into v_id;

      insert into public.prospect_stage_history (prospect_id, rep_id, stage, entered_at)
      values (v_id, p_rep_id, coalesce(nullif(r->>'stage', ''), 'New'), now());

      v_results := v_results || jsonb_build_object('row', i, 'status', 'added', 'id', v_id, 'company_name', v_name,
        'possible_matches', v_possible);
    exception when others then
      -- This row's savepoint is rolled back; free its phones for later rows.
      select v_seen - array(select ph from unnest(v_phones) ph) into v_seen;
      v_results := v_results || jsonb_build_object('row', i, 'status', 'error', 'company_name', v_name, 'message', sqlerrm);
    end;
  end loop;

  return v_results;
end $$;

revoke execute on function public.create_prospects_batch(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_prospects_batch(uuid, jsonb, text) to service_role;

commit;

-- Check: no default left, and the helper behaves.
select column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'prospects' and column_name = 'province';
select public.prospect_province_code(' ab ') as ab, public.prospect_province_code('') as blank, public.prospect_province_code('Alberta') as word;
