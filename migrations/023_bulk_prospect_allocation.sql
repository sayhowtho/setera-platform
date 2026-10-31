-- Step 23: bulk prospect allocation (High Table → Prospects → Allocate).
--
-- The owner's prospects are the reserve. Allocate hands a chunk of them to
-- reps/setters in one transaction; Pull back returns a rep's untouched ones.
-- Applied by hand in the SQL editor — staging first, then production.
--
--   1. profiles.is_demo — demo accounts never appear as allocation targets.
--   2. prospect_assignments — one audit row per reassignment (who moved it,
--      from whom, to whom, when), grouped by batch_id. Kept out of
--      prospect_activities on purpose: a row there would count as "logged
--      activity", making the prospect look worked (and it isn't a touch).
--   3. allocate_prospects() — eligibility + chunked assignment, row-locked.
--   4. pull_back_prospects() — a rep's untouched prospects back to the reserve.
--
-- Stale clock: the Lead Requests stale check (find_business_matches in 018 and
-- /api/lead-requests) uses greatest(created_at, updated_at, last_contacted_at,
-- last activity). Allocating sets updated_at = now(), so a new allocation gets
-- the same 30-day protection an approved lead request does; the old
-- updated_at is snapshotted and Pull back puts it back, so a pulled-back
-- prospect isn't left protected.
--
-- service_role-only, like every function in 018/020/021.

begin;

-- ── 1. Demo accounts ─────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_demo boolean not null default false;
update public.profiles set is_demo = true
  where lower(trim(full_name)) in ('demo rep', 'alex setter');

-- ── 2. Audit trail ───────────────────────────────────────────────────────
-- prospect_id cascades (deleting a prospect drops its assignment history,
-- like its activities would be useless without it); the people columns
-- restrict, matching migration 010's "attribution is permanent" rule.
create table if not exists public.prospect_assignments (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null,
  kind             text not null check (kind in ('allocate', 'pull_back')),
  prospect_id      uuid not null references public.prospects(id) on delete cascade,
  from_rep_id      uuid not null references public.profiles(id) on delete restrict,
  to_rep_id        uuid not null references public.profiles(id) on delete restrict,
  moved_by         uuid not null references public.profiles(id) on delete restrict,
  moved_at         timestamptz not null default now(),
  prev_updated_at  timestamptz  -- prospect's updated_at before this move
);
create index if not exists prospect_assignments_batch_idx on public.prospect_assignments (batch_id);
create index if not exists prospect_assignments_prospect_idx on public.prospect_assignments (prospect_id, moved_at desc);

alter table public.prospect_assignments enable row level security;
revoke all on public.prospect_assignments from anon, authenticated;

-- ── 3. Allocate ──────────────────────────────────────────────────────────
-- p_prospect_ids: the selection, in table order. p_allocations:
-- [{"rep_id": uuid, "count": int}, ...] — chunked in that order (the first
-- N eligible go to the first rep, and so on). Eligible = owned by p_reserve_id,
-- not DNC, no logged activity, status 'Not Contacted'. Everything else is
-- skipped and counted by its first failing reason, in that order.
-- p_dry_run: return the eligibility breakdown and change nothing (the panel
-- calls this on open so the reserve math uses eligible rows, not selected).
-- The route checks rep ban status (auth schema); role + demo are checked here.
create or replace function public.allocate_prospects(
  p_admin_id uuid, p_reserve_id uuid, p_prospect_ids uuid[], p_allocations jsonb, p_dry_run boolean default false
)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_eligible uuid[];
  v_skipped jsonb;
  v_requested int := 0;
  v_offset int := 0;
  v_alloc record;
  v_assigned jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if coalesce(array_length(p_prospect_ids, 1), 0) = 0 then
    raise exception 'No prospects selected' using errcode = 'P0001';
  end if;

  -- Lock the selection first so eligibility can't change under us.
  perform 1 from public.prospects where id = any(p_prospect_ids) order by id for update;

  with sel as (
    select distinct on (s.id) s.id, s.ord
    from unnest(p_prospect_ids) with ordinality as s(id, ord)
    order by s.id, s.ord
  ),
  classified as (
    select sel.id, sel.ord,
      case
        when p.id is null then 'not_found'
        when p.rep_id is distinct from p_reserve_id then 'not_reserve'
        when coalesce(p.do_not_contact, false) then 'dnc'
        when exists (select 1 from public.prospect_activities a where a.prospect_id = p.id) then 'has_activity'
        when p.status is distinct from 'Not Contacted' then 'not_new'
        else null
      end as reason
    from sel left join public.prospects p on p.id = sel.id
  )
  select
    coalesce(array_agg(id order by ord) filter (where reason is null), '{}'),
    jsonb_build_object(
      'not_reserve',  count(*) filter (where reason = 'not_reserve'),
      'dnc',          count(*) filter (where reason = 'dnc'),
      'has_activity', count(*) filter (where reason = 'has_activity'),
      'not_new',      count(*) filter (where reason = 'not_new'),
      'not_found',    count(*) filter (where reason = 'not_found')
    )
  into v_eligible, v_skipped
  from classified;

  if p_dry_run then
    return jsonb_build_object('selected', cardinality(p_prospect_ids), 'eligible', cardinality(v_eligible), 'skipped', v_skipped);
  end if;

  -- Validate the allocation list.
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'No allocations given' using errcode = 'P0001';
  end if;
  for v_alloc in
    select (e->>'rep_id')::uuid as rep_id, (e->>'count')::int as cnt
    from jsonb_array_elements(p_allocations) e
  loop
    if v_alloc.cnt is null or v_alloc.cnt < 1 then
      raise exception 'Each allocation needs a count of at least 1' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles pr
                   where pr.id = v_alloc.rep_id and pr.role in ('rep', 'vp_sales', 'setter') and not pr.is_demo) then
      raise exception 'Not an allocatable rep: %', v_alloc.rep_id using errcode = 'P0001';
    end if;
    v_requested := v_requested + v_alloc.cnt;
  end loop;
  if (select count(distinct e->>'rep_id') from jsonb_array_elements(p_allocations) e) <> jsonb_array_length(p_allocations) then
    raise exception 'A rep appears more than once' using errcode = 'P0001';
  end if;
  if v_requested > cardinality(v_eligible) then
    raise exception 'You asked for % but only % of the selected prospects can be allocated', v_requested, cardinality(v_eligible)
      using errcode = 'P0001';
  end if;

  -- Chunk in order.
  for v_alloc in
    select (e->>'rep_id')::uuid as rep_id, (e->>'count')::int as cnt
    from jsonb_array_elements(p_allocations) with ordinality as x(e, ord)
    order by x.ord
  loop
    with chunk as (
      select v_eligible[i] as id from generate_series(v_offset + 1, v_offset + v_alloc.cnt) as i
    ),
    audit as (
      insert into public.prospect_assignments (batch_id, kind, prospect_id, from_rep_id, to_rep_id, moved_by, moved_at, prev_updated_at)
      select v_batch, 'allocate', p.id, p.rep_id, v_alloc.rep_id, p_admin_id, v_now, p.updated_at
      from public.prospects p join chunk on chunk.id = p.id
      returning prospect_id
    )
    update public.prospects p set rep_id = v_alloc.rep_id, updated_at = v_now
      from audit where p.id = audit.prospect_id;

    v_assigned := v_assigned || jsonb_build_object('rep_id', v_alloc.rep_id, 'count', v_alloc.cnt);
    v_offset := v_offset + v_alloc.cnt;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch,
    'selected', cardinality(p_prospect_ids),
    'eligible', cardinality(v_eligible),
    'assigned', v_assigned,
    'reserve_kept', cardinality(v_eligible) - v_requested,
    'skipped', v_skipped
  );
end $$;

-- ── 4. Pull back ─────────────────────────────────────────────────────────
-- Moves up to p_count (null = all) of a rep's UNTOUCHED prospects back to the
-- reserve. Untouched = status 'Not Contacted' and no logged activity; nothing
-- a rep has touched is ever taken. Order: oldest allocation to this rep
-- first; prospects the rep got another way (added themselves, approved lead
-- request) have no allocation and go last, oldest created first.
-- Stale clock: an allocated prospect gets back the updated_at it had before
-- that allocation, so it loses the allocation's protection; others keep theirs.
create or replace function public.pull_back_prospects(
  p_admin_id uuid, p_reserve_id uuid, p_rep_id uuid, p_count int default null
)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_available int;
  v_moved int;
begin
  if p_rep_id = p_reserve_id then
    raise exception 'That is the reserve account' using errcode = 'P0001';
  end if;
  if p_count is not null and p_count < 1 then
    raise exception 'Enter a number of at least 1' using errcode = 'P0001';
  end if;

  perform 1 from public.prospects where rep_id = p_rep_id order by id for update;

  select count(*) into v_available
  from public.prospects p
  where p.rep_id = p_rep_id and p.status = 'Not Contacted'
    and not exists (select 1 from public.prospect_activities a where a.prospect_id = p.id);
  if v_available = 0 then
    raise exception 'This rep has no untouched prospects' using errcode = 'P0001';
  end if;
  if p_count is not null and p_count > v_available then
    raise exception 'You asked for % but this rep only has % untouched', p_count, v_available using errcode = 'P0001';
  end if;

  -- allocated_at: set only when the prospect's latest move was an allocation
  -- to this rep (so an older allocation followed by a pull back and a lead
  -- request doesn't count).
  with untouched as (
    select p.id, p.created_at, p.updated_at,
           case when lm.kind = 'allocate' and lm.to_rep_id = p_rep_id then lm.moved_at end as allocated_at,
           case when lm.kind = 'allocate' and lm.to_rep_id = p_rep_id then lm.prev_updated_at end as pre_alloc_updated_at
    from public.prospects p
    left join lateral (
      select pa.kind, pa.to_rep_id, pa.moved_at, pa.prev_updated_at from public.prospect_assignments pa
      where pa.prospect_id = p.id order by pa.moved_at desc limit 1
    ) lm on true
    where p.rep_id = p_rep_id and p.status = 'Not Contacted'
      and not exists (select 1 from public.prospect_activities a where a.prospect_id = p.id)
  ),
  picked as (
    select * from untouched
    order by allocated_at asc nulls last, created_at asc, id
    limit coalesce(p_count, v_available)
  ),
  audit as (
    insert into public.prospect_assignments (batch_id, kind, prospect_id, from_rep_id, to_rep_id, moved_by, moved_at, prev_updated_at)
    select v_batch, 'pull_back', id, p_rep_id, p_reserve_id, p_admin_id, v_now, updated_at from picked
    returning prospect_id
  )
  update public.prospects p
    set rep_id = p_reserve_id,
        updated_at = case when picked.allocated_at is not null then coalesce(picked.pre_alloc_updated_at, p.created_at) else p.updated_at end
  from picked where p.id = picked.id;
  get diagnostics v_moved = row_count;

  return jsonb_build_object('batch_id', v_batch, 'pulled_back', v_moved, 'remaining_untouched', v_available - v_moved);
end $$;

-- ── 5. Grants: service_role only ─────────────────────────────────────────
revoke execute on function public.allocate_prospects(uuid, uuid, uuid[], jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.pull_back_prospects(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.allocate_prospects(uuid, uuid, uuid[], jsonb, boolean) to service_role;
grant execute on function public.pull_back_prospects(uuid, uuid, uuid, int) to service_role;
grant select, insert, update on public.prospect_assignments to service_role;

commit;

-- Check: the demo flag landed on exactly the expected accounts.
select id, full_name, email, role from public.profiles where is_demo;
