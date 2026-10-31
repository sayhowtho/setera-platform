-- Step 41: idempotency for /api/emily-webhook.
--
-- ElevenLabs retries a post_call_transcription delivery when it doesn't get a
-- 2xx in time. Nothing deduplicated those retries, so one call could become
-- two `calls` rows (or two `leads` rows) and two paid AI classifications.
--
-- webhook_events is a ledger keyed by (source, event_id); for Emily the event
-- id is ElevenLabs' conversation_id. The webhook claims the id before writing
-- anything (lib/webhook-idempotency.ts):
--   claim_webhook_event()    true  = process it
--                            false = already done, or another delivery of the
--                                    same call is being processed right now
--   complete_webhook_event() marks it done (with a short outcome label)
--   release_webhook_event()  drops an unfinished claim after a failure, so
--                            ElevenLabs' retry is processed instead of ignored
-- A claim that was never completed or released (e.g. the function timed out
-- mid-request) can be re-claimed once it is older than p_stale (10 minutes).
--
-- Server-only: RLS on with no policies, and the functions are executable by
-- service_role only. No existing table or row is touched.
--
-- Numbering: 037-039 are taken by unmerged branches and 040 by
-- 040_prospect_trade_options.sql on main.
--
-- Apply by hand: staging first, then production. The webhook code tolerates
-- this migration being absent (it logs and processes without deduplication),
-- so code and migration can ship in either order.

begin;

create table if not exists public.webhook_events (
  source           text        not null,
  event_id         text        not null check (length(event_id) between 1 and 200),
  first_received_at timestamptz not null default now(),
  last_attempt_at  timestamptz not null default now(),
  attempts         integer     not null default 1,
  completed_at     timestamptz,
  outcome          text,
  primary key (source, event_id)
);

alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from public, anon, authenticated;

create or replace function public.claim_webhook_event(p_source text, p_event_id text, p_stale interval default interval '10 minutes')
returns boolean language plpgsql set search_path = public as $$
declare
  v_claimed boolean;
begin
  insert into public.webhook_events (source, event_id)
  values (p_source, p_event_id)
  on conflict (source, event_id) do update
    set attempts = webhook_events.attempts + 1, last_attempt_at = now()
    where webhook_events.completed_at is null
      and webhook_events.last_attempt_at < now() - p_stale
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end $$;

create or replace function public.complete_webhook_event(p_source text, p_event_id text, p_outcome text default null)
returns void language sql set search_path = public as $$
  update public.webhook_events
  set completed_at = now(), outcome = left(p_outcome, 100)
  where source = p_source and event_id = p_event_id;
$$;

create or replace function public.release_webhook_event(p_source text, p_event_id text)
returns void language sql set search_path = public as $$
  delete from public.webhook_events
  where source = p_source and event_id = p_event_id and completed_at is null;
$$;

revoke execute on function public.claim_webhook_event(text, text, interval) from public, anon, authenticated;
revoke execute on function public.complete_webhook_event(text, text, text) from public, anon, authenticated;
revoke execute on function public.release_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text, interval) to service_role;
grant execute on function public.complete_webhook_event(text, text, text) to service_role;
grant execute on function public.release_webhook_event(text, text) to service_role;

commit;

-- Rollback (if ever needed). The webhook falls back to processing without
-- deduplication when these are gone, so rolling back never drops calls:
--   begin;
--   drop function if exists public.claim_webhook_event(text, text, interval);
--   drop function if exists public.complete_webhook_event(text, text, text);
--   drop function if exists public.release_webhook_event(text, text);
--   drop table if exists public.webhook_events;
--   commit;
