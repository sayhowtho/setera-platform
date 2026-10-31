-- Step 39: setter_availability (the demo-booking calendar) is staff only, and
-- only admins/owners can move, reassign or block a slot.
--
-- Two policies created outside migrations/ were wide open:
--   "All authenticated read availability"  SELECT USING (auth.uid() IS NOT NULL)
--   "Setters update availability"          UPDATE USING (auth.uid() IS NOT NULL)
-- so any logged-in user, clients included, could read every slot and change
-- any column of any slot (owned_by, date, time_slot, is_blocked,
-- blocked_note, is_booked).
--
-- Who legitimately touches it: slots belong to reps/admins/the owner and
-- setters book into them. The setter portal (and reps/admins booking) flips
-- is_booked on someone else's slot via lib/slots.ts claimSlot/releaseSlot;
-- moving, reassigning and blocking are High Table only (admin/owner); the
-- reschedule-demo, cancel-demo, delete-appointment and remove-user routes use
-- service_role. No client screen uses slots.
--
-- FIX: reads and updates limited to staff roles (setter, rep, vp_sales, admin,
-- owner), plus a BEFORE UPDATE trigger: non-admin API users may only change
-- is_booked. service_role and the SQL editor pass through. The admin/owner
-- "Owners manage availability" (ALL) and "Admins can delete availability"
-- policies are unchanged.
--
-- Not changed here: reps still can't insert or delete their own slots (no
-- INSERT/DELETE policy for them), so the rep portal's Generate and Delete
-- still fail silently, exactly as before this migration. Deciding that is a
-- separate step.
--
-- Applied by hand: staging (2026-10-10), verified — setters read, book and
-- release but are rejected on owner/date/time/block changes; reps self-book
-- with setter_access off and on, setters book into a rep's calendar when
-- setter_access is on, reps can't move or take over slots; High Table
-- generate/block/unblock/delete/clear/reassign all work; the four
-- service-role routes' slot queries work; a temporary client and anon see 0
-- slots and change 0 rows — then production the same day (30 slots
-- unchanged).

begin;

-- Reads: staff only. Clients and users without a profile get nothing.
drop policy if exists "All authenticated read availability" on public.setter_availability;
drop policy if exists "Staff read availability" on public.setter_availability;
create policy "Staff read availability" on public.setter_availability
  for select to authenticated
  using (get_my_role() = any (array['setter', 'rep', 'vp_sales', 'admin', 'owner']));

-- Updates: staff only. The trigger below limits what non-admins may change.
drop policy if exists "Setters update availability" on public.setter_availability;
drop policy if exists "Staff update availability" on public.setter_availability;
create policy "Staff update availability" on public.setter_availability
  for update to authenticated
  using (get_my_role() = any (array['setter', 'rep', 'vp_sales', 'admin', 'owner']))
  with check (get_my_role() = any (array['setter', 'rep', 'vp_sales', 'admin', 'owner']));

-- Non-admins may only book or release a slot (lib/slots.ts claimSlot /
-- releaseSlot); time, owner and block state are admin/owner only.
-- service_role routes and the SQL editor pass through.
create or replace function public.guard_setter_availability_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if coalesce(public.get_my_role() in ('admin', 'owner'), false) then
    return new;
  end if;
  if new.id           is distinct from old.id
  or new.date         is distinct from old.date
  or new.time_slot    is distinct from old.time_slot
  or new.owned_by     is distinct from old.owned_by
  or new.created_by   is distinct from old.created_by
  or new.created_at   is distinct from old.created_at
  or new.is_blocked   is distinct from old.is_blocked
  or new.blocked_note is distinct from old.blocked_note then
    raise exception 'only an administrator can change a slot''s time, owner or block'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_setter_availability_update on public.setter_availability;
create trigger guard_setter_availability_update
  before update on public.setter_availability
  for each row execute function public.guard_setter_availability_update();

commit;

-- After applying, expect four policies (Owners manage availability, Admins can
-- delete availability, Staff read availability, Staff update availability)
-- and one enabled trigger:
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'setter_availability';
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.setter_availability'::regclass and not tgisinternal;
-- Rollback (restores the original policies exactly):
--   begin;
--   drop trigger guard_setter_availability_update on public.setter_availability;
--   drop function public.guard_setter_availability_update();
--   drop policy "Staff read availability" on public.setter_availability;
--   drop policy "Staff update availability" on public.setter_availability;
--   create policy "All authenticated read availability" on public.setter_availability
--     for select to public using (auth.uid() is not null);
--   create policy "Setters update availability" on public.setter_availability
--     for update to public using (auth.uid() is not null);
--   commit;
