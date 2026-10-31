-- Step 25: Pull back can be limited to prospects that came from an allocation.
--
-- High Table → Pull back now defaults to "Only pull back ones I allocated", so
-- prospects a rep added themselves (or got via an approved lead request) stay
-- with them. "From an allocation" = the prospect's latest move in
-- prospect_assignments is an allocation to this rep (same rule pull back
-- already used for ordering and the stale-clock reset, migrations/023).
--
--   1. rep_untouched_prospects(rep) — a rep's untouched prospects (Not
--      Contacted, no logged activity) with allocated_at / pre-allocation
--      updated_at. Shared by pull back and the panel's counts.
--   2. pull_back_prospects(..., p_only_allocated) — new optional last
--      argument, default false, so callers that don't pass it (the code
--      deployed before this) behave exactly as before.
--
-- Applied by hand in the SQL editor — staging first, then production, and
-- before the code that passes p_only_allocated deploys.

begin;

create or replace function public.rep_untouched_prospects(p_rep_id uuid)
returns table (id uuid, created_at timestamptz, updated_at timestamptz, allocated_at timestamptz, pre_alloc_updated_at timestamptz)
language sql stable set search_path = public as $$
  select p.id, p.created_at, p.updated_at,
         case when lm.kind = 'allocate' and lm.to_rep_id = p_rep_id then lm.moved_at end,
         case when lm.kind = 'allocate' and lm.to_rep_id = p_rep_id then lm.prev_updated_at end
  from public.prospects p
  left join lateral (
    select pa.kind, pa.to_rep_id, pa.moved_at, pa.prev_updated_at from public.prospect_assignments pa
    where pa.prospect_id = p.id order by pa.moved_at desc limit 1
  ) lm on true
  where p.rep_id = p_rep_id and p.status = 'Not Contacted'
    and not exists (select 1 from public.prospect_activities a where a.prospect_id = p.id)
$$;

-- Replaces the 4-argument version from 023 (a 5th argument with a default
-- would otherwise create an ambiguous overload).
drop function if exists public.pull_back_prospects(uuid, uuid, uuid, int);

create function public.pull_back_prospects(
  p_admin_id uuid, p_reserve_id uuid, p_rep_id uuid, p_count int default null, p_only_allocated boolean default false
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
  from public.rep_untouched_prospects(p_rep_id) u
  where not p_only_allocated or u.allocated_at is not null;
  if v_available = 0 then
    raise exception '%', case when p_only_allocated then 'This rep has no untouched prospects from your allocations'
                              else 'This rep has no untouched prospects' end using errcode = 'P0001';
  end if;
  if p_count is not null and p_count > v_available then
    raise exception 'You asked for % but this rep only has % untouched%', p_count, v_available,
      case when p_only_allocated then ' from your allocations' else '' end using errcode = 'P0001';
  end if;

  -- Oldest allocation first; non-allocated ones (only when allowed) last,
  -- oldest created first.
  with picked as (
    select * from public.rep_untouched_prospects(p_rep_id) u
    where not p_only_allocated or u.allocated_at is not null
    order by u.allocated_at asc nulls last, u.created_at asc, u.id
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

revoke execute on function public.rep_untouched_prospects(uuid) from public, anon, authenticated;
revoke execute on function public.pull_back_prospects(uuid, uuid, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.rep_untouched_prospects(uuid) to service_role;
grant execute on function public.pull_back_prospects(uuid, uuid, uuid, int, boolean) to service_role;

commit;

-- Check: exactly one pull_back_prospects, with the new argument.
select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'pull_back_prospects';
