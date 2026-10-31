-- Step 6: allow setters to read (not write) other profiles.
--
-- Run this by hand in the Supabase SQL editor (same as prior migrations —
-- there's no CLI runner in this repo).
--
-- STATUS: applied directly via the Supabase dashboard Policies UI in
-- production 2026-09-15 (not run as a raw SQL script — recorded here for
-- history/tracking, matching the pattern from 005).
--
-- BUG FOUND: the `profiles` table only had two SELECT policies —
-- profiles_select_own (auth.uid() = id) and profiles_select_admin
-- (get_my_role() = ANY (ARRAY['admin', 'owner'])). No policy ever granted
-- 'setter' visibility into any other profile row, including the owner's.
-- app/setter/page.tsx's fetchData() depends on reading other profiles
-- (`.from('profiles').select('*').in('role', ['owner','admin','vp_sales','rep'])`)
-- to find whose calendar to show — for any setter-role account, RLS
-- silently returned zero rows, which emptied `accessibleRepIds` and broke
-- both the real Calendar tab (setter_availability query) and the sidebar
-- "Next 7 Days" widget. This affected every setter account, not a specific
-- test account — confirmed live with a real setter-role session
-- (founder@example.com) before and after this fix.
--
-- FIX: widen profiles_select_admin to also include 'setter', mirroring the
-- precedent set in 005 for the three "Reps view all ..." SELECT policies on
-- prospects/prospect_activities/prospect_stage_history (SELECT is
-- role-based/broad; writes stay ownership-based via the separate
-- profiles_update_own policy, untouched here).

alter policy "profiles_select_admin"
on "public"."profiles"
to public
using (
  (get_my_role() = ANY (ARRAY['admin'::text, 'owner'::text, 'setter'::text]))
);

-- Verified live 2026-09-15: reloaded /setter as founder@example.com
-- (role setter) after applying — Calendar tab immediately showed real
-- setter_availability slots, and the sidebar "Next 7 Days" widget populated
-- correctly, both previously empty.
