-- Step 40: Trade dropdown for The High Table → Prospects.
--
-- prospects.trade is free text (Add Prospect, Bodhi batches, website demo
-- requests), so prod holds spellings the app's list doesn't (Renovation,
-- Renovations, General contracting, ...). The Trade filter matches the
-- stored value exactly, and its options come from the data, not the list:
--
--   prospect_trade_options(): one row per distinct non-blank trade, with
--   n = matches under Search + Status + Rep + Province + City (the other
--   table filters). The page hides n = 0 unless selected.
--
-- Read-only, SECURITY INVOKER (sees exactly the rows the caller's RLS
-- allows). Leaves prospect_filter_options() and all data untouched. Needs
-- only 035's search_text / phone_digits / province_key / city_key columns.
--
-- Applied by hand in the SQL editor: staging first, then production. Must be
-- applied BEFORE the app code that calls it is deployed, or the Trade
-- dropdown is empty (the rest of the page still works).

begin;

create or replace function public.prospect_trade_options(
  p_text_like text default null, p_phone_like text default null,
  p_status text default null, p_rep uuid default null,
  p_province_key text default null, p_city_key text default null)
returns table (key text, n bigint)
language sql stable security invoker set search_path = public as $$
  with all_t as (select distinct p.trade as k from public.prospects p where btrim(coalesce(p.trade, '')) <> ''),
  base_n as (
    select p.trade as k, count(*) as n from public.prospects p
    where btrim(coalesce(p.trade, '')) <> ''
      and (p_text_like is null or p.search_text like p_text_like or (p_phone_like is not null and p.phone_digits like p_phone_like))
      and (p_status is null or p.status = p_status)
      and (p_rep is null or p.rep_id = p_rep)
      and (p_province_key is null or p.province_key = p_province_key)
      and (p_city_key is null or p.city_key = p_city_key)
    group by 1
  )
  select a.k, coalesce(b.n, 0) from all_t a left join base_n b on b.k = a.k
$$;

revoke execute on function public.prospect_trade_options(text, text, text, uuid, text, text) from public, anon;
grant execute on function public.prospect_trade_options(text, text, text, uuid, text, text) to authenticated;

commit;

-- Rollback:
--   drop function if exists public.prospect_trade_options(text, text, text, uuid, text, text);
