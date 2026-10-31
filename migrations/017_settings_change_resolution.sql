-- Step 17: let Alex "Mark Done" a client Settings change in High Table's
-- Settings Changes Log, without ever deleting the record.
--
-- Applied by hand in the SQL editor — staging first, then production.
--
-- Two separate states on client_settings_changes (016):
--   read_at      — seen (the sidebar bell is unread-only)
--   resolved_at  — acted on (the Settings Changes Log shows everything
--                  unresolved, read or not). Mark Done also sets read_at.
-- Rows are never deleted by the app; resolved rows just drop out of both
-- views and stay queryable.
--
-- Admins still can't rewrite a record: the column grant widens only to the
-- two resolution columns, and the policy now requires resolved_by to be the
-- admin actually making the change (or NULL), so "who resolved it" can't be
-- attributed to someone else.

begin;

alter table public.client_settings_changes
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles(id) on delete set null;

create index client_settings_changes_unresolved_idx
  on public.client_settings_changes (created_at desc) where resolved_at is null;

grant update (resolved_at, resolved_by) on public.client_settings_changes to authenticated;

drop policy "Admins mark settings changes read" on public.client_settings_changes;
create policy "Admins mark settings changes read or resolved" on public.client_settings_changes
  for update to authenticated
  using (get_my_role() = any (array['admin', 'owner']))
  with check (get_my_role() = any (array['admin', 'owner']) and (resolved_by is null or resolved_by = auth.uid()));

commit;

-- Rollback:
--   drop policy "Admins mark settings changes read or resolved" on public.client_settings_changes;
--   create policy "Admins mark settings changes read" on public.client_settings_changes
--     for update to authenticated
--     using (get_my_role() = any (array['admin', 'owner']))
--     with check (get_my_role() = any (array['admin', 'owner']));
--   alter table public.client_settings_changes drop column resolved_at, drop column resolved_by;
