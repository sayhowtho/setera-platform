-- Step 42: per-client signing secrets for the Emily webhook.
-- (Written as 040 on the emily-webhook-signature branch; renumbered to 042
-- because 040 is 040_prospect_trade_options.sql on main and 041 is the
-- webhook idempotency ledger. Apply 041 before or after this, either order.)
--
-- /api/emily-webhook accepted any POST. ElevenLabs signs each delivery with
-- the webhook's HMAC secret, and every client has its own ElevenLabs
-- workspace, so every client has its own secret. They are stored in Supabase
-- Vault (encrypted at rest), one per workspace:
--   emily_webhook:<businesses.id>   a client's workspace
--   emily_webhook:setera            Setera's own (marketing-site agent, the
--                                   webhook's leads path: no business)
-- Secrets are added in the dashboard (Vault -> Add new secret), never through
-- the SQL editor or the repo, so they don't land in query history.
--
-- The webhook (lib/emily-signature.ts) reads them only through
-- emily_webhook_secret(), which only service_role may execute.
--
-- Enforcement is switched with one app_config row, no deploy:
--   'log'      (default, also when the row is missing) check + log, process all
--   'enforce'  reject anything not signed with the right secret
-- Nothing is inserted here; the row is added when switching to enforce.
--
-- Applied by hand: staging first, then production.

begin;

create or replace function public.emily_webhook_secret(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'emily_webhook:' || coalesce(p_business_id::text, 'setera')
  limit 1
$$;

revoke execute on function public.emily_webhook_secret(uuid) from public, anon, authenticated;
grant execute on function public.emily_webhook_secret(uuid) to service_role;

commit;

-- After applying, expect anon/authenticated false, service_role true:
--   select has_function_privilege('anon', 'public.emily_webhook_secret(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'public.emily_webhook_secret(uuid)', 'execute'),
--          has_function_privilege('service_role', 'public.emily_webhook_secret(uuid)', 'execute');
-- Which secrets exist (names only, never values):
--   select name, created_at, updated_at from vault.secrets where name like 'emily_webhook:%';
-- Switch to enforce / back to log:
--   insert into public.app_config (key, value) values ('emily_webhook_signature_mode', 'enforce')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--   update public.app_config set value = 'log', updated_at = now() where key = 'emily_webhook_signature_mode';
-- Rollback:
--   drop function public.emily_webhook_secret(uuid);
