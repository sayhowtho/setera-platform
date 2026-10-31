-- Step 21: read + update functions for Bodhi's API (/api/bodhi/prospects).
--
-- Requires 018 (normalizers, phone_normalized columns) and 020
-- (create_prospects_batch, used by POST). Applied by hand in the SQL editor —
-- staging first, then production.
--
-- Both functions are scoped to ONE owner id (the owner account, resolved by
-- the API route): Bodhi can never see or touch a setter's or rep's prospect.
-- Table names are fixed here; nothing takes a table name as input.
-- service_role-only, like every function in 018/020.

begin;

-- Status -> pipeline stage label, identical to getColumnForStatus() in the
-- portal pages (Closed Lost / Future Opportunity / unknown fall back to New).
create or replace function public.pipeline_stage_for_status(p_status text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_status in ('Interested', 'Demo Scheduled') then 'Meeting'
    when p_status = 'Proposal Sent' then 'Proposal'
    when p_status = 'Closed Won' then 'Won'
    else 'New'
  end
$$;

-- GET: fixed column list only; notes cut at 1,000 chars. q = a phone
-- (exact match on either normalized number) or a normalized word-prefix of
-- the name ("mad reno" finds "M.A.D. Renovations"). limit 1..100, offset
-- 0..10,000, clamped here as well as in the route.
create or replace function public.bodhi_list_prospects(
  p_owner uuid, p_source text, p_tier text, p_status text, p_q text, p_limit int, p_offset int
)
returns table (
  id uuid, company_name text, contact_name text, phone text, email text, city text,
  tier text, status text, source text, notes text, created_at timestamptz
)
language sql stable set search_path = public as $$
  with q as (
    select public.normalize_phone_e164(p_q) as ph, public.normalize_business_name(p_q) as n
  )
  select p.id, p.company_name, p.contact_name, p.phone, p.email, p.city, p.tier, p.status, p.source,
         case when length(p.notes) > 1000 then left(p.notes, 1000) || '…' else p.notes end,
         p.created_at
  from public.prospects p, q
  where p_owner is not null
    and p.rep_id = p_owner
    and (p_source is null or p.source = p_source)
    and (p_tier is null or p.tier = p_tier)
    and (p_status is null or p.status = p_status)
    and (p_q is null
         or (q.ph is not null and (p.phone_normalized = q.ph or p.contact_phone_normalized = q.ph))
         or (q.ph is null and q.n is not null
             and (' ' || coalesce(public.normalize_business_name(p.company_name), '')) like ('% ' || q.n || '%')))
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000)
$$;

-- PATCH: notes (appended as a timestamped line), status, tier — nothing
-- else, and only on an owner-owned prospect. A prospect at Closed Won can't
-- be changed at all, and nothing can be moved TO Closed Won (it drives "Won
-- This Month" and lead-request rules). A stage-history row is written only
-- when the pipeline STAGE changes, exactly like the portals: close the open
-- row (left_at, days_in_stage), open a new one.
create or replace function public.bodhi_update_prospect(
  p_owner uuid, p_id uuid, p_note text, p_status text, p_tier text
)
returns jsonb language plpgsql set search_path = public as $$
declare
  p          public.prospects%rowtype;
  v_old      text;
  v_new      text;
  v_now      timestamptz := now();
  v_allowed  text[] := array['Not Contacted', 'Attempted', 'Contacted', 'Follow Up Required', 'Interested',
                             'Demo Scheduled', 'Proposal Sent', 'Closed Lost', 'Future Opportunity'];
begin
  select * into p from public.prospects where id = p_id and rep_id = p_owner and p_owner is not null for update;
  if not found then
    raise exception 'Prospect not found' using errcode = 'P0002';  -- same answer for "not yours"
  end if;
  if p.status = 'Closed Won' then
    raise exception 'Closed Won prospects can''t be changed' using errcode = 'P0001';
  end if;
  if p_status is not null and not (p_status = any (v_allowed)) then
    raise exception 'Status not allowed: %', p_status using errcode = '22023';
  end if;
  if p_tier is not null and p_tier not in ('Launch', 'Grow', 'Starter') then
    raise exception 'Tier not allowed: %', p_tier using errcode = '22023';
  end if;
  if p_note is null and p_status is null and p_tier is null then
    raise exception 'Nothing to update' using errcode = '22023';
  end if;

  update public.prospects set
    status = coalesce(p_status, status),
    tier = coalesce(p_tier, tier),
    notes = case when p_note is null then notes
                 else coalesce(nullif(notes, '') || E'\n', '')
                      || '[' || to_char(v_now at time zone 'America/Regina', 'YYYY-MM-DD HH24:MI') || ' Bodhi] ' || p_note
            end,
    updated_at = v_now
  where id = p.id;

  v_old := public.pipeline_stage_for_status(p.status);
  v_new := public.pipeline_stage_for_status(coalesce(p_status, p.status));
  if v_new <> v_old then
    update public.prospect_stage_history
      set left_at = v_now,
          days_in_stage = floor(extract(epoch from (v_now - coalesce(p.updated_at, p.created_at))) / 86400)::int
      where prospect_id = p.id and left_at is null;
    insert into public.prospect_stage_history (prospect_id, rep_id, stage, entered_at)
    values (p.id, p.rep_id, v_new, v_now);
  end if;

  return (
    select to_jsonb(x) from (
      select p2.id, p2.company_name, p2.contact_name, p2.phone, p2.email, p2.city, p2.tier, p2.status, p2.source,
             case when length(p2.notes) > 1000 then left(p2.notes, 1000) || '…' else p2.notes end as notes,
             p2.created_at
      from public.prospects p2 where p2.id = p.id
    ) x
  );
end $$;

revoke execute on function public.bodhi_list_prospects(uuid, text, text, text, text, int, int) from public, anon, authenticated;
revoke execute on function public.bodhi_update_prospect(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bodhi_list_prospects(uuid, text, text, text, text, int, int) to service_role;
grant execute on function public.bodhi_update_prospect(uuid, uuid, text, text, text) to service_role;

commit;
