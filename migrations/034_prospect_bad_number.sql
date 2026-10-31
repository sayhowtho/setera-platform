-- Step 34: flag a prospect's number as bad.
--
-- Logging a Call with outcome "Wrong Number" (lib/callOutcomes.ts) sets
-- bad_number = true: the prospect is kept, but shows a "Bad #" badge in the
-- prospect lists and a banner on the detail page so nobody keeps dialing it.
-- Admins, reps and setters can clear it by hand, and the trigger below clears
-- it whenever the prospect's phone or contact_phone is added or changed (any
-- path: forms, Bodhi API).
--
-- Applied by hand in the SQL editor — staging first, then production. Must be
-- applied BEFORE the app code that writes bad_number is deployed, or logging
-- a Wrong Number call fails its prospect update.
--
-- The new outcomes themselves need no migration: prospect_activities.outcome
-- is free text with only the not-blank check from 026. Production has had
-- constraints created outside these files before (see 033), so run this first
-- and confirm the only outcome check is prospect_activities_outcome_required:
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.prospect_activities'::regclass and contype = 'c';

begin;

alter table public.prospects
  add column if not exists bad_number boolean not null default false;

-- A new phone or direct number (e.g. the owner's line from a Referred call)
-- means the old one being bad no longer applies. Skipped when the same
-- update sets bad_number itself.
create or replace function public.prospects_clear_bad_number()
returns trigger language plpgsql as $$
begin
  if (new.phone is distinct from old.phone or new.contact_phone is distinct from old.contact_phone)
     and new.bad_number is not distinct from old.bad_number then
    new.bad_number := false;
  end if;
  return new;
end $$;

drop trigger if exists prospects_clear_bad_number on public.prospects;
create trigger prospects_clear_bad_number before update of phone, contact_phone on public.prospects
  for each row execute function public.prospects_clear_bad_number();

commit;

-- Check: the column exists, and nothing is flagged yet.
select count(*) filter (where bad_number) as flagged, count(*) as total from public.prospects;
