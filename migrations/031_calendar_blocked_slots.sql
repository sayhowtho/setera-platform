-- Step 31: blocked calendar slots (Alex, 2026-10-03).
--
-- High Table → Calendar can now mark a single open slot (or a range) busy,
-- with an optional note ("dentist", "client call"). A slot is in one of three
-- states:
--
--   Open    is_booked = false, is_blocked = false   (bookable)
--   Booked  is_booked = true,  is_blocked = false   (a real demo)
--   Blocked is_booked = true,  is_blocked = true    (Alex marked it busy)
--
-- A blocked slot keeps is_booked = true on purpose: every slot picker
-- (setter Calendar, rep portal, High Table Book Demo, the Next 7 Days widget)
-- already shows only is_booked = false, so blocked slots are hidden from all
-- of them with no change, and blocking uses the same open -> taken
-- conditional update as booking (lib/slots.ts), so a block and a booking can't
-- both win the same slot. The check constraint keeps it that way: a blocked
-- slot can never look open.
--
-- Unblock sets both flags back to false and clears the note. Clear day and
-- Clear All Open Slots still delete only is_booked = false rows, so they
-- leave blocked slots alone; Generate skips times that already have a slot,
-- so it never overwrites a block.
--
-- Applied by hand in the SQL editor: staging first, then production.

begin;

alter table public.setter_availability
  add column if not exists is_blocked   boolean not null default false,
  add column if not exists blocked_note text;

alter table public.setter_availability
  drop constraint if exists setter_availability_blocked_is_taken;
alter table public.setter_availability
  add constraint setter_availability_blocked_is_taken check (not is_blocked or is_booked);

commit;

-- Check: both columns and the constraint exist.
select column_name from information_schema.columns
where table_name = 'setter_availability' and column_name in ('is_blocked', 'blocked_note');
select conname from pg_constraint where conname = 'setter_availability_blocked_is_taken';
