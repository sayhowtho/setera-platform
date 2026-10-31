-- Step 30: calendar slot guards (Alex, 2026-10-02).
--
-- Bug: High Table → Calendar → Generate inserted every slot in its window
-- without checking what already existed, so clearing a day that had a booked
-- 10:00 AM slot and regenerating created a second, open 10:00 AM slot. The
-- app now skips any time that already has a slot (lib/slots.ts); these two
-- unique indexes make the database refuse the same mistakes:
--
--   1. setter_availability_one_per_time — one slot per owner, date and time.
--   2. appointments_one_live_per_slot — at most one live (not Cancelled)
--      appointment per slot, so two people can't both book the same slot.
--      Cancelled appointments keep their availability_id and don't count, so
--      a cancelled slot can be booked again.
--
-- Before applying: remove any existing duplicate (owned_by, date, time_slot)
-- rows (prod had exactly one, an open 10:00 AM slot on 2026-10-04 next to the
-- booked one; back it up first). If a duplicate is still there, index 1 fails
-- and the whole transaction rolls back — nothing half-applied.
--
-- Applied by hand in the SQL editor: staging first, then production.

begin;

create unique index if not exists setter_availability_one_per_time
  on public.setter_availability (owned_by, date, time_slot);

create unique index if not exists appointments_one_live_per_slot
  on public.appointments (availability_id)
  where availability_id is not null and status <> 'Cancelled';

commit;

-- Check: both indexes exist.
select indexname from pg_indexes
where indexname in ('setter_availability_one_per_time', 'appointments_one_live_per_slot');
