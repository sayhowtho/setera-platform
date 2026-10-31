-- Step 32: a payments ledger — real money collected from each client, entered
-- by an admin from High Table (client detail → Payments → Record payment).
-- Feeds the Total Paid column (Clients page) and Lifetime Revenue Collected
-- (Clients + Overview).
--
-- Applied by hand in the SQL editor — staging first, then production.
--
-- Purely additive: no existing table changes. Starts EMPTY on purpose:
-- Northfield's prepay was paid direct before the platform tracked payments and stays
-- on businesses.upfront_paid_usd only, outside every ledger total (Alex,
-- 2026-10-05).
--
-- Every entry carries its own currency; totals are per currency and are never
-- added across currencies.
--
-- Append-only, so history can't be rewritten: admins/owner can read and
-- insert, nobody can update or delete through the API. A mistake or refund is
-- a new entry with a negative amount and a note.

begin;

create table public.client_payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id),
  amount      numeric(10,2) not null check (amount <> 0),  -- negative = refund / correction
  currency    text not null check (currency in ('CAD', 'USD')),
  paid_on     date not null,                                 -- Regina date the money arrived
  method      text,                                          -- e.g. Stripe, e-Transfer, cheque
  note        text,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index client_payments_client_id_idx on public.client_payments (client_id);

alter table public.client_payments enable row level security;

create policy "Admins read client payments" on public.client_payments
  for select to authenticated
  using (get_my_role() = any (array['admin', 'owner']));

create policy "Admins record client payments" on public.client_payments
  for insert to authenticated
  with check (get_my_role() = any (array['admin', 'owner']) and created_by = auth.uid());

revoke update, delete on public.client_payments from anon, authenticated;
revoke all on public.client_payments from anon;

commit;
