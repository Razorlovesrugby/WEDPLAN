# Feature spec: Settings, Calendar view, Mobile

**Status: built. Four scope questions were answered directly by the
planner; the six smaller questions section 7 raised while writing this
spec were never answered directly either, so — same posture spec 02 took
in its own section 7 — this build picked the reading needing the fewest
new decisions later (recorded in section 7 as "Decided") and built against
it: `0007_settings.sql`, the settings/cut-line/list-appearance actions,
`/settings`, `/calendar`, the mobile nav, and touch-friendly fallbacks for
every drag surface. See the status note at the end for what that build
covers and what it doesn't.**

## 1. What this adds

Three gaps, all flagged in `docs/HANDOFF.md` rather than in a spec until
now:

- **Settings.** Several wedding-level values only exist today as a drag
  interaction (`weddings.cut_rank` / `tier_b_rank`, via `/guests/rank`), a
  hardcoded constant (`REMINDER_GAP_DAYS`, the 7-day digest window, the
  Tuesday 10:00 UTC cron schedule in `vercel.json`), or a raw SQL edit
  (`wedding_date`, `rsvp_lock_at`, `invite_send_on`, all set once in
  `bootstrap.sql`). None of that is wrong, but none of it is something the
  planner can change without either dragging a row or asking a session to
  run SQL. This gives those values one screen.
- **Calendar view.** `/timeline` is a chronological list with zoom levels,
  not a calendar grid. A month view is a more familiar surface for "what's
  happening this month," and reminders' overdue/due-soon logic (spec 02)
  currently only surfaces on the dashboard and in the weekly email — never
  on anything resembling a calendar.
- **Mobile.** `docs/HANDOFF.md` section 2 has flagged since session 6 that
  almost nothing has been opened in a browser, let alone at phone width.
  Ad hoc responsive classes exist in several screens, but there is no
  deliberate mobile nav and no touch-friendly alternative to the three
  existing drag surfaces (list reorder, timeline drag-to-reschedule, board
  drag-between-columns) — exactly the class of bug that already cost two
  fixes on `/guests/rank` (CSS containment, a clamping modifier).

## 2. Scope

**In:**
- `/settings`: wedding basics (name, date, timezone, RSVP lock date,
  invite send date), cut lines + capacity, reminder cadence + urgency
  window, per-list color/icon.
- `/calendar`: month grid, reading `v_timeline_items` (same view
  `/timeline` and the reminders digest already read), drag-to-reschedule
  via the existing `setDueDate` action, overdue/due-soon items visually
  marked using the same bucketing `buildDigest` already does.
- Mobile: a responsive pass across every existing screen, a mobile nav
  (the current `Nav` component is a plain wrapping link row with no
  collapse behavior), and a non-drag alternative for all three existing
  drag interactions plus this spec's new calendar drag.

**Out, explicitly:**
- No new business concepts. Settings is an editing UI over columns and
  constants that already exist — it does not introduce anything the app
  doesn't already track, except where section 3 below says a value
  currently has nowhere to live at all (reminder cadence).
- Calendar does not replace `/timeline` — decided, section 7.
- No native app, no PWA install prompt. "Mobile" means the existing
  Next.js app responsive at phone width, not app packaging.
- No per-collaborator permissions in settings. Both collaborators can edit
  everything, matching every other screen's model — V1 never built roles,
  and this isn't the feature to start.

## 3. Data model

**Settings, no new table:**
- `weddings.cut_rank`, `tier_b_rank`, `capacity`, `timezone`, `wedding_date`,
  `rsvp_lock_at`, `invite_send_on` — all already columns (`0001_core_schema.sql`).
  Settings adds a UI and a server action; no migration.
- `lists.color`, `lists.icon` — already columns (`0004_lists.sql`). Same:
  UI only.

**Settings, new column needed — the urgency window has nowhere to live
today:**
The digest's send day/time is the cron schedule string in `vercel.json`
(`"0 10 * * 2"`), fixed at deploy time, and stays that way (decided,
section 7, question 2) — no session can redeploy that on its own, same
class of "outside what a session can reach" as the Vercel env vars in
`docs/HANDOFF.md`'s "THE ACTUAL BLOCKER". Only the urgency window (today a
literal `7` passed into `buildDigest`) becomes a stored, editable value:

```sql
alter table public.weddings
  add column reminder_window_days smallint not null default 7
    check (reminder_window_days > 0);
```

**Calendar view:** no schema change. Reads `v_timeline_items` exactly as
`/timeline` does.

**Mobile:** no schema change.

One migration: `0007_settings.sql` — one column, with a safe default
matching today's hardcoded value, so existing behavior is unchanged until
someone actually opens `/settings` and changes it.

## 4. Screens

- **`/settings`** — new route, four sections on one page (no sub-tabs
  needed for this many fields): Wedding basics, Cut lines & capacity,
  Reminders, List appearance. Every field a plain form input except cut
  lines — see section 7, decision 3, for why that one isn't a raw text box.
- **`/calendar`** — new route. Month grid, prev/next month controls, a day
  cell lists that day's `v_timeline_items` rows color-coded by list
  (matching `/timeline`'s existing convention), drag a card to another day
  to reschedule. Overdue items (past due, not done) and due-soon items
  (within `reminder_window_days`) get the same visual treatment
  `buildDigest` already buckets them into, so the calendar, the dashboard
  tiles, and the email digest can never disagree about what counts as
  urgent — same invariant spec 02 built for the dashboard/email pairing.
- **`Nav`** (`src/components/nav.tsx`) — a collapsed mobile variant below
  a breakpoint; see section 7, decision 5, for which pattern.
- **Existing screens** (`/guests/rank`, `/board`, `/lists/[id]`,
  `/timeline`) — no route changes. Layout adjustments for phone width, and
  a non-drag alternative wired in alongside (not replacing) each existing
  `@dnd-kit` interaction; see section 7, decision 6.

## 5. Server actions & queries — built

- `updateWeddingSettings(fields)` — new action,
  `src/server/actions/settings.ts`. Validates name, wedding date, timezone
  (`Intl.DateTimeFormat` constructor as the real-IANA-zone check),
  `rsvp_lock_at` (through the existing `zonedInputToUtc()`, same as
  `saveEvent()`), invite send date, and `reminder_window_days` (1–90). Does
  **not** touch `cut_rank` / `tier_b_rank` — see below.
- Cut lines and capacity are **not** a new action: `setCutLine(householdId,
  which)` and `setCapacity(capacity)` already existed in
  `src/server/actions/rank.ts` (built for `/guests/rank`'s drag UI) and do
  exactly what section 3's safety requirement needs — `setCutLine` reads
  the chosen household's own `rank` server-side and stores that, so it
  never accepts a rank string from the client at all. `/settings` imports
  and reuses both directly rather than re-implementing the same
  validation a second time.
- List appearance is **not** a new action either, confirming the guess
  this spec made: `updateList(listId, patch)` in
  `src/server/actions/lists.ts` already accepted `color`/`icon` untouched.
  Its `color` field was tightened from free text to
  `z.enum(LIST_COLOR_PALETTE values)` to make decision 4 (picker only)
  true at the validation layer, not just in the UI — see
  `src/lib/list-colors.ts`.
- Reused, unchanged: `setDueDate(itemId, dueDate)` for calendar drag —
  exactly what `/timeline`'s own drag-to-reschedule already calls.
  `getTimelineItems` for calendar data; `getTimelineSummary` gained a
  `windowDays` parameter so the dashboard tiles read the wedding's own
  `reminder_window_days` instead of a hardcoded `7`.
- `/api/cron/reminders` — `wedding.reminder_window_days` is now selected
  and passed into `buildDigest` instead of the previous literal `7`. No
  change to when the cron fires — that stays `vercel.json`'s fixed
  schedule, per decision 2.

## 6. Test plan

- ~~Calendar month-grid date math as pure functions in `src/lib/`~~ —
  done, `src/lib/calendar.test.ts` (10 tests): month-start normalisation,
  forward/back across year boundaries, Monday-first grid construction,
  every day of the target month present and marked `inMonth`, leading/
  trailing padding from neighbouring months marked correctly, always a
  whole number of weeks, and the month-label formatter.
- `updateWeddingSettings`'s field validation (timezone, dates,
  `reminder_window_days` bounds) is inline `zod` in the action itself, same
  as `saveEvent()`'s `eventSchema` — this codebase's existing convention is
  to pull only non-trivial logic out to `src/lib/` for direct unit testing
  (`rankBetween`, `buildDigest`), not every field schema, so this wasn't
  extracted either, matching `events.ts`.
- Cut lines and capacity aren't newly tested because they aren't newly
  built — `setCutLine`/`setCapacity` are exactly the functions
  `/guests/rank` already exercises.
- `verify-migrations.sh` — still 70 assertions (0007 adds one column with
  a default and a check constraint to an existing tenant table, not a new
  one, so nothing new to assert there — same shape as 0006).
- **What no automated check can substitute for, and shouldn't be reported
  as done without:** the mobile pass and the touch-drag fallback. Everything
  in `docs/HANDOFF.md` section 2 about "type-checks and builds" not proving
  a screen renders or behaves correctly applies doubly here — phone-width
  layout and touch interaction are exactly what `typecheck`/`npm
  test`/`npm run build` cannot see, and none of it has been opened in a
  browser — see section 8.

## 7. Open questions

**Decided directly by the planner, this session:**

1. **Settings scope.** All four: cut lines/capacity/timezone, reminder
   cadence + urgency window, list colors/icons, wedding date + RSVP lock
   date.
2. **Calendar vs. `/timeline`.** New `/calendar` screen, additive —
   `/timeline` stays as it is.
3. **Calendar drag.** Yes, drag-to-reschedule, same as `/timeline`.
4. **Mobile scope.** Full: every screen responsive, plus a touch-friendly
   alternative for every existing (and new) drag surface — not
   desktop-only, not read-only.

**Decided — no planner session answered these directly, so, per the same
posture spec 02 took in its own section 7, this build picked the reading
that needs the fewest new decisions later and is most honest about what a
session can actually change:**

1. **Cadence storage shape.** Explicit typed column, not jsonb — matches
   every other table in this schema and keeps `verify-migrations.sh` able
   to assert a real constraint instead of validating jsonb shape in
   application code.
2. **Reconciling an editable cadence with Vercel's fixed cron schedule.**
   Decided per the spec's option (b): **no `reminder_day_of_week` column
   at all.** Only `reminder_window_days` is stored and editable. The send
   *day* stays a deploy-time setting (`vercel.json`, Tuesday 10:00 UTC,
   unchanged) — `/settings` says so in the UI copy rather than exposing a
   day field that would look live but not actually move the cron. This
   also shrinks section 3's migration to one column, not two.
3. **Cut-line editing UI.** The picker — "move the cut line to below
   [household name]," resolved server-side through `rankBetween()`. No raw
   rank text field, ever.
4. **List color/icon editing.** A small fixed palette of eight named
   swatches (`src/lib/list-colors.ts`, built on `tailwind.config.ts`'s
   existing `accent`/`tierA`/`tierB`/`tierC` hues), not a free color
   picker — keeps every list color legible against the serif/cream
   aesthetic already in `src/lib/email/templates.ts` and usable as a
   calendar-day accent border. Icon is a plain short text field (emoji),
   since unlike color it has no legibility failure mode to guard against.
5. **Mobile nav pattern.** Hamburger/drawer, not a bottom tab bar — nine
   nav destinations is too many for a tab bar without its own overflow
   menu, and a drawer is the smaller change from today's link row.
6. **Touch-drag fallback pattern.** Move up/down buttons for
   adjacent-swap surfaces (rank list, list-section reorder); a "Move to…"
   picker for anything where the destination isn't "next to where it is
   now" (board status, calendar day, timeline date).

Section 3's migration and section 5's actions were written against
decisions 1–3 above. Built in the order: migration → actions → `/settings`
→ `/calendar` → mobile nav → mobile responsive pass + touch fallbacks
(last, since it touches every screen the other pieces added).

## 8. Status, verified this session

- `0007_settings.sql` applied cleanly against a throwaway cluster;
  `verify-migrations.sh` (still 70 assertions) and `verify-bootstrap.sh`
  both green.
- `src/lib/calendar.test.ts` — 10 new unit tests for the month-grid date
  math. `npm test` is 181 tests passing (10 of them new).
- `npm run typecheck` and `npm run build` both green with `/settings` and
  `/calendar` in the build's route list.
- Built: `0007_settings.sql`; `src/server/actions/settings.ts`
  (`updateWeddingSettings`); `src/lib/list-colors.ts` and the tightened
  `color` validation in `src/server/actions/lists.ts`; `src/lib/calendar.ts`
  (month-grid math); `/settings`
  (`src/app/(planner)/settings/page.tsx` plus
  `src/components/settings/*`); `/calendar`
  (`src/app/(planner)/calendar/page.tsx`,
  `src/components/lists/calendar-view.tsx`); the mobile hamburger/drawer
  in `src/components/nav.tsx`; Move up/down buttons in
  `src/components/rank/rank-list.tsx` and
  `src/components/lists/list-detail.tsx`; a "Move to…" column select in
  `src/components/lists/board-view.tsx`; a tap-to-reveal date field on
  each calendar card as its own "Move to…" fallback (a permanently open
  date input doesn't fit a day cell at phone width, so this differs
  slightly from the button-only description in decision 6 above — the
  destination-picker *principle* is the same, just reached through a
  toggle instead of an always-visible field). List `icon` also got its
  first real render, in the lists sidebar and the list detail header —
  the column existed since spec 01 but nothing had ever displayed it.

**Not verified, and can't be from here — same gap as specs 01 and 02:**
none of this has been applied to the live project or opened in a real
browser. The mobile responsive pass and every touch-drag fallback in
particular are exactly the class of thing `docs/HANDOFF.md` section 2
warns can pass every automated check and still be broken on screen — see
that section's note on the two real `/guests/rank` bugs that only showed
up once someone looked. Nothing here has had that look yet.
