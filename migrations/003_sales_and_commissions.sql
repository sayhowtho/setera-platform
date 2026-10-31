-- Step 3: the sale/commission/bonus ledger. Purely additive — no existing
-- table (clients, prospects, businesses, appointments) is modified.
-- These tables stay empty until the calculation module (step 4) and, later,
-- a "Record New Sale" entry point write to them.

create table if not exists sales (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id),
  prospect_id uuid references prospects(id),
  setter_id   uuid references profiles(id),
  closer_id   uuid references profiles(id),
  plan_slug   text not null references plans(slug),
  plan_price  numeric(10,2) not null,   -- snapshot of plans.monthly_price at sale time
  currency    text not null,             -- snapshot of plans.currency at sale time
  sold_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table if not exists commission_earnings (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid not null references sales(id),
  rep_id                uuid not null references profiles(id),
  comp_track_snapshot   text not null check (comp_track_snapshot in ('setter_training', 'setter', 'setter_closer', 'closer')),
  commission_rate       numeric(5,4) not null,   -- e.g. 0.15 or 0.05, snapshot
  is_milestone_override boolean not null default false,
  commission_amount     numeric(10,2) not null,
  currency              text not null,
  created_at            timestamptz not null default now()
);

create table if not exists bonus_awards (
  id                       uuid primary key default gen_random_uuid(),
  rep_id                   uuid not null references profiles(id),
  bonus_type               text not null check (bonus_type in ('sprint_30_day', 'mrr_milestone_1', 'mrr_milestone_2', 'mrr_milestone_3')),
  amount                   numeric(10,2) not null,
  comp_track_at_award      text not null check (comp_track_at_award in ('setter_training', 'setter', 'setter_closer', 'closer')),
  qualifying_window_start  timestamptz,
  qualifying_window_end    timestamptz,
  awarded_at               timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  unique (rep_id, bonus_type)
);

create index if not exists sales_client_id_idx on sales (client_id);
create index if not exists sales_setter_id_idx on sales (setter_id);
create index if not exists sales_closer_id_idx on sales (closer_id);
create index if not exists commission_earnings_sale_id_idx on commission_earnings (sale_id);
create index if not exists commission_earnings_rep_id_idx on commission_earnings (rep_id);
create index if not exists bonus_awards_rep_id_idx on bonus_awards (rep_id);
