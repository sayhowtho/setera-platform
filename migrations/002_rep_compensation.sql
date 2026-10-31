-- Step 2: rep compensation state (dedicated table, not bolted onto profiles).
-- Purely additive — no existing rows are touched, and no comp_track is
-- auto-assigned to existing reps/setters. Each existing rep needs a row
-- created explicitly by an admin, with a manually-verified comp_track and
-- rep_started_at, once this exists.

create table if not exists rep_compensation (
  rep_id           uuid primary key references profiles(id) on delete cascade,
  comp_track       text not null check (comp_track in ('setter_training', 'setter', 'setter_closer', 'closer')),
  rep_started_at   timestamptz not null,
  track_changed_at timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists rep_compensation_history (
  id                  uuid primary key default gen_random_uuid(),
  rep_id              uuid not null references profiles(id) on delete cascade,
  previous_track      text check (previous_track in ('setter_training', 'setter', 'setter_closer', 'closer')),
  new_track           text not null check (new_track in ('setter_training', 'setter', 'setter_closer', 'closer')),
  changed_at          timestamptz not null default now(),
  changed_by          uuid references profiles(id),
  contract_sent_at    timestamptz,
  contract_signed_at  timestamptz,
  note                text,
  created_at          timestamptz not null default now()
);

create index if not exists rep_compensation_history_rep_id_idx on rep_compensation_history (rep_id, changed_at desc);
