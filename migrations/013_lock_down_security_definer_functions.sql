-- Step 13: lock down EXECUTE on 5 security-definer functions Supabase's
-- Security Advisor flagged as having EXECUTE open to PUBLIC — and fix an
-- active vulnerability that flag led to finding in one of them.
--
-- DO NOT RUN THIS AGAINST PRODUCTION YET. Test against staging first (same
-- policy as every prior migration in this repo). There's no CLI runner in
-- this repo; this file is applied by hand when ready.
--
-- SEVERITY: record_sale() is worse than "excess permission" — it's an
-- active bypass, confirmed empirically (not assumed) against production,
-- 2026-09-22, using the public anon key with NO session at all and
-- deliberately-invalid downstream parameters as a safety net so the probe
-- itself couldn't write real data:
--   error: Unknown plan "this-plan-does-not-exist-safety-probe"
-- That's the SECOND validation step in the function, not "forbidden" — the
-- call got past the get_my_role() role check entirely. Root cause: PL/pgSQL
-- `IF <condition> THEN` treats a NULL condition as FALSE (doesn't raise),
-- and get_my_role() returns NULL for anyone with no valid session, or for a
-- session whose profiles row was deleted after their JWT was issued (still
-- valid until it expires — the same class of gap app/api/admin/remove-user
-- was hardened against earlier tonight, from a different angle). This is
-- the OPPOSITE of RLS USING/WITH CHECK semantics, where a NULL result fails
-- CLOSED (row hidden, action denied) — migrations/012's RLS policies use
-- this same get_my_role() = any(...) idiom safely, because RLS's NULL
-- handling protects them; a plain PL/pgSQL IF check has no such protection
-- and must handle NULL explicitly. Right now, on production, anyone holding
-- only the public anon key — inherently public, embedded in every client
-- bundle — could call record_sale with real parameters and successfully
-- create fraudulent sales/commission_earnings rows, fully bypassing login.
--
-- Every other security-definer function in this schema was checked for the
-- same pattern (get_my_role, overflow_ingest_import, overflow_ingest_one,
-- overflow_rate_limit_hit, overflow_set_status, record_sale) — the four
-- Overflow functions from migrations/009 all take an explicit actor-id
-- parameter and either check IS NULL explicitly or use NOT EXISTS (never
-- NULL, always a definite true/false) — record_sale is the only one with
-- this bug.
--
-- The other 4 flagged functions (guard_client_booked_by_setter_update,
-- guard_sale_booked_by_setter_update, handle_new_user,
-- set_client_booked_by_setter) are NOT currently exploitable despite the
-- same broad grant — confirmed empirically too: all four are RETURNS
-- TRIGGER functions, and PostgREST refuses to expose a trigger-type
-- function as a callable RPC endpoint at all ("Could not find the
-- function... in the schema cache" for all four, tested live). Still real
-- excess permission worth closing (least privilege; it would matter to
-- anyone with raw Postgres credentials rather than just the REST API) —
-- just not an active exploit path today the way record_sale was.

begin;

-- ── The 4 trigger functions: EXECUTE serves no purpose for any role here.
-- Postgres fires a trigger regardless of the DML-issuing role's own EXECUTE
-- privilege on the trigger function — revoking this cannot break the actual
-- booked_by_setter_id freeze/backfill or new-user-signup profile creation
-- behavior, it only removes the ability to invoke these directly, which
-- nothing legitimate ever did (PostgREST already refused to route to them).
revoke execute on function public.guard_client_booked_by_setter_update() from public, anon, authenticated;
revoke execute on function public.guard_sale_booked_by_setter_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_client_booked_by_setter() from public, anon, authenticated;

-- ── record_sale(): fix the fail-open bug, then lock down the grant.
-- Identical to migrations/011's version except the role check now fails
-- closed on NULL via coalesce(), instead of the plain
-- `get_my_role() not in (...)` that a NULL role silently satisfied.
create or replace function public.record_sale(
  p_client_id uuid,
  p_rep_id uuid,
  p_plan_slug text,
  p_idempotency_key uuid,
  p_prospect_id uuid default null,
  p_setter_id uuid default null,
  p_closer_id uuid default null,
  p_sold_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan record;
  v_comp record;
  v_training_count int;
  v_rate numeric;
  v_is_override boolean;
  v_total_prior int;
  v_same_plan_count int;
  v_amount numeric;
  v_sale record;
  v_earning record;
begin
  if coalesce(get_my_role(), '') not in ('admin', 'owner') then
    raise exception 'forbidden';
  end if;

  select * into v_sale from sales where idempotency_key = p_idempotency_key;
  if found then
    select * into v_earning from commission_earnings where sale_id = v_sale.id;
    return jsonb_build_object('sale', to_jsonb(v_sale), 'commission_earning', to_jsonb(v_earning), 'already_existed', true);
  end if;

  select * into v_plan from plans where slug = p_plan_slug;
  if not found then raise exception 'Unknown plan "%"', p_plan_slug; end if;

  select * into v_comp from rep_compensation where rep_id = p_rep_id;
  if not found then raise exception 'No rep_compensation record for rep % — an admin must set up their compensation track before recording sales for them.', p_rep_id; end if;

  select coalesce((select value::int from app_config where key = 'setter_training_client_count'), 6) into v_training_count;

  v_rate := case when v_comp.comp_track = 'setter' then 0.05 else 0.15 end;

  if v_comp.comp_track = 'setter' then
    v_is_override := false;
  else
    select count(*) into v_total_prior from commission_earnings where rep_id = p_rep_id;
    if v_total_prior < v_training_count then
      v_is_override := false;
    else
      select count(*) into v_same_plan_count
        from commission_earnings ce
        join sales s on s.id = ce.sale_id
        where ce.rep_id = p_rep_id and s.plan_slug = p_plan_slug;
      v_is_override := (v_same_plan_count + 1) % 10 = 0;
    end if;
  end if;

  v_amount := case when v_is_override then v_plan.monthly_price else round(v_plan.monthly_price * v_rate, 2) end;

  insert into sales (client_id, prospect_id, setter_id, closer_id, plan_slug, plan_price, currency, sold_at, idempotency_key)
    values (p_client_id, p_prospect_id, p_setter_id, p_closer_id, v_plan.slug, v_plan.monthly_price, v_plan.currency, p_sold_at, p_idempotency_key)
    returning * into v_sale;

  insert into commission_earnings (sale_id, rep_id, comp_track_snapshot, commission_rate, is_milestone_override, commission_amount, currency)
    values (v_sale.id, p_rep_id, v_comp.comp_track, v_rate, v_is_override, v_amount, v_plan.currency)
    returning * into v_earning;

  return jsonb_build_object('sale', to_jsonb(v_sale), 'commission_earning', to_jsonb(v_earning), 'already_existed', false);
end;
$$;

revoke execute on function
  public.record_sale(uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz)
  from public, anon;
-- authenticated keeps EXECUTE (its real, legitimate caller — app/admin/page.tsx,
-- gated further by the coalesce() check above); service_role always has it
-- regardless of grants.

commit;

-- VERIFY AFTER RUNNING (staging first, per the header above):
--   1. select routine_name, grantee, privilege_type from information_schema.role_routine_grants
--        where routine_schema='public' and routine_name in (
--          'guard_client_booked_by_setter_update','guard_sale_booked_by_setter_update',
--          'handle_new_user','set_client_booked_by_setter','record_sale')
--        order by routine_name, grantee;
--      -- PUBLIC/anon should be gone from all 5; authenticated gone from the
--      -- 4 trigger functions but still present for record_sale.
--   2. Repeat the exact unauthenticated probe from this file's header (anon
--      key, no session, fake plan_slug) against record_sale — must now
--      return "forbidden" as its very first error, not "Unknown plan".
--   3. Confirm a real admin/owner session can still successfully call
--      record_sale (the coalesce() rewrite must not change behavior for a
--      real admin/owner role — only for a NULL one).
--   4. Confirm the booked_by_setter_id trigger behavior (migrations/009)
--      and new-user signup (handle_new_user) still work normally after the
--      EXECUTE revoke on those 4 — they must, since triggers don't depend
--      on the firing role's own EXECUTE privilege, but worth confirming
--      live rather than assuming.
