-- Step 10: replace the wrong foreign keys on 7 columns, and add the missing
-- ones on the other 3, so all 10 point at profiles(id) instead of
-- auth.users(id), with the ON DELETE behavior actually decided for each.
--
-- DO NOT RUN THIS AGAINST PRODUCTION YET. Test against staging first (same
-- policy as every prior migration in this repo). There's no CLI runner in
-- this repo; this file is applied by hand when ready.
--
-- REVISION HISTORY OF THIS FILE (both caught by testing on staging before
-- production — this is exactly why that policy exists):
--
--   v1 used `alter table ... add constraint if not exists ...`, which is not
--   valid Postgres syntax (unlike `add column if not exists`). Failed on the
--   very first statement; nothing was applied anywhere.
--
--   v2 switched to DO blocks that checked `pg_constraint` for the
--   constraint's NAME before adding it. That ran clean (no errors) on
--   staging, but the verification query afterward showed 7 of the 10 names
--   already existed as DIFFERENT constraints — pointing at auth.users(id),
--   not profiles(id), with different ON DELETE behavior — so the DO blocks
--   silently no-op'd on those 7 and only genuinely created the other 3
--   (clients.rep_id, client_touchpoints.rep_id, problems.rep_id).
--
--   Direct read-only queries against BOTH staging and production (2026-09-22,
--   via a temporary direct Postgres connection, not the app's usual
--   REST/service-role access — see below) confirmed the SAME 7 pre-existing
--   constraints exist on production too, under the identical names:
--
--     prospects.rep_id               -> auth.users(id) ON DELETE CASCADE
--     prospect_activities.rep_id     -> auth.users(id) ON DELETE CASCADE
--     prospect_stage_history.rep_id  -> auth.users(id) ON DELETE CASCADE
--     appointments.setter_id         -> auth.users(id)            [NO ACTION]
--     appointments.assigned_to       -> auth.users(id)            [NO ACTION]
--     setter_availability.created_by -> auth.users(id)            [NO ACTION]
--     setter_prospects.setter_id     -> auth.users(id)            [NO ACTION]
--
--   The CASCADE ones are a real, currently-live production risk: deleting a
--   rep's auth.users row (via app/api/admin/remove-user, the only app code
--   path that does this) silently cascade-deletes every prospect, activity-
--   log entry, and stage-history row that rep ever touched. This is exactly
--   the outcome the RESTRICT choice below is supposed to prevent — it was
--   already possible before this migration, via a constraint that predates
--   this repo's migrations/ folder entirely and was never previously
--   discovered (migrations/000's own capture missed it — see its note below).
--
--   This is why migrations/000_baseline_existing_schema.sql's REST/OpenAPI-
--   based capture reported "no FK found" for these 7 columns: PostgREST's
--   OpenAPI introspection cannot see a foreign key pointing at a table it
--   doesn't expose through the API, and `auth.users` isn't exposed. That
--   capture method is reliable for columns referencing `public` tables (as
--   verified independently many times elsewhere in this repo) but silently
--   misses anything pointing at `auth.*`. Treat migrations/000 as accurate
--   for shape/defaults/public-table FKs, but not as proof of "no FK" on any
--   column referencing auth.users.
--
-- v3 (this version) explicitly DROPs each old constraint by name before
-- adding the correct one, in a single ALTER TABLE statement per column so
-- the drop-and-add is atomic — if the ADD half fails, the DROP half rolls
-- back too, never leaving a column with no FK at all. The whole file also
-- runs inside one explicit transaction, so a failure on any one column
-- rolls back all 10, not just that one.
--
-- SAFETY CHECK ALREADY DONE (read-only, 2026-09-22): every non-null value in
-- all 10 columns was diffed against profiles.id — zero orphaned rows found.
-- Since profiles.id = auth.users.id for every real account in this schema,
-- this result holds regardless of which table the old constraint pointed at.
-- Re-verify with migrations/000's orphan-check query if meaningful time has
-- passed since 2026-09-22.
--
-- ON DELETE CHOICE, PER COLUMN (Alex's call, recorded here for history):
--
--   RESTRICT — attribution-bearing columns that affect commission/
--   compensation history. A rep/setter deletion must be BLOCKED rather than
--   silently erasing (or, as discovered above, silently CASCADE-DELETING)
--   who gets credit for a sale:
--     clients.rep_id, prospects.rep_id, prospect_activities.rep_id,
--     prospect_stage_history.rep_id
--   (Consistent with the existing precedent in this schema: overflow_waitlist's
--   originating_rep_id/closing_rep_id already use ON DELETE RESTRICT for the
--   same reason — see migrations/009.)
--
--   SET NULL — appointments' rep-facing columns, setter_prospects.setter_id,
--   setter_availability.created_by, client_touchpoints.rep_id, and
--   problems.rep_id. No compensation/commission logic reads any of these;
--   losing the attribution on a profile delete is acceptable, not dangerous.
--   app/api/admin/remove-user now detaches all four of the previously-
--   NO-ACTION ones (appointments.setter_id, appointments.assigned_to,
--   setter_prospects.setter_id, setter_availability.created_by) by hand
--   before deleting a user, same as before — this migration's SET NULL
--   makes that explicit detach step belt-and-suspenders rather than load-
--   bearing, not redundant-and-safe-to-remove; the app-level detach also
--   protects against any other, not-yet-discovered path that might delete a
--   profile without going through this migration's constraints (e.g. a
--   direct SQL delete run by hand).

begin;

alter table public.clients
  drop constraint if exists clients_rep_id_fkey,
  add  constraint clients_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete restrict;

alter table public.prospects
  drop constraint if exists prospects_rep_id_fkey,
  add  constraint prospects_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete restrict;

alter table public.prospect_activities
  drop constraint if exists prospect_activities_rep_id_fkey,
  add  constraint prospect_activities_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete restrict;

alter table public.prospect_stage_history
  drop constraint if exists prospect_stage_history_rep_id_fkey,
  add  constraint prospect_stage_history_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete restrict;

alter table public.appointments
  drop constraint if exists appointments_setter_id_fkey,
  add  constraint appointments_setter_id_fkey
       foreign key (setter_id) references public.profiles(id) on delete set null;

alter table public.appointments
  drop constraint if exists appointments_assigned_to_fkey,
  add  constraint appointments_assigned_to_fkey
       foreign key (assigned_to) references public.profiles(id) on delete set null;

alter table public.setter_prospects
  drop constraint if exists setter_prospects_setter_id_fkey,
  add  constraint setter_prospects_setter_id_fkey
       foreign key (setter_id) references public.profiles(id) on delete set null;

alter table public.setter_availability
  drop constraint if exists setter_availability_created_by_fkey,
  add  constraint setter_availability_created_by_fkey
       foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.client_touchpoints
  drop constraint if exists client_touchpoints_rep_id_fkey,
  add  constraint client_touchpoints_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete set null;

alter table public.problems
  drop constraint if exists problems_rep_id_fkey,
  add  constraint problems_rep_id_fkey
       foreign key (rep_id) references public.profiles(id) on delete set null;

-- Helpful indexes: Postgres does not auto-index the referencing side of a
-- foreign key (only the referenced side, via profiles' own primary key).
-- Every column above is already queried by rep/setter in application code
-- (e.g. prospects filtered by rep_id in the rep portal), so add the
-- matching indexes now rather than as a separate migration later.
create index if not exists clients_rep_id_idx                 on public.clients (rep_id);
create index if not exists prospects_rep_id_idx                on public.prospects (rep_id);
create index if not exists prospect_activities_rep_id_idx      on public.prospect_activities (rep_id);
create index if not exists prospect_stage_history_rep_id_idx   on public.prospect_stage_history (rep_id);
create index if not exists appointments_setter_id_idx          on public.appointments (setter_id);
create index if not exists appointments_assigned_to_idx        on public.appointments (assigned_to);
create index if not exists setter_prospects_setter_id_idx      on public.setter_prospects (setter_id);
create index if not exists setter_availability_created_by_idx  on public.setter_availability (created_by);
create index if not exists client_touchpoints_rep_id_idx       on public.client_touchpoints (rep_id);
create index if not exists problems_rep_id_idx                 on public.problems (rep_id);

commit;

-- VERIFY AFTER RUNNING (staging first, per the header above):
--   select conrelid::regclass as table, conname, pg_get_constraintdef(oid) as def
--     from pg_constraint
--     where contype = 'f' and conname in (
--       'clients_rep_id_fkey','prospects_rep_id_fkey',
--       'prospect_activities_rep_id_fkey','prospect_stage_history_rep_id_fkey',
--       'appointments_setter_id_fkey','appointments_assigned_to_fkey',
--       'setter_prospects_setter_id_fkey','setter_availability_created_by_fkey',
--       'client_touchpoints_rep_id_fkey','problems_rep_id_fkey'
--     )
--     order by conrelid::regclass::text, conname;
-- All 10 should now show `REFERENCES profiles(id)`, never auth.users(id),
-- with the RESTRICT/SET NULL split exactly as documented above. Then re-run
-- the orphan-check query from migrations/000's LIMITATIONS section to
-- confirm it still returns zero rows (it should — this migration doesn't
-- touch data, only replaces constraints).
