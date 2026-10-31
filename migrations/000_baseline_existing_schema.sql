-- ============================================================================
-- BASELINE SNAPSHOT of pre-existing production schema, captured 2026-09-22.
--
-- DO NOT RUN THIS FILE. These 16 tables already exist in production and were
-- created before the migrations/ folder existed (see migrations 005-009's own
-- comments: "the existing policies on these tables aren't in this repo").
-- This file exists purely to bring their shape into version control so it can
-- be read, diffed, and reviewed like the rest of the schema.
--
-- SOURCE / METHOD: captured read-only via PostgREST's OpenAPI introspection
-- endpoint (GET {SUPABASE_URL}/rest/v1/ with the existing service-role key —
-- the same credential already used throughout this app's server code; no new
-- credentials, no CLI, no direct Postgres connection were used or available
-- in this environment). This is the same mechanism Supabase's own API docs
-- page uses to describe your schema. It reliably reports: column name,
-- Postgres type, default expression, primary-key membership, and *enforced*
-- foreign-key constraints. No pg_dump / psql / Supabase CLI was available in
-- this environment (not installed, no project link, no direct DB connection
-- string configured) — see the LIMITATIONS section at the end of this file.
--
-- Of the 17 tables originally flagged as schema-less, ONE — `contracts` — is
-- not a database table at all. It's a Supabase Storage bucket name, used via
-- `supabaseAdmin.storage.from('contracts')` in app/api/admin/contract-upload
-- and app/api/admin/contract-file. It is not a Postgres relation and is
-- correctly omitted below.
--
-- Two tables exist live that the application code never queries and were not
-- part of the original 17: `setter_appointments` and
-- `prospects_removed_fields_backup` (almost certainly a manual pre-migration
-- backup taken before migration 005 dropped columns from `prospects`).
-- Neither is defined here (out of scope of this task) but both are flagged
-- in the summary as worth a follow-up look.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── businesses ── (tenant root for the client-facing/call side of the app)
create table if not exists public.businesses (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  phone                  text,
  email                  text,
  industry               text,
  plan                   text default 'monthly',
  status                 text default 'active',
  created_at             timestamptz default timezone('utc'::text, now()),
  tier                   text default 'starter',
  term                   text default 'monthly',
  upfront_paid_usd       numeric,
  performance_goal_cad   numeric,
  goal_a_target          integer default 6,
  minutes_limit          integer default 3000,
  sms_contact_1          text,
  sms_contact_2          text,
  widget_enabled         boolean default false,
  avg_job_value          numeric,
  currency               text default 'CAD',
  business_hours         text,
  services               text,
  urgent_triggers        text,
  call_forwarding_number text,
  go_live_date           date,
  goal_a_current         integer default 0,
  goal_b_current_cad     numeric default 0
);

-- ── profiles ── (every human account: owner/admin/rep/vp_sales/setter/client)
create table if not exists public.profiles (
  id                     uuid primary key,
  email                  text not null,
  role                   text not null,
  business_id            uuid references public.businesses(id),
  full_name              text,
  created_at             timestamptz default now(),
  probation_start        date,
  setter_access          boolean default false,
  availability_schedule  jsonb
);

-- ── clients ── (a signed/onboarded customer; distinct from businesses — see
--   audit Section D, sales side is rep-ownership-scoped not tenant-scoped)
create table if not exists public.clients (
  id                     uuid primary key default gen_random_uuid(),
  business_name          text,
  owner_name             text,
  phone                  text,
  email                  text,
  city                   text,
  plan                   text,
  how_they_heard         text,
  notes                  text,
  rep_id                 uuid,  -- NOTE: no FK existed here as of this capture (see LIMITATIONS #5) —
  -- added by migrations/010_add_missing_profile_fks.sql.
  status                 text default 'Onboarding',
  created_at             timestamptz default now(),
  province               text,
  website                text,
  calls_per_day          text,
  current_phone_system   text,
  secondary_contact      text,
  referred_by            text,
  best_time_to_reach     text,
  contract_signed        boolean default false,
  payment_collected      boolean default false,
  go_live_checklist      jsonb,
  tier                   text,
  payment_type           text,
  business_id            uuid references public.businesses(id),
  booked_by_setter_id    uuid references public.profiles(id)  -- added by migrations/008
);

-- ── calls ── (every Emily-handled call; the core product's data feed)
create table if not exists public.calls (
  id                          uuid primary key default gen_random_uuid(),
  caller_name                 text,
  caller_number               text not null,
  reason                      text,
  urgency                     text,
  callback_time               text,
  status                      text default 'Captured',
  transcript                  text,
  summary                     text,
  duration                    integer,
  created_at                  timestamptz default timezone('utc'::text, now()),
  business_id                 uuid references public.businesses(id),
  mood                        text,
  pipeline_stage              text default 'new',
  install_date                date,
  pipeline_notes              text,
  call_sid                    text,
  income_collected            numeric,
  install_completed           date,
  channel                     text not null default 'phone',
  email                       text,
  estimate_datetime           timestamptz,
  classification               text,
  classification_source        text,
  classification_confidence    numeric,
  city                        text,
  property_address            text
);

-- ── leads ── (fallback destination in emily-webhook when agent_id has no
--   linked business_id yet — see audit Section G.1)
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   text,
  name              text,
  phone             text,
  email             text,
  business_type     text,
  reason            text,
  transcript        jsonb,
  assigned_to       uuid references public.profiles(id),
  status            text default 'new',
  notes             text,
  created_at        timestamptz default now()
);

-- ── setter_availability ── (bookable demo/appointment slots)
create table if not exists public.setter_availability (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  time_slot   text not null,
  is_booked   boolean default false,
  created_by  uuid,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  created_at  timestamptz default now(),
  owned_by    uuid references public.profiles(id)
);

-- ── appointments ── (booked demo/onboarding meetings; flat, not linked to
--   the prospects pipeline — confirmed by migrations/007's own note)
create table if not exists public.appointments (
  id                     uuid primary key default gen_random_uuid(),
  business_id            uuid references public.businesses(id),
  client_id              uuid references public.clients(id),
  title                  text not null default 'Setter Appointment',
  date                   date not null default current_date,
  start_time             time not null default '09:00:00',
  end_time               time,
  service_type           text,
  address                text,
  contact_name           text,
  contact_phone          text,
  notes                  text,
  status                 text default 'confirmed',
  source                 text default 'manual',
  created_at             timestamptz default now(),
  setter_id              uuid,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  availability_id        uuid references public.setter_availability(id),
  assigned_to            uuid,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  business_name          text,
  trade                  text,
  phone                  text,
  scheduled_date         date,
  scheduled_time         text,
  meet_link              text,
  calendar_sync_failed   boolean default false
);

-- ── prospects ── (the unified sales/CRM pipeline table — migrations/005)
create table if not exists public.prospects (
  id                 uuid primary key default gen_random_uuid(),
  rep_id             uuid not null,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  company_name       text not null,
  trade              text default 'Roofing',
  province           text default 'SK',
  city               text,
  website            text,
  phone              text,
  email              text,
  contact_name       text,
  contact_position   text,
  contact_phone      text,
  contact_email      text,
  source             text default 'Manual Entry',
  status             text default 'Not Contacted',
  notes              text,
  follow_up_date     date,
  created_at         timestamptz default timezone('utc'::text, now()),
  updated_at         timestamptz default timezone('utc'::text, now()),
  do_not_contact     boolean default false,
  last_contacted_at  timestamptz,
  tier               text
);

-- ── prospect_activities ── (append-only call/touch log per prospect)
create table if not exists public.prospect_activities (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid references public.prospects(id),
  rep_id          uuid not null,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  type            text not null,
  outcome         text,
  notes           text,
  follow_up_date  date,
  created_at      timestamptz default timezone('utc'::text, now())
);

-- ── prospect_stage_history ── (pipeline-stage audit trail per prospect)
create table if not exists public.prospect_stage_history (
  id             uuid primary key default gen_random_uuid(),
  prospect_id    uuid references public.prospects(id),
  rep_id         uuid not null,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  stage          text not null,
  entered_at     timestamptz default timezone('utc'::text, now()),
  left_at        timestamptz,
  days_in_stage  integer
);

-- ── setter_prospects ── (legacy pre-unification setter call log; superseded
--   by `prospects` per migrations/005 but deliberately not dropped yet)
create table if not exists public.setter_prospects (
  id               uuid primary key default gen_random_uuid(),
  setter_id        uuid,  -- NOTE: this capture missed a real FK here — it pointed at auth.users(id),
  -- which OpenAPI introspection cannot see (see LIMITATIONS #5). Corrected
  -- to a FK on profiles(id) by migrations/010_add_missing_profile_fks.sql.
  business_name    text not null,
  trade            text,
  city             text,
  phone            text,
  decision_maker   text,
  call_outcome     text default 'No Answer',
  notes            text,
  callback_date    date,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── business_agents ── (maps an ElevenLabs agent_id to a business_id; the
--   join emily-webhook depends on for every inbound call)
create table if not exists public.business_agents (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null,
  business_id  uuid references public.businesses(id),
  notes        text,
  created_at   timestamptz default now()
);

-- ── caller_classifications ── (per-phone-number, per-business manual
--   classification override — distinct from calls.classification, which is
--   per-call and AI-generated)
create table if not exists public.caller_classifications (
  id                        uuid primary key default gen_random_uuid(),
  business_id               uuid not null references public.businesses(id),
  phone_number_normalized   text not null,
  phone_number_raw          text,
  classification             text not null,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── cancellations ── (client churn log)
create table if not exists public.cancellations (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id),
  business_name   text not null,
  rep_id          uuid references public.profiles(id),
  reason          text not null,
  category        text,
  plan_type       text,
  mrr_lost        numeric,
  effective_date  date,
  final_month     text,
  notes           text,
  status          text default 'pending',
  created_at      timestamptz default now(),
  created_by      uuid references public.profiles(id)
);

-- ── client_touchpoints ── (rep-logged touch/interaction history per business)
create table if not exists public.client_touchpoints (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id),
  rep_id       uuid,  -- NOTE: no FK existed here as of this capture (see LIMITATIONS #5) —
  -- added by migrations/010_add_missing_profile_fks.sql.
  type         text not null default 'Call',
  notes        text,
  created_at   timestamptz default now()
);

-- ── problems ── (internal issue-tracking log, admin-facing)
create table if not exists public.problems (
  id             uuid primary key default gen_random_uuid(),
  business_name  text,
  issue          text,
  rep_id         uuid,  -- NOTE: no FK existed here as of this capture (see LIMITATIONS #5) —
  -- added by migrations/010_add_missing_profile_fks.sql.
  status         text default 'Open',
  created_at     timestamptz default now(),
  admin_notes    text
);

-- ============================================================================
-- LIMITATIONS OF THIS CAPTURE (read before trusting this file for anything
-- beyond "what columns and types exist")
--
-- 1. NOT CAPTURED — CHECK constraints. Several columns above are clearly
--    enum-like in application code (e.g. profiles.role, clients.status,
--    calls.pipeline_stage, prospects.status) but this introspection method
--    cannot see whether a CHECK constraint actually enforces the allowed
--    values at the database level, or whether that's purely convention
--    enforced by application code. This matters: unlike migrations 001-009
--    (which use explicit `check (... in (...))` throughout), NONE of these
--    16 tables' CHECK constraints could be confirmed either way.
--
-- 2. NOT CAPTURED — indexes beyond the implicit primary-key index. Whether
--    e.g. calls.business_id, prospects.rep_id, or calls.call_sid have a
--    secondary index is unknown. Given calls and prospects are the two
--    highest-read-volume tables in the app, this is worth checking directly.
--
-- 3. NOT CAPTURED — RLS policies. PostgREST's OpenAPI introspection does not
--    expose pg_policies. RLS is known to be enabled on the tables reachable
--    from portal sessions (the app would return zero rows otherwise for the
--    non-service-role paths), but the actual policy predicates for all 16
--    tables above are NOT in this file and remain visible only in the
--    Supabase dashboard.
--
-- 4. NOT NULL fidelity is partial. Columns marked `not null` above come from
--    PostgREST's "required" list, which (per its own documented behavior)
--    reflects columns with no default that must be supplied on insert. A
--    column with a default CAN still be NOT NULL in Postgres without
--    appearing in that list — so the absence of `not null` on a column
--    above is NOT proof the database allows NULL there, only that it could
--    not be confirmed this way.
--
-- 5. RESOLVED, but the original flag was WRONG about why. Originally read:
--    "10 columns conceptually referencing profiles.id have NO enforced
--    foreign key" — based only on this file's OpenAPI-introspection method,
--    which cannot see a foreign key pointing at any table it doesn't expose
--    through the API, and `auth.users` isn't exposed. That made this file
--    report a false negative on 7 of those 10 columns.
--
--    Direct read-only queries against pg_constraint on both staging and
--    production (2026-09-22) found the true picture: 7 of the 10 already
--    had a real, enforced foreign key — just pointing at auth.users(id)
--    instead of profiles(id), invisible to this capture method entirely:
--      prospects.rep_id, prospect_activities.rep_id,
--      prospect_stage_history.rep_id  -> auth.users(id) ON DELETE CASCADE
--      appointments.setter_id, appointments.assigned_to,
--      setter_availability.created_by, setter_prospects.setter_id
--                                      -> auth.users(id) ON DELETE NO ACTION
--    The CASCADE trio was a live production risk, not a hypothetical one:
--    deleting a rep's auth.users row (the only app code path that does this
--    is app/api/admin/remove-user) silently cascade-deleted every prospect,
--    activity-log entry, and stage-history row that rep ever touched.
--    Only 3 columns were genuinely foreign-key-less as originally reported:
--    clients.rep_id, client_touchpoints.rep_id, problems.rep_id.
--
--    All 10 were fixed the same night this was discovered, by
--    migrations/010_add_missing_profile_fks.sql, which explicitly DROPs
--    each old auth.users-pointing constraint (by name) before adding the
--    correct profiles(id) one — RESTRICT on the four attribution-bearing
--    columns (clients.rep_id, prospects.rep_id, prospect_activities.rep_id,
--    prospect_stage_history.rep_id), SET NULL on the other six. Applied to
--    both staging and production and verified via pg_constraint afterward —
--    see that migration's header for the full story. Lesson for future
--    schema audits in this repo: treat this file's "no FK found" as
--    provisional for any column that plausibly could reference auth.users
--    (any user/rep/setter/actor-shaped column), not as proof.
--
--    Read-only comparisons FK enforced before this fix, for reference:
--      clients.booked_by_setter_id, leads.assigned_to,
--      setter_availability.owned_by, cancellations.rep_id,
--      cancellations.created_by (all -> profiles(id) already).
--    Two of these — clients.booked_by_setter_id and
--    setter_availability.owned_by — are themselves blocking (NO ACTION)
--    FKs to profiles(id) not covered by any app-level pre-check today
--    (flagged, not yet acted on — low urgency, not the CASCADE risk).
--
-- 6. FLAG — two live tables outside the original 17-table scope:
--    `setter_appointments` (not referenced anywhere in current app code —
--    possibly superseded by `appointments`, worth confirming it's safe to
--    ignore or should be dropped) and `prospects_removed_fields_backup`
--    (very likely a manual backup taken before migrations/005 dropped
--    `employees`/`trucks`/`address`/`term` from `prospects` — worth
--    confirming it's still needed before it's forgotten indefinitely).
--
-- TO CLOSE THESE GAPS: either (a) run
--   select schemaname, tablename, indexname, indexdef from pg_indexes
--     where schemaname='public' and tablename in (<the 16 tables above>);
--   select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--     where contype = 'c' and conrelid::regclass::text in (<the 16 tables above>);
--   select tablename, policyname, permissive, roles, cmd, qual, with_check
--     from pg_policies where schemaname='public'
--     and tablename in (<the 16 tables above>);
-- in the Supabase SQL editor and share the output, or (b) provide a direct
-- Postgres connection string (or set up `supabase login` / `supabase link`)
-- so this can be re-captured with full pg_dump fidelity.
-- ============================================================================
