-- Step 33: allow the "Term Ended" cancellation category (fixed-term client
-- who didn't renew), added to High Table + the /rep form in 553e320.
--
-- Applied by hand in the SQL editor — staging first, then production.
--
-- Production already had cancellations_category_check (created outside these
-- migration files), which rejected 'term_ended'. Run the SELECT first and
-- compare: the new list below is the 7 categories the app has always offered
-- plus term_ended. If the current definition allows anything else, add it to
-- the list before running the rest.
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'cancellations_category_check';

begin;

alter table public.cancellations drop constraint if exists cancellations_category_check;
alter table public.cancellations add constraint cancellations_category_check
  check (category is null or category in (
    'price', 'no_show', 'competitor', 'seasonal', 'dissatisfied',
    'going_out_of_business', 'term_ended', 'other'
  ));

commit;
