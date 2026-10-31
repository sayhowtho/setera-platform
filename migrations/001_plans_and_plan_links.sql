-- Step 1 of the Setera compensation-system rebuild: plan pricing source of truth.
-- Purely additive — does not touch clients, businesses, prospects, or any existing table.
-- Run this in the Supabase SQL Editor, then let Claude know so it can verify.

create extension if not exists pgcrypto;

create table if not exists plans (
  slug             text primary key,
  display_name     text not null,
  monthly_price    numeric(10,2) not null,
  currency         text not null default 'CAD',
  minutes_included integer not null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists plan_links (
  id          uuid primary key default gen_random_uuid(),
  plan_slug   text references plans(slug),
  link_type   text not null check (link_type in ('standard', 'no_setup_fee', 'promo', 'topup')),
  label       text not null,
  url         text,
  setup_fee   numeric(10,2),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into plans (slug, display_name, monthly_price, currency, minutes_included, active) values
  ('launch',     'Launch',  697.00,  'CAD', 200,  true),
  ('grow',       'Grow',    1348.00, 'CAD', 1000, true),
  ('starter_v2', 'Starter', 2247.00, 'CAD', 3000, true)
on conflict (slug) do nothing;
