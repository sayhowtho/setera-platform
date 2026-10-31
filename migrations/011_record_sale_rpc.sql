-- Step 11: make recordSale() atomic AND idempotent.
--
-- DO NOT RUN THIS AGAINST PRODUCTION YET. Test against staging first (same
-- policy as every prior migration in this repo). There's no CLI runner in
-- this repo; this file is applied by hand when ready.
--
-- WHY: lib/compensation.ts's recordSale() did two separate REST inserts
-- (sales, then commission_earnings) with no database transaction. The
-- comment on the old code only handled ONE of three ways that could fail
-- part-way through:
--   1. commission_earnings insert returns a Postgres error -> handled
--      (the old code deleted the already-inserted sales row).
--   2. The milestone-override lookup (2 SELECTs between the two inserts)
--      throws -> NOT handled, no cleanup code on that path at all.
--   3. The browser tab closes / navigates away / loses network between the
--      two awaited calls (this runs client-side, in High Table, not behind
--      an API route) -> NOT handled, nothing left running to clean up.
-- record_sale() below replaces both inserts with a single INSERT ... INSERT
-- inside one plpgsql function body, so failure #2 and #3 now roll back the
-- whole thing automatically, the same way migrations/009's
-- overflow_ingest_one() already does for Overflow.
--
-- SEPARATELY: recordSale() also had no idempotency protection — a
-- double-click, or a retry after a network timeout where the first call had
-- actually already succeeded server-side, could create two real, equally
-- legitimate-looking sales/commission_earnings rows crediting a rep twice
-- for one sale. Atomicity and idempotency are different problems (this
-- function makes ONE call safe; idempotency_key makes REPEATING that same
-- call safe) — the idempotency_key parameter below is the same
-- "first touch wins" pattern overflow_ingest_one() already uses for exactly
-- this class of problem. A blanket unique constraint on e.g.
-- (client_id, plan_slug) would be wrong here — a client can legitimately
-- have more than one real sale (an upgrade, a renewal) — so the caller
-- supplies a key that identifies ONE SUBMISSION ATTEMPT, not one client.
--
-- app/admin/page.tsx generates this key once when the Record Sale panel
-- opens and reuses it across any retry of that same attempt, only
-- generating a new one when the panel is reopened for a new sale.

alter table public.sales add column if not exists idempotency_key uuid unique;

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
  if get_my_role() not in ('admin', 'owner') then
    raise exception 'forbidden';
  end if;

  -- Idempotency check first, before any of the plan/rep-comp lookups below —
  -- if this exact attempt already succeeded, none of that computation is
  -- needed. Returns the EXISTING sale + commission_earning, tagged so the
  -- caller can tell a resubmit apart from a fresh insert if it wants to.
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

  -- Standard 15% applies during training and both closer stages; only the
  -- permanent 5% Setter election is different — mirrors
  -- lib/compensation.ts's getCommissionRate() exactly.
  v_rate := case when v_comp.comp_track = 'setter' then 0.05 else 0.15 end;

  -- Every-10th-sale override, one independent cycle per plan — mirrors
  -- lib/compensation.ts's isMilestoneOverrideSale() exactly, including that
  -- a permanent Setter is excluded outright.
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

-- Force every sale to go through the function above — otherwise a direct
-- .from('sales').insert(...) from an admin session would still be possible
-- (RLS/grants permitting) and would bypass both the atomicity and the
-- idempotency guarantees this migration exists to add. A confirmed grep of
-- this codebase found exactly one write path to either table
-- (lib/compensation.ts's recordSale(), being replaced by this function) —
-- every other reference is a read, or a DELETE in a test script's cleanup
-- helper using the service-role key, which bypasses RLS/grants regardless
-- and is unaffected by this revoke.
revoke insert on public.sales, public.commission_earnings from authenticated, anon;

grant execute on function
  public.record_sale(uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz)
  to authenticated;

-- VERIFY AFTER RUNNING (staging first, per the header above):
--   1. As an admin/owner test session, call:
--        select record_sale('<a real client id>', '<a rep with rep_compensation>', 'launch', gen_random_uuid());
--      twice with the SAME idempotency_key — first call creates a row,
--      second call returns "already_existed": true with no new row. Confirm
--      with: select count(*) from sales where idempotency_key = '<that key>';
--      — must be exactly 1.
--   2. As a non-admin session (or with get_my_role() forced to something
--      else), confirm the call raises 'forbidden'.
--   3. Confirm direct `insert into sales (...)` as an authenticated
--      (non-service-role) session now fails on privilege, not RLS silently
--      allowing it through.
