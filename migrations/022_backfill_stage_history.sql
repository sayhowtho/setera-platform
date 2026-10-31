-- Step 22: ONE-TIME backfill — a stage-history row for every prospect that
-- has none. DO NOT RUN until Alex approves. Run it after Bodhi is on
-- /api/bodhi/prospects (so no more history-less rows arrive) and before the
-- service-role key rotation. It runs in the SQL editor and doesn't use any
-- API key.
--
-- Production count, checked read-only 2026-09-29: 21 prospects with no
-- stage-history row — 20 source 'bodhi' (all Not Contacted) + 1 source
-- 'personal contact to Carlos ' (Closed Lost). All owned by the owner account.
--
-- Each gets ONE row: stage = its CURRENT status mapped exactly the way the
-- app maps it (getColumnForStatus / pipeline_stage_for_status — the stage
-- column stores New/Meeting/Proposal/Won, never raw statuses; Closed Lost
-- falls back to New like the app), entered_at = the prospect's created_at,
-- left_at null (open = current stage), rep_id = the prospect's owner.
--
-- Safe to run twice: only prospects with NO stage-history row are touched,
-- and the table lock stops a concurrent insert slipping in between the check
-- and the insert. A second run inserts 0 rows.
--
-- Deliberately inline (no dependency on migration 021), so it can run
-- whenever it's approved.

-- 1. Preview (read-only). Expect 21 rows today.
select p.id, p.company_name, p.source, p.status, p.created_at,
       case when p.status in ('Interested', 'Demo Scheduled') then 'Meeting'
            when p.status = 'Proposal Sent' then 'Proposal'
            when p.status = 'Closed Won' then 'Won'
            else 'New' end as stage
from public.prospects p
where not exists (select 1 from public.prospect_stage_history h where h.prospect_id = p.id)
order by p.created_at;

-- 2. Backfill. Expect "INSERT 0 21" (the preview's count); a rerun gives "INSERT 0 0".
begin;
lock table public.prospect_stage_history in share row exclusive mode;
insert into public.prospect_stage_history (prospect_id, rep_id, stage, entered_at)
select p.id, p.rep_id,
       case when p.status in ('Interested', 'Demo Scheduled') then 'Meeting'
            when p.status = 'Proposal Sent' then 'Proposal'
            when p.status = 'Closed Won' then 'Won'
            else 'New' end,
       p.created_at
from public.prospects p
where not exists (select 1 from public.prospect_stage_history h where h.prospect_id = p.id);
commit;

-- 3. Verify. Expect 0.
select count(*) as still_missing
from public.prospects p
where not exists (select 1 from public.prospect_stage_history h where h.prospect_id = p.id);
