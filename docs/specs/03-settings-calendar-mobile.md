# Feature spec: Settings, Calendar view, Mobile

**Status: proposed. Four scope questions were answered directly by the
planner (recorded in section 7 as "Decided") before this document was
written. Section 7 also lists smaller open questions this session had to
raise to write a real data model and screens — per `docs/specs/README.md`,
nothing beyond schema gets built until those are answered too.**

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

**Settings, new columns needed — reminder cadence has nowhere to live
today:**
The digest's day/time is not a stored value at all; it's the cron
schedule string in `vercel.json` (`"0 10 * * 2"`), fixed at deploy time.
The urgency window is a literal `7` passed into `buildDigest`. Making
either planner-editable needs somewhere to store it. Proposed, pending
question 1: explicit typed columns on `weddings`, matching this schema's
existing convention of typed columns over jsonb blobs (nothing in
`0001`–`0006` uses a jsonb settings bag):

```sql
alter table public.weddings
  add column reminder_day_of_week smallint not null default 2   -- 0=Sunday .. 6=Saturday, default Tuesday
    check (reminder_day_of_week between 0 and 6),
  add column reminder_window_days smallint not null default 7
    check (reminder_window_days > 0);
```

**Load-bearing constraint this raises, not a nice-to-have:** Vercel's cron
still only pings `/api/cron/reminders` on its own fixed schedule
(`vercel.json`, which no session can redeploy on its own — same class of
"outside what a session can reach" as the Vercel env vars in
`docs/HANDOFF.md`'s "THE ACTUAL BLOCKER"). Storing `reminder_day_of_week`
does **not** move when Vercel actually invokes the endpoint. See question
2 for how the digest logic should reconcile a stored day that doesn't
match the day the cron actually fires on.

**Calendar view:** no schema change. Reads `v_timeline_items` exactly as
`/timeline` does.

**Mobile:** no schema change.

One migration if question 1 is answered as proposed:
`0007_settings.sql` — two columns, both with safe defaults matching
today's hardcoded values, so existing behavior is unchanged until someone
actually opens `/settings` and changes them.

## 4. Screens

- **`/settings`** — new route, four sections on one page (no sub-tabs
  needed for this many fields): Wedding basics, Cut lines & capacity,
  Reminders, List appearance. Every field a plain form input except cut
  lines — see question 3 for why that one isn't a raw text box.
- **`/calendar`** — new route. Month grid, prev/next month controls, a day
  cell lists that day's `v_timeline_items` rows color-coded by list
  (matching `/timeline`'s existing convention), drag a card to another day
  to reschedule. Overdue items (past due, not done) and due-soon items
  (within `reminder_window_days`) get the same visual treatment
  `buildDigest` already buckets them into, so the calendar, the dashboard
  tiles, and the email digest can never disagree about what counts as
  urgent — same invariant spec 02 built for the dashboard/email pairing.
- **`Nav`** (`src/components/nav.tsx`) — needs a collapsed mobile variant
  below a breakpoint; see question 6 for which pattern.
- **Existing screens** (`/guests/rank`, `/board`, `/lists/[id]`,
  `/timeline`) — no route changes. Layout adjustments for phone width, and
  a non-drag alternative wired in alongside (not replacing) each existing
  `@dnd-kit` interaction; see question 7.

## 5. Server actions & queries — proposed, not built

- `updateWeddingSettings(weddingId, patch)` — new action in
  `src/server/actions/wedding.ts` (or wherever the wedding-level actions
  end up). Validates capacity (`> 0` or null), timezone (a real IANA
  string), the two reminder columns (0–6, `> 0`), and — critically — does
  **not** accept a raw `cut_rank` / `tier_b_rank` string from the client.
  It accepts a household id to place the cut line relative to, and calls
  the existing `rankBetween()` from `src/lib/rank.ts` server-side, the same
  helper `/guests/rank`'s drag handler already uses. A client-supplied raw
  rank string could violate the "never ends in `0`" rule
  (`docs/HANDOFF.md` section 5, point 3) or the `COLLATE "C"` ordering
  assumption (point 2); going through `rankBetween()` makes that
  structurally impossible instead of validated after the fact.
- `updateListAppearance(listId, { color, icon })` — likely not a new
  action at all: `updateList(listId, patch)` already exists in
  `src/server/actions/lists.ts` and takes an arbitrary patch. Worth
  confirming during build whether it already covers `color`/`icon`
  untouched, before writing a second action that does the same thing.
- Reused, unchanged: `setDueDate(itemId, dueDate)` for calendar drag —
  exactly what `/timeline`'s own drag-to-reschedule already calls.
  `getTimelineItems` / `getTimelineSummary` for calendar data and urgency
  highlighting.
- `/api/cron/reminders` — one-line change if question 1/2 land as
  proposed: pass `wedding.reminder_window_days` into `buildDigest` instead
  of the current literal `7`. The day-of-week field only matters if
  question 2 decides the digest loop should check it and skip a
  mismatched fire — see question 2.

## 6. Test plan

- Unit tests for `updateWeddingSettings`'s validation, especially that a
  cut-line update always routes through `rankBetween()` and never accepts
  a raw string.
- `verify-migrations.sh` gets two new column assertions plus their
  defaults, if `0007_settings.sql` ships.
- Calendar month-grid date math as pure functions in `src/lib/` (which
  items land in which day cell across month boundaries and timezones) —
  same convention as `src/lib/lists/generate.ts`'s and
  `src/lib/reminders/digest.ts`'s existing unit-test-first pattern.
- **What no automated check can substitute for, and shouldn't be reported
  as done without:** the mobile pass and the touch-drag fallback. Everything
  in `docs/HANDOFF.md` section 2 about "type-checks and builds" not proving
  a screen renders or behaves correctly applies doubly here — phone-width
  layout and touch interaction are exactly what `typecheck`/`npm
  test`/`npm run build` cannot see.

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

**Still open — raised while writing this spec, not yet answered:**

1. **Cadence storage shape.** Explicit typed columns (`reminder_day_of_week`,
   `reminder_window_days`) as proposed in section 3, or a jsonb settings
   column? Recommend explicit columns — matches every other table in this
   schema and keeps `verify-migrations.sh` able to assert real constraints
   (`between 0 and 6`, `> 0`) instead of validating jsonb shape in
   application code.
2. **What happens when the stored cadence doesn't match when Vercel's cron
   actually fires?** The cron schedule itself (`vercel.json`) cannot be
   changed by a session — same blocker class as the Vercel env vars in
   `docs/HANDOFF.md`. Two options: (a) the digest loop checks "is today
   the stored `reminder_day_of_week`?" and skips entirely if not — meaning
   changing the setting to a day other than Tuesday silently stops the
   digest from sending until someone also asks the planner to edit
   `vercel.json`; (b) drop day-of-week from settings entirely, keep only
   `reminder_window_days` as editable, and document plainly that the send
   *day* is a deploy-time setting, not a runtime one. Recommend (b) — it's
   honest about what a session can and can't change, and avoids a setting
   that looks live but silently breaks sending.
3. **Cut-line editing UI.** A picker ("move the cut line to below
   [household name]"), which is what section 5 assumes and is safe by
   construction — or a raw numeric/text rank field, which is faster to
   build but can violate the collation/dead-end rules in
   `docs/HANDOFF.md` section 5 if not routed through `rankBetween()`
   regardless. Recommend the picker; a text field for a fractional-index
   string was never meant to be human-edited.
4. **List color/icon editing: fixed palette or free picker?** A free color
   picker can produce something that clashes with the serif/cream
   aesthetic already in `src/lib/email/templates.ts` and the print sheet,
   or that reads poorly once it shows up as a colored border on the new
   calendar. Recommend a small fixed palette (6–8 swatches) rather than
   `<input type="color">`.
5. **Mobile nav pattern.** Bottom tab bar (common on mobile, good thumb
   reach, but this app has nine nav destinations — too many for a tab bar
   without an overflow menu) vs. a hamburger/drawer (matches the existing
   desktop link-row conceptually, less redesign, standard for
   nine-plus-destination nav). Recommend hamburger/drawer given the link
   count.
6. **Touch-drag fallback pattern**, for all four drag surfaces (rank list,
   list reorder, timeline drag, board columns) plus this spec's calendar
   drag. Options: explicit Move up/down buttons per row (simplest, most
   predictable, least "native" feeling); a long-press context menu with
   "Move to…"; or a "..." menu per item with the same. Recommend Move
   up/down buttons for ordered lists (rank, list sections) and a "Move
   to…" picker for anything with more than adjacent-swap semantics (board
   status, calendar day, timeline date) — a swap doesn't make sense when
   the destination isn't "next to where it is now."

Nothing in section 3's migration or section 5's actions should be built
until at least questions 1–3 are answered — they change the shape of the
column set and the settings action's contract. Questions 4–6 affect UI
only and can be decided (or iterated) after the schema ships.

## 8. Status

Not built. This document exists to be answered, per
`docs/specs/README.md`'s process: once section 7's remaining questions get
folded in as "Decided," build proceeds in the order settings → calendar →
mobile pass, matching how spec 02 built on top of spec 01's view rather
than in parallel — the mobile pass in particular should come last since it
touches every screen settings and calendar add, not before them.
