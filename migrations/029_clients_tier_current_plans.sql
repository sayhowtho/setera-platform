-- Step 29: let clients.tier hold the current plans (Alex, 2026-10-02).
--
-- clients_tier_check only allowed the legacy tiers, so Move to Signups
-- failed for every prospect: it copied the prospect's capitalised tier
-- ("Grow", "Starter", "Pro") or invented 'Starter' for a blank one. The app
-- now saves lowercase and leaves a blank tier blank (lib/client-tier.ts);
-- this widens the check to also accept launch and grow. starter already
-- exists. Every old value is kept, so no existing row can fail it.
--
-- Applied by hand in the SQL editor: staging first, then production, before
-- the code deploys.

begin;

alter table public.clients drop constraint if exists clients_tier_check;
alter table public.clients add constraint clients_tier_check
  check (tier is null or tier = any (array['starter', 'pro', 'regional', 'enterprise', 'national', 'launch', 'grow']));

commit;

-- Check: the new definition.
select conname, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid = 'public.clients'::regclass and conname = 'clients_tier_check';
