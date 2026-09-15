-- ===========================================================================
-- 0007: Settings
-- ===========================================================================
-- One column. See docs/specs/03-settings-calendar-mobile.md.
--
-- Every other value the new /settings screen edits already exists as a
-- column (weddings.cut_rank, tier_b_rank, capacity, timezone, wedding_date,
-- rsvp_lock_at, invite_send_on; lists.color, icon) — this migration adds a
-- UI over them, not new schema. The one genuinely missing value is the
-- reminder digest's urgency window, which was a literal `7` in
-- src/lib/reminders/digest.ts with nowhere for a planner to change it.
--
-- Deliberately NOT added here: a reminder "day of week" column. The digest
-- send day is still entirely `vercel.json`'s fixed cron schedule (Tuesdays,
-- 10:00 UTC) — no session can redeploy that on its own, the same class of
-- "outside what a session can reach" as the Vercel env vars documented in
-- docs/HANDOFF.md's "THE ACTUAL BLOCKER". A stored day-of-week that doesn't
-- actually move when the cron fires would be a setting that looks live and
-- silently does nothing — see spec 03 section 7, decision 2.
-- ===========================================================================

alter table public.weddings
  add column reminder_window_days smallint not null default 7
    check (reminder_window_days > 0);
