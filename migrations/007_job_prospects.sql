-- Step 7: Job Prospects (hiring pipeline), admin-only.
--
-- Run this by hand in the Supabase SQL editor (same as prior migrations —
-- there's no CLI runner in this repo).
--
-- New, fully standalone table for job applicants/candidates. Deliberately
-- NOT wired into `prospects` or `appointments` — those are the sales-demo
-- system (appointments is a flat table tied to setter_availability booking
-- and setter/rep dashboard goal metrics; see investigation notes). Job
-- Prospects only reuses the existing `/api/create-meet` endpoint for
-- Google Calendar/Meet creation (same demos calendar), writing the
-- resulting meet_link/google_event_id directly onto this table's own rows.
--
-- Status is free-form text, no enforced transitions:
-- New Applicant -> Reviewing -> Interview Requested -> Interview Scheduled
-- -> Interviewed -> Offer Sent -> Hired / Passed
--
-- Admin-only for now (no new role/portal): RLS restricts all access to
-- get_my_role() IN ('admin','owner'), same helper function already used by
-- profiles_select_admin (see 006) and the prospects/prospect_activities
-- policies (see 005).

create table if not exists public.job_prospects (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  location text,
  position text,
  application_source text,
  profile_url text,
  resume_url text,
  application_date date default current_date,
  notes text,
  interview_date date,
  interview_time text,
  meet_link text,
  google_event_id text,
  interviewer text,
  status text not null default 'New Applicant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_prospects enable row level security;

create policy "job_prospects_admin_all"
on public.job_prospects
for all
to public
using (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]))
with check (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text]));

-- STATUS: not yet applied. Run in the Supabase SQL editor, then confirm:
--   select * from public.job_prospects limit 1;
-- as an admin/owner session succeeds, and the same query as any other role
-- (or unauthenticated) returns zero rows / is denied.
