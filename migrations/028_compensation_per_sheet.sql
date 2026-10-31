-- Step 28: bring the compensation engine in line with the Sales Compensation
-- Structure (Alex, 2026-10-01). Items #1 #2 #4 #7 #8 #10 #11 #14 of the
-- 2026-10-01 discrepancy review. Confirmed as-is by Alex (2026-10-01), not
-- changed here: #3 milestones stack ($190k total), #13 every-10th keeps a
-- separate count per plan, #16 permanent Setters get 5% and no bonuses, #17
-- one credited person per sale.
--
--   1. credited_clients(rep) — one row per client credited to a person:
--      their FIRST credited sale's plan/price/date, how many sales, and
--      whether the client is cancelled (clients.status = 'Cancelled'). The
--      cancelled flag is for display only: a client counts once they've paid
--      their first month (= has a credited sale) and keeps counting for good
--      — a later cancellation never removes credit (Alex, 2026-10-01).
--      Upgrades and repeat sales never count again. Security definer because
--      a setter can't read clients a closer owns; it only returns the
--      caller's own rows (or anyone's for admin/owner).
--   2. bonus_awards: the monthly sprint can now pay once per PERIOD (was once
--      ever); milestones stay once per person. New due_at column (sprint:
--      period close + 7 days).
--   3. record_sale(): training gate = distinct credited clients (was
--      commission records), cancelled included; every-10th counts distinct
--      credited clients (cancelled included) and only a
--      client's first sale can be the 10th. Separate count per plan (#13,
--      confirmed). Everything else is unchanged from migrations/011.
--   4. my_clients_first_plan() — the first recorded sale's plan for each
--      client the caller owns (clients.rep_id). /rep needs it for
--      "Commission (15% of first payment)": sales RLS only shows a rep the
--      sales credited to them, so a setter-credited client's plan was
--      invisible to the closing rep. Read-only, own clients only.
--
-- Applied by hand in the SQL editor — staging first, then production, before
-- the code that reads credited_clients deploys.

begin;

-- ── 1. credited_clients ──────────────────────────────────────────────────
create or replace function public.credited_clients(p_rep_id uuid)
returns table (client_id uuid, plan_slug text, plan_price numeric, first_sold_at timestamptz, sales_count int, cancelled boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select s.client_id, s.plan_slug, s.plan_price, s.sold_at, s.created_at
    from public.commission_earnings ce join public.sales s on s.id = ce.sale_id
    where ce.rep_id = p_rep_id
      and (p_rep_id = auth.uid() or public.get_my_role() in ('admin', 'owner') or auth.role() = 'service_role')
  ),
  firsts as (
    select distinct on (client_id) client_id, plan_slug, plan_price, sold_at
    from mine order by client_id, sold_at, created_at
  )
  select f.client_id, f.plan_slug, f.plan_price, f.sold_at,
         (select count(*)::int from mine m where m.client_id = f.client_id),
         coalesce(c.status = 'Cancelled', false)
  from firsts f left join public.clients c on c.id = f.client_id
  order by f.sold_at
$$;
revoke execute on function public.credited_clients(uuid) from public, anon;
grant execute on function public.credited_clients(uuid) to authenticated, service_role;

-- ── 2. bonus_awards: sprint per period, due date ─────────────────────────
alter table public.bonus_awards drop constraint if exists bonus_awards_rep_id_bonus_type_key;
create unique index if not exists bonus_awards_one_milestone
  on public.bonus_awards (rep_id, bonus_type) where bonus_type <> 'sprint_30_day';
create unique index if not exists bonus_awards_one_sprint_per_period
  on public.bonus_awards (rep_id, bonus_type, qualifying_window_start) where bonus_type = 'sprint_30_day';
alter table public.bonus_awards add column if not exists due_at timestamptz;

-- ── 3. record_sale ───────────────────────────────────────────────────────
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
  v_prior_clients int;
  v_same_plan_clients int;
  v_first_for_client boolean;
  v_amount numeric;
  v_sale record;
  v_earning record;
begin
  if get_my_role() not in ('admin', 'owner') then
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

  -- Distinct clients already credited to this person, excluding the client of
  -- this sale. Cancelled clients still count (credit is permanent once the
  -- first month is paid). Upgrades / repeat sales don't count again.
  select count(*) into v_prior_clients
    from public.credited_clients(p_rep_id) cc
    where cc.client_id <> p_client_id;
  v_first_for_client := not exists (
    select 1 from commission_earnings ce join sales s on s.id = ce.sale_id
    where ce.rep_id = p_rep_id and s.client_id = p_client_id);

  -- Every-10th override, a separate count per plan (#13, confirmed): only a
  -- client's first credited sale can be the 10th; counted on distinct
  -- credited clients (cancelled included) whose first plan was this plan.
  -- Permanent Setter (5%, no bonuses) is excluded by design (#16, confirmed).
  if v_comp.comp_track = 'setter' or not v_first_for_client or v_prior_clients < v_training_count then
    v_is_override := false;
  else
    select count(*) into v_same_plan_clients
      from public.credited_clients(p_rep_id) cc
      where cc.client_id <> p_client_id and cc.plan_slug = p_plan_slug;
    v_is_override := (v_same_plan_clients + 1) % 10 = 0;
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
revoke execute on function public.record_sale(uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz) from public, anon;
grant execute on function public.record_sale(uuid,uuid,text,uuid,uuid,uuid,uuid,timestamptz) to authenticated;

-- ── 4. my_clients_first_plan ─────────────────────────────────────────────
create or replace function public.my_clients_first_plan()
returns table (client_id uuid, plan_slug text)
language sql stable security definer set search_path = public as $$
  select distinct on (s.client_id) s.client_id, s.plan_slug
  from public.sales s join public.clients c on c.id = s.client_id
  where c.rep_id = auth.uid()
  order by s.client_id, s.sold_at, s.created_at
$$;
revoke execute on function public.my_clients_first_plan() from public, anon;
grant execute on function public.my_clients_first_plan() to authenticated;

commit;

-- Check: constraint swapped, column added, functions present.
select indexname as name from pg_indexes where tablename = 'bonus_awards' and indexname like 'bonus_awards_one_%'
union all
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('credited_clients', 'my_clients_first_plan', 'record_sale');
