# Handoff

**Living document.** Rewritten at the end of each work chunk. It holds the current state and the three most recent sessions. Older sessions are in [`history/sessions.md`](history/sessions.md). A new session needs this file and `docs/wedding-platform-spec.md`.


## Start here (read this first)

**What this is.** WEDPLAN: a wedding planning platform for a couple and their collaborators. Next.js App Router on Vercel, Supabase (Postgres, Auth, RLS keyed to `wedding_id`), TypeScript, Vitest. `README.md` is the overview; `docs/wedding-platform-spec.md` is the technical spec; `docs/specs/README.md` is the index of per-feature specs and how the spec process works.

**Where it stands.** Specs 1–40 are built or in progress, with per-spec status in `docs/specs/README.md` (lists and timeline, reminders, guests and households, budget, moodboards, public site builder, invitations and RSVP, registry, seating, audit log and backups, self-serve onboarding). Specs 41–46 (app shell, guest journey, inbox, inspector, no-drag pass, command palette) are proposals only; nothing is built and their open questions are unanswered. Migrations run `0001`–`0045`; the planner says `0044` and earlier are applied to the live project and `0045` is not (not checked by any session).

**What has and hasn't been verified.** Typecheck, unit tests, the SQL suite (`./scripts/verify-migrations.sh`) and `npm run build` pass. Some screens were rendered in headless Chromium with sample data. Nothing has been checked against live Supabase data, on a real phone, or by a real user unless a session below says so. Do not imply otherwise to the planner.

**How to work here.**
- Rules and conventions are in `CLAUDE.md`; section 8 below has the full convention list. A spec request is not a build request.
- Verify with `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (non-root user) and `npm run build`, and say which you ran.
- At the end of a work chunk, rewrite the "Recent sessions" block below (keep about three), and move older entries to [`history/sessions.md`](history/sessions.md).

**Map of this file.** Recent sessions (next) → Active work → 0 Live project → 1 What exists → 2 What has NOT been verified → 3 Where this veered off the spec → 4 What is left → 5 Things worth knowing before changing anything → 6 Traps → 7 Deliberate exceptions → 8 Conventions → 9 Open questions.

---

## Recent sessions

**Session 53 (spec 45):** no-drag and iPad pass, built on branch `claude/nice-mccarthy-x93m9s` (**no
PR opened**). Read the spec's §10:

- **Every `DndContext` must use `useDragSensors()`** (`src/components/ui/use-drag-sensors.ts`), or
  `drag-sensors.test.ts` fails. Put `{...stopDrag}` on any control inside a draggable element.
- **The ⋯ move menu** is `RowMenu` + `moveItems` (`src/components/ui/row-menu.tsx`).
- **Touch sizes** are CSS under `@media (pointer: coarse)`, scoped to `[data-planner]` (set on
  `ShellFrame`).
- **`npm run a11y`** checks pages with axe-core, report only. `axe-core` is a new dev dependency;
  `npm ci` picks it up.
- **Verified:** typecheck, 1395 unit tests, build, a11y on public pages, an emulated iPad.
  **Not verified:** a real iPad, Supabase.

**Session 52 (spec 46, spec 45 answers):** ⌘K and shortcuts, built on branch
`claude/nice-mccarthy-x93m9s` (**no PR opened**). Spec 45 got two answers ("make iPad friendly",
report-only check), then the planner chose to do 46 first; **45 is not built**. Read 46's §11:

- **⌘K** is `src/components/shell/command-palette.tsx` (mounted in the planner layout). Its rules are
  in `src/lib/command-palette.ts`, its search in `src/server/queries/search.ts` via the
  `searchPalette` action. **Go to is built from `nav-groups`**, so a new sidebar entry appears there
  automatically.
- **Shortcuts** (`src/lib/shortcuts.ts`) are listened for in `ShellFrame`.
- **Verified:** typecheck, 1379 unit tests, build, the dialog and keys on a sample page.
  **Not verified:** Find against Supabase; creating from the box.

**Session 51 (spec 44):** the side panel and the registry's "Use the invitation's look", built
on branch `claude/nice-mccarthy-x93m9s` (**no PR opened**). Scope narrowed first, three questions
(switch off by default, all four panels, "Both"), then built. Read the spec's §11:

- **`0046_registry_use_site_theme.sql` is new and not applied to the live project.** Code reads it
  tolerantly (`select *`, the form only sends the switch once changed), but turning the switch on
  needs the migration.
- **The side panel** is `src/components/shell/inspector.tsx`, mounted in `ShellFrame`. A row opens
  it with `useInspector().openInspector("task:<id>")` and renders `<InspectorPortal>`; a server page
  renders `<InspectorPortal closeHref>` when its URL says so.
- **Rows unchanged after the follow-up** ("remove clicks"): task controls and budget payments stay
  inline as before spec 44. The panel holds task notes (new), a budget line's edit form, vendors and
  the ⋯ settings.
- **Guest-facing files changed:** `/registry/<slug>` and its preview image, `lib/registry/look.ts`,
  `server/registry/public.ts`. They're behind the switch, which is off everywhere.
- **Verified:** typecheck, 1361 unit tests, 774 SQL assertions, single-tx, bootstrap, build, the
  panel on a sample page. **Not verified:** Supabase, real rows in the panel, the switch.

**Session 50 (spec 43):** Inbox and Today, built on branch `claude/nice-mccarthy-x93m9s` (**no PR
opened**). Four questions, all recommended, then built. No migration. Read the spec's §11:

- **`/inbox`** merges five sources (`src/lib/inbox.ts`, `src/server/queries/inbox.ts`). Each fails
  soft. The sidebar badge is `getInboxNeedsYouCount`, head-only counts run in the planner layout
  on every couple page.
- **Today** is the overview with **Next up** on top (`src/lib/today.ts`); the tiles are unchanged.
- **Verified:** typecheck, 1357 unit tests, `next build`, a sample page in headless Chromium.
  **Not verified:** Supabase; the inbox actions and badge have never run.

**Session 49 (spec 42):** Design and Invitations, built on branch `claude/nice-mccarthy-x93m9s`
(**no PR opened**). The spec was rewritten over four rounds of answers (the invitation is the
website; designing and sending are different jobs; all eight Design tabs, alike; the registry stays
whole), then "Yes go with recommended and build 42". No migration. Read the spec's §13; the short
version:

- **Sidebar "Website" is now "Design"**, eight tabs, all in `DesignFrame`
  (`src/components/design/`). **A new Design tab must render inside `<DesignFrame>`** or
  `nav-groups.test.ts` fails.
- **Invitations is stages × steps** (`?stage=save-the-date|invitation&step=who|send|track`). The
  logic is in `src/lib/invitations/journey.ts`; the `?status=` filters moved there verbatim.
- **Guest links:** `src/lib/guest-links-isolated.test.ts` fails if a guest-facing page (`/w`,
  `/rsvp`, `/i`, `/m`, `/registry`, `/privacy`, the middleware, the root layout) imports
  planner-only code. Nothing guest-facing was edited this session.
- **Verified:** typecheck, 1342 unit tests, `next build` (placeholder env), sample-data screens
  in headless Chromium (temporary page, deleted). **Not verified:** Supabase, real data, the
  preview reloading after a real save, a phone.

**Session 48 (spec 41):** the app shell, built on branch `claude/nice-mccarthy-x93m9s` (**no PR
opened**). "Can you build the first spec, ask me the questions": six questions put and answered
(Q3 against the recommendation: seating stays inside Events), then built. No migration. Read the
spec's §11; the short version:

- **`src/lib/nav-groups.ts` is now the only list of places.** The sidebar, the phone tab bar and
  `/menu` read it. **A new planner page must sit under an entry's `matchPrefixes`** or
  `nav-groups.test.ts` fails (exempt: `/setup`, `/menu`). Longest prefix wins.
- **`src/components/nav.tsx` is gone**; the shell is `src/components/shell/`. `SubTabs` is the
  segmented control; tab lists are in `src/lib/nav-tabs.ts`.
- **Settings is global only.** List appearance → `/lists?panel=appearance`; Pinterest & clipper →
  `/moodboards?panel=import` (the OAuth callback returns there); cut lines were already on Ranking.
- **Verified:** typecheck, 1299 unit tests, `next build` (placeholder env), the shell on a
  temporary sample page in headless Chromium at 1280/390 (deleted). **Not verified:** any real
  page in the new shell, Supabase, a phone. Check the site builder's sticky rail offset.
- **Housekeeping:** `node_modules` was absent, `npm ci` was run.

**Session 47 (specs 41–46, spec only):** a discovery pass on the customer journey ("where
everything lives… feel like an Apple native app"), then "Write all the specs now". **Six
proposals, nothing built, no code or migration touched**, branch `claude/nice-mccarthy-x93m9s`.
One decision taken before writing: laptop first, but easy on a phone and for an AI assistant.
41 (shell, sidebar, tab bar, Settings tidy; no URL changes) goes first; 42–46 sit inside it.
Every spec ends with open questions and recommendations; none answered yet. The facts in them
come from reading the code (no browser, no live data); spec 45's drag table is a text count,
not a test.

**Session 46 (spec 40):** self-serve onboarding plus account, timezone and currency
settings, built on branch `claude/confident-fermat-eali50` (**no PR opened**). Asked for as an
investigation, then a spec, nine questions put and answered (Q3 against the recommendation:
8-character passwords; Q6 a free answer: currency is a symbol only), then "Build the spec out"
as its own turn. The planner says every migration through `0044` is applied to the live project;
not checked by this session. Read the spec's **Build status**; the short version:

- **`0045`.** `weddings.currency` (a label, never converts, always hundredths),
  `create_wedding()` (service role only; the one way a wedding is made, by `/start` and by
  `bootstrap.sql`), `change_wedding_timezone()` (keeps planner-entered wall-clock times). No new
  table, so `planner_table_access` is unchanged.
- **`/start`** is public and gated by **`ONBOARDING_OPEN`** (unset = closed). Public sign-up stays
  off in Supabase; the action makes the login with the admin API, already confirmed (Q2).
- **`todayIso(timeZone)` is now required.** "Today" was the UTC date; every caller now passes the
  wedding's timezone. A new caller has to as well.
- **`formatMoney(minor, currency)` is now required.** Client components get it from
  `useCurrency()` (`CurrencyProvider` in the planner layout), which throws outside the provider.
- **Verified:** typecheck, 1263 unit tests, 770 SQL assertions (740 earlier unchanged), single-tx,
  `verify-bootstrap.sh`, `next build` (placeholder env), `/start` in headless Chromium.
  **Not verified:** anything against Supabase: no sign-up, partner email, password change or
  timezone change has run. **`0045` is not applied to the live project.**

**Session 45 (spec 39):** a third assignee (part B) and a planner login (part C), built on
branch `claude/spec-39-third-assignee` (**no PR opened**). Asked for as a scoping question,
written up as a spec over two rounds, then "Okay let's go defaults and build it all" as its own
turn. Read the spec's **Build status**; the short version:

- **B (`0043`).** `people` (a name; optional `user_id` + `access`), `list_items.assigned_person_id`
  with a check that a task has at most one of that and `assigned_to`. The assign picker speaks
  one string (`u:<id>` / `p:<id>`; `src/lib/people.ts`). Settings → People adds/renames/removes.
- **C (`0044`). The planner is NOT a `collaborators` row**, so `is_collaborator()` and every
  existing policy are untouched. `can_plan()` + `planner_table_access` (one row per table:
  write/read/denied/global) generate additive policies. **A new table must be added to
  `planner_table_access`** or `25_planner_access.sql` fails; a new route directory must be added
  to `src/lib/planner-routes.ts` or its test fails. `weddings.total_budget` is kept out of reach
  by giving the planner no policy on `weddings` and a view, `v_wedding_basics`.
- **Where a planner lands:** nav Overview/Guests/Vendors/Events/Tasks/Moodboards; the couple-only
  sections redirect them (`CoupleOnly`, per-segment `layout.tsx`); vendor money is hidden
  (`showMoney`); `PlannerOverview` replaces the dashboard.
- **Verified:** typecheck, 1236 unit tests, 740 SQL assertions (671 earlier ones unchanged),
  `verify-bootstrap.sh`, `next build` (placeholder env). Two deliberate policy breaks were caught.
  **Not verified:** any browser, Supabase, a second login, the invite email, the set-password
  link. **`0043`/`0044` are not applied to the live project, nor are `0026`-`0042`.**
- **Housekeeping:** `node_modules` was absent, `npm ci` was run.


---

## Active work: lists, timeline, reminders, settings, calendar, mobile — see `docs/specs/`

**The full plan moved out of this file and into one spec per feature.** See
the table near the top of this document, or go straight to
[`docs/specs/README.md`](specs/README.md) for the index and build order.
Schema is `0004_lists.sql` + `0005_lists_status_assignment.sql` (spec 1,
two migrations for one feature: 0004 shipped the core shape, 0005 added
what answering the open questions required — board status, sub-items,
recurrence, assignment), `0006_reminders.sql` (spec 2, one enum value),
and `0007_settings.sql` (spec 3, one column).

Kept here, because it doesn't belong in any one feature's spec:

- **Scope for the whole rebase:** none of lists/timeline, reminders, or
  settings/calendar/mobile need vendors, budget or Gmail — only
  `weddings`, `events` and the collaborators already in place. That's why
  this can ship ahead of V2 rather than as part of it. None of them touch
  `guests`, `households`, `invitations` or `rsvp_*` either — no
  guest-facing work is in scope.
- **This is a narrower slice than the full AI-native product direction**
  floated in an earlier, unmerged planning pass (ingestion, a vigilance
  engine, semantic search). Nothing in `docs/specs/` depends on any of
  that, and nothing there should grow to need it without the planner
  asking again.
- **All three specs are now built end to end** — spec 1 (session 8:
  schema, generation logic, queries/actions, all five screens), spec 2
  (session 9: schema, digest logic, email template, extended cron,
  dashboard tiles), and spec 3 (session 10: schema, settings/cut-line/
  list-appearance actions, `/settings`, `/calendar`, mobile nav,
  touch-drag fallbacks). See each session's note above, and each spec's
  own status block, for what's simplified and what's still unverified —
  nothing in any of them has run against the live project, in a browser,
  or (for spec 2) sent a real email.

### Parked, not cancelled: invitations, vendors, budget, AI

Section 4 below ("What is left, and who can do it") is the prior priority
list — the Vercel Preview build that's never gone green, live Supabase
verification, the sending domain, printing. **All of it is still accurate
and still has to happen before a real invitation goes out.** It's parked,
not fixed. Pick it back up when invitations are back on the roadmap. Until
then, lists/timeline work should not touch `invitations`, `rsvp_*`, or
`message_log`'s existing `invitation` / `reminder` kinds.

---

## 0. Live project

| | |
| --- | --- |
| **Project ref** | `<project-ref>` |
| **URL** | `https://<project-ref>.supabase.co` |
| **Organisation** | unknown — see open question 6 |
| **Migrations** | `0001`, `0002`, `0003` reported applied; `0004` and `0005` written and verified locally, neither yet applied here |
| **Bootstrap** | assumed run — unconfirmed |

**Recorded on the planner's word. No session has ever verified it.** The
Supabase connector in sessions 2 and 3 was scoped to a different organisation
and returned `You do not have permission to perform this action` for this ref,
so not one check query has run against it.

`scripts/verify-live.mjs` exists to close exactly this gap — see section 1.
Run it, then replace this block with what it actually reported.

> **The other project on the account (`<other-project-ref>`) is not this one.** It is an
> unrelated production database for a rugby club app — 29 tables, thousands of
> live rows, 62 migrations of its own. It shares the account and, depending on
> connector scope, may be the *only* project a session can see, which makes it
> exactly the wrong thing to reach for when the wedding project looks absent.
> Never apply these migrations to it, and do not read it "just to check" — the
> planner has asked explicitly that it not be touched. If `list_projects` does
> not return `<project-ref>`, the connector is scoped to the wrong
> organisation: that is a permissions problem to fix, not an empty account.

---

## 1. What exists

### Database — `supabase/migrations/`

Three numbered migrations, applied in order, plus `bootstrap.sql` to create the
first wedding. Full instructions in `supabase/migrations/README.md`.

| # | File | What it creates |
| --- | --- | --- |
| 1 | `0001_core_schema.sql` | 16 tables, enums, indexes, constraints |
| 2 | `0002_row_level_security.sql` | `is_collaborator()`, policies, grants |
| 3 | `0003_derived_views.sql` | `v_households`, `v_household_rsvp`, `v_wedding_stats` |
| 4 | `0004_lists.sql` | Lists, sections, items, list templates, `v_timeline_items` — [spec](specs/01-lists-and-timeline.md) |
| 5 | `0005_lists_status_assignment.sql` | Board status, one-level sub-items, recurrence, assignment — [spec](specs/01-lists-and-timeline.md) |
| 6 | `0006_reminders.sql` | `message_log.kind` gains `'digest'` — [spec](specs/02-reminders.md) |
| 7 | `0007_settings.sql` | `weddings.reminder_window_days` — [spec](specs/03-settings-calendar-mobile.md) |
| 10 | `0010_budget.sql` | Budget categories/items, consumption components, payments, `fx_rates`, section 7's linking tables, `v_budget_items`/`v_budget_summary`/`v_reminders_due`/`v_budget_item_tasks` — [spec](specs/06-budget-management.md) |
| 11 | `0011_budget_manual_quantity.sql` + `0011_budget_manual_quantity_columns.sql` | `budget_quantity_basis` gains `'manual'` (own file — must commit before the second file's column/views can reference it), `budget_items.quantity` — [spec](specs/06.1-budget-quantity-and-task-linking.md) |
| — | `bootstrap.sql` | Your wedding, both collaborators, starting events and questions |

Numbers 8 and 9 are spec 5's (multi-cut lines, day-of run sheet) and don't
exist yet — spec 6 was built first, at the planner's direct request, and
its migration kept the number the spec itself already used
(`0010_budget.sql`) rather than renumbering down. Whoever builds spec 5
next adds `0008_multi_cut_lines.sql` and `0009_run_sheet.sql`, which apply
between `0007` and `0010` in both file order and numeric order — no
ordering hazard, and none of the three touch the same tables regardless.

Tenancy is enforced by composite foreign keys on `(parent_id, wedding_id)`, not
by triggers or by application code. `tier` is derived in a view, never stored.
`households.rank` is a fractional index pinned to `COLLATE "C"`.

### Application — `src/`

| Route | What it does |
| --- | --- |
| `/login` | Email + password, sign-up disabled |
| `/forgot-password`, `/reset-password`, `/auth/callback` | Password reset, by email link |
| `/` | Dashboard; every number links to the list behind it |
| `/guests` | Table, URL-backed filters, inline edit, bulk tagging, CSV export |
| `/guests/import` | CSV import: mapping, dedupe, per-row review |
| `/guests/[id]`, `/households/[id]`, `/households/new` | Detail and editing, each showing that guest's or household's RSVP answers |
| `/guests/rank` | Drag ranking, virtualised, two cut lines, waitlist suggestions |
| `/events` | Event CRUD in the venue's timezone |
| `/questions` | RSVP question builder — type, scope, options, order |
| `/invitations` | Create, send, copy link, WhatsApp text, mute, reissue |
| `/invitations/print` | QR sheet for stationery, in ranking order |
| `/rsvp/[token]` | Public RSVP — no login, throttled, per guest per event |
| `/w` | Public site, thin and noindex |
| `/lists` | Sidebar of lists + smart views (Today, Scheduled, Flagged, All, Assigned to me) |
| `/lists/[id]` | One list: sections, inline add/edit/tick/flag/date/assign, sub-items, drag reorder (within a section) |
| `/timeline` | Every dated item, chronological, week/month/quarter zoom, drag-to-reschedule (snaps to the zoom's bucket) |
| `/calendar` | Month grid of the same dated items, color-coded, drag-to-reschedule, overdue/due-soon marked |
| `/board` | Kanban — Not started / In progress / Done, drag between columns |
| `/budget` | Categories, the four-number table (estimated/quoted/contracted/paid) with variance, per-unit and consumption costing, live FX conversion, a payment schedule, wedding-level totals and per-head figures, and a "Linked" popup per line for spec 6 section 7's task/list linking |
| `/settings` | Wedding basics, cut lines & capacity, reminder window, list color/icon |
| `/setup/plan` | Preview + generate the 175-task timeline template; real empty state with no wedding date |
| `/setup` | Explains the bootstrap step when no wedding is attached |
| `/api/cron/reminders` | Weekly chase of non-responders, plus the reminders digest (spec 2) |
| `/api/export/[kind]` | Guest, household and catering CSV |
| `/api/qr/[invitationId]` | One QR code, PNG or `?format=svg` |

### Checks

```bash
npm run typecheck                 # clean — reconfirmed, session 15
npm test                          # 220 tests passing — reconfirmed, session 15
./scripts/verify-migrations.sh    # 128 SQL assertions, throwaway PG cluster — reconfirmed, session 15
./scripts/verify-bootstrap.sh     # bootstrap on a clean database — reconfirmed, session 15
npm run build                     # reconfirmed, session 15
```

**Session 15 ran all five checks against spec 7's build (no schema change,
so the same migrations as session 14), and every one is green:**
`verify-migrations.sh` is still 128 assertions — spec 7 added no table, no
column, and no view, so nothing new to assert there. `verify-bootstrap.sh`
still creates one wedding and both collaborators cleanly. `npm run
typecheck` is clean across the whole app. `npm test` is 220 tests passing,
same count as before this session — none of spec 7's four parts touch
logic covered by existing unit tests. `npm run build` succeeds and lists
every route, including `/calendar` and `/timeline` at their new sizes for
the click-to-preview popup, in its output.

**Session 13 ran all five checks against `0011_budget_manual_quantity.sql`
on top of session 12's migrations, and every one is green:**
`verify-migrations.sh` is 106 assertions, up from 104 (two new fixture
items in `supabase/tests/03_budget.sql` — an explicit-quantity `manual`
item and a quantity-left-blank one — both computed correctly and the
per-head total stayed unchanged, proving the exclusion rule). `npm test`
is 206 tests passing (3 of them new, in `src/lib/budget.test.ts`). `npm
run build` succeeds and lists `/budget` unchanged in size class alongside
every other route.

**Session 12 ran all five checks against `0010_budget.sql` on top of
session 10's migrations (session 11 built no schema — see its own note),
and every one is green:** `verify-migrations.sh` is 104 assertions, up from
70 (`supabase/tests/03_budget.sql` adds 34: tenancy for all six new tables,
`v_budget_items`/`v_budget_summary`'s computed-value math across all five
quantity bases and a non-base-currency line, `v_reminders_due`'s payment
union, `v_budget_item_tasks`' dedup rule). `verify-bootstrap.sh` still
creates one wedding and both collaborators cleanly. `npm run typecheck` is
clean across the whole app. `npm test` is 203 tests passing (17 of them
new — 10 in `src/lib/budget.test.ts`, 7 in `src/lib/fx.test.ts`). `npm run
build` succeeds and lists `/budget` alongside every other route in its
output.

**Session 10 ran all five checks against `0007_settings.sql` on top of
session 9's migrations, and every one is still green:**
`verify-migrations.sh` — still 70 assertions (0007 adds one column to an
existing tenant table, no new tenant table, so nothing new to assert
there). `verify-bootstrap.sh` still creates one wedding and both
collaborators cleanly. `npm run typecheck` is clean across the whole app.
`npm test` is 181 tests passing (10 of them new,
`src/lib/calendar.test.ts`). `npm run build` succeeds and lists every
route including the two new ones (`/settings`, `/calendar`) in its output.

**Session 9 ran all five checks against `0006_reminders.sql` on top of
session 8's migrations, and every one is still green:**
`verify-migrations.sh` — still 70 assertions (0006 adds one enum value, no
new tenant table, so nothing new to assert there). `verify-bootstrap.sh`
still creates one wedding and both collaborators cleanly. `npm run
typecheck` is clean across the whole app. `npm test` is 171 tests passing
(12 of them new, `src/lib/reminders/digest.test.ts`). `npm run build`
succeeds and lists every route including the extended `/api/cron/reminders`
in its output.

**Session 8 ran the same five checks against `0004_lists.sql` +
`0005_lists_status_assignment.sql`:** `verify-migrations.sh` — 70 assertions
(up from 52; section 9 of `supabase/tests/01_tenancy.sql` is new — see
below, that gap is now closed). `npm test` was 159 tests passing then (29
of them new, `src/lib/lists/generate.test.ts`). `npm run build` listed
every new route (`/lists`, `/lists/[id]`, `/timeline`, `/board`,
`/setup/plan`). `node_modules` had to be installed fresh (`npm install`) —
a prior session's container didn't have it.

**What none of that proves:** none of these five checks opens a browser or
sends a real email. `v_timeline_items`' `due_date` filter was smoke-tested
directly in session 7 and is exercised again by the RLS assertions, but the
three drag interactions session 8 added — list reordering, timeline
drag-to-reschedule, board drag-between-columns — have never been watched
actually move anything, and session 9's digest has never actually been sent
by a real cron invocation against a real inbox (only reasoned about by
reading `sendEmail()`'s existing dev-mode fallback). Session 10 adds a
fourth and fifth unwatched drag surface (the calendar's drag-to-reschedule,
plus every touch-drag fallback it and the other three surfaces gained —
Move up/down buttons, a "Move to…" select, a tap-to-reveal date field) and
a mobile nav that has never been opened at phone width. Session 12 adds the
largest untested-live surface yet: a real outbound call to
`api.frankfurter.app` has never actually happened (only the cache-miss
branch's logic is unit-tested, with the live call mocked), the `<dialog>`-
based budget-links popup has never been opened in a real browser, and the
item editor's basis picker, the consumption-component editor, and the
payment schedule have all only been read, not clicked through. See session
12's, 10's, 9's, and 8's notes near the top of this file.

**Closed in session 8:** the three tenant tables from 0004 (`lists`,
`list_sections`, `list_items`) now have their own cross-wedding isolation
assertions in `supabase/tests/01_tenancy.sql` section 9, plus
`list_templates`' read-all/write-none policy, the composite FK, one-level
sub-item nesting (0005's trigger), and the parent-status auto-derivation
trigger. A prior version of this file flagged the missing tenancy
assertions as "worth adding, not yet done" — done since session 8.

`npm run build` needs the three `NEXT_PUBLIC_*` variables set or it fails at
"Collecting page data" — the env validation is deliberate. Placeholders are
enough, and `.github/workflows/verify.yml` has the ones CI uses.

Both SQL scripts build their own PostgreSQL cluster — no Docker, no network, no
Supabase CLI. **Neither may run as root** (`initdb` refuses), but that is not a
reason to skip them: in a container running as root,
`su postgres -c "cd $PWD && ./scripts/verify-migrations.sh"` works, because the
PostgreSQL package creates that user. CI runs all five.

### `scripts/verify-live.mjs` — UNCOMMITTED, PARTLY TESTED

Written at the end of session 3 and **left uncommitted in the working tree**.
It is the missing sixth check: the other two SQL scripts prove the migrations
are correct against a throwaway cluster running a shim that fakes `auth.users`,
`auth.uid()` and the three roles. This one asks the live project instead.

```bash
node scripts/verify-live.mjs      # needs the three keys, in env or .env.local
```

Read-only. It writes nothing, so it is safe to run at any time, including after
real guests have replied. It checks three things:

1. **The schema is there** — every table and view queried through PostgREST
   rather than read out of `information_schema`, because a table that exists
   but is not visible through the API is just as broken from the app's view.
2. **RLS denies the anon key** — the key that ships in the browser bundle.
   Nothing has ever confirmed the policies hold in a project where `anon` is a
   real role with a real JWT. If this fails, the guest list is readable by
   anyone who viewed the page source.
3. **The bootstrap ran** — wedding, collaborators, events, questions, content.

**What was tested, honestly:** the happy path against a mock PostgREST, and
three failure paths — missing environment, the anon key pasted into
`SUPABASE_SERVICE_ROLE_KEY`, and an unreachable project. That last one found a
real bug in the script (twenty sequential requests with no deadline meant a
typo'd URL hung instead of failing), now fixed with a preflight and a
ten-second timeout per request.

**What was NOT tested: check 2's failure path.** The mock that simulates a
leaking anon key could not be re-run — this sandbox kills background listeners
— so the detection logic is written but has never actually fired. **Exercise it
before trusting a green result from it**, per the rule in section 6 about
harnesses that cannot fail. The mock is straightforward to rebuild: serve
PostgREST-shaped JSON on a port, return rows for `guests` to the anon key, and
confirm the script exits non-zero.

---

## 2. What has NOT been verified

Read this before trusting anything above.

- **The migrations are reported applied, but nothing has been verified there.**
  See section 0. Every green check in section 1 comes from throwaway local
  clusters running through a shim. A shim is not Supabase Auth: it is exactly
  where a policy depending on real `auth.uid()` behaviour passes locally and
  fails live.
- **Most of the UI is still unopened in a browser — but the pattern of the
  first screens tried is the important finding, not the specific bugs.**
  Session 6: password sign-in worked first try; live CSV import worked
  cleanly; `/guests/rank` needed two separate fixes in a row (blank list,
  then dead drag-and-drop — both above), and **neither fix has actually been
  confirmed live**, because this branch's Vercel Preview build has never
  gone green (see "THE ACTUAL BLOCKER"). **That build going green is the
  single most useful thing to happen next** — until it does, `/guests/rank`
  cannot be judged at all. Once it's live: confirm a drag actually moves a
  row and the new order survives a reload. Read every remaining unopened
  screen — the question builder, the
  print sheet, the invitations flow, the public RSVP page and `/w` — with
  this ratio in mind, not with the assumption that "it type-checks and
  builds" means it renders or behaves correctly. Neither check can catch a
  CSS containment bug or a modifier clamping a drag to nothing; only opening
  the page and trying the interaction can.
- **No email has been sent.** Without `RESEND_API_KEY` the sender logs instead,
  by design. The templates have never met a real inbox or a spam filter.
- **Password sign-in now confirmed working live**, first try, session 6. The
  `/forgot-password` → `/reset-password` recovery half of the flow is still
  unconfirmed — only sign-in with an already-set password has been exercised.
- **Nothing has been printed.** `/invitations/print` is laid out for A4 with
  `@media print` rules no printer has seen. Print one page before committing a
  stationery run to it.
- **The CSV import now confirmed working against a real guest list**, session
  6, planner-reported as clean. Worth noting for whoever tests next: "clean"
  here means the planner didn't report a problem, not that every column,
  every dedupe edge case, and every age-band boundary was individually
  checked — the ranking bug above was also invisible until someone looked
  directly at its screen.

---

## 3. Where this veered off the spec

### 3a. Decisions taken that the spec left open

| Decision | What was chosen | Why |
| --- | --- | --- |
| **Two cut lines, not one** | `weddings.cut_rank` (A/B) and `tier_b_rank` (B/C) | The spec asks for tiers A, B and C derived from "a stored cut line", singular. One line cannot produce three tiers. The second is nullable; null means one undivided waitlist. |
| **What counts as a seat** | Adults and children occupy seats; infants do not | Undefined in the spec, and both the venue and the caterer need a number. All four counts are exposed separately. |
| **Reminder cadence** | Never within 10 days; weekly cron, Tuesday 10:00 UTC | Not specified. Both are single constants. |
| **Rank collation** | `COLLATE "C"` on rank columns | Postgres and JavaScript both compare ranks; unpinned they disagree on case. |
| **Deleting an event** | Cascades to its RSVPs, with a confirmation | The alternative is orphaned answers to an event that is not happening. |
| **Numeric ages on import** | under 2 infant, under 18 child, else adult | `Age` is a mapped header and half the files that have it hold a number. Matches the seat rule above. |

### 3b. Deviations, including two reversals

- **Tokens are stored encrypted as well as hashed.** The amended spec said
  store only `token_hash`. That was a dead end for the product: the planner
  needs the link back, to paste into WhatsApp months later and to reprint a QR
  code without invalidating an invitation already in the post. So `invitations`
  carries `token_hash` (lookup) *and* `token_encrypted` (recovery, AES-256-GCM
  under a key derived from the same environment pepper). The security property
  is unchanged — the key is never in the database — but this is a real reversal
  and remains the deviation most worth scrutiny.

- **Sign-in is email + password, not a magic link.** Sessions 1–3 built
  passwordless sign-in on `supabase.auth.signInWithOtp`. First live testing in
  session 4 hit Supabase's default mailer rate limit — 2 emails/hour, shared
  across every OTP request — which made even the basic "sign in, click
  around" loop impractical before custom SMTP was configured. Replaced with
  `signInWithPassword` plus a `/forgot-password` → `/reset-password` recovery
  flow (still email-based, but a one-time setup step rather than every sign-in).
  `bootstrap.sql`'s instructions were updated to match: a password is set for
  each user in Authentication → Users, or left unset and picked up later via
  `/forgot-password`. Not yet exercised against the live project — see
  section 2.

- **The plus-one mechanism differs.** The spec says the flow "creates a real
  guest record from the supplied name, not a placeholder". What is built
  renames an existing record already flagged `is_plus_one`. The outcome matches
  the intent, but the planner has to allocate the slot first. Creating rows
  from the public endpoint was the less safe option.

- **Bulk invite moved.** The spec puts "bulk tag and bulk invite" on `/guests`.
  Bulk tagging is there; bulk invitation creation is on `/invitations`, because
  it needs the event checkboxes to be meaningful.

- **Import dedupe runs in JavaScript, not `pg_trgm`.** See 5.7.

### 3c. Spec items still not built

| Missing | Spec says | State |
| --- | --- | --- |
| **Saved views** | "Saved views" on `/guests` | Table, RLS policy and a per-collaborator privacy test exist. No UI. |
| **Inline edit** | "Inline edit" on the guest table | Built for email and dietary only. Everything else is on the detail page. |
| **Site content editing** | Structured blocks | Rendered, but editable only in SQL. |

### 3d. Added beyond the spec

- **Transactional email and a cron in V1.** The original BRD said "no email
  integration" while also requiring invitations to be sent and non-responders
  chased. The amended spec resolved this; noted because it is the largest
  single addition.
- **`/setup`**, explaining the bootstrap step rather than a dead redirect.
- **Three verification scripts and CI**, none of which the spec asked for.
- **An answers view**, added session 5. Not a spec item, but flagged in every
  prior handoff as the biggest self-inflicted gap: custom RSVP answers were
  written by `rsvp.ts` and never read back anywhere in the planner. `/guests/[id]`
  now shows that guest's own answers (scope `guest`); `/households/[id]` shows
  the household's shared answers (scope `household`) once, not per member.
  `src/server/queries/questions.ts` embeds `rsvp_questions` on `rsvp_answers`
  through PostgREST — the new `RsvpAnswerRelationships` entry in
  `src/lib/types/database.ts` is what keeps that typed instead of resolving to
  `never` (see the trap in section 6, point 1). A deactivated question still
  shows its past answers, deliberately: `removeQuestion` deactivates rather
  than deletes for exactly this reason (section 5, point 9), and hiding the
  label here would silently orphan the answer it guards. Formatting (booleans
  as Yes/No, multi-select joined with commas) is `src/lib/answer-format.ts`,
  unit-tested directly per the `lib/` convention in section 8. Not yet seen
  rendered against real data — see section 2.

---

## 4. What is left, and who can do it

**Parked as of session 7 — see "Active work: lists, timeline and
reminders" above.** Everything below is still true and still has to happen
before a real invitation goes out; it's just not what the next session
should pick up first. Kept in full rather than deleted, because none of it
stops being true just because the priority changed.

**Everything remaining needs credentials, a browser, a printer or a DNS
record.** A coding session can prepare it and cannot finish it. That is not a
scheduling problem to route around; it is the shape of the work now.

### The one remaining session — get it running for real

**0. Get this branch's Vercel Preview build to go green — see "THE ACTUAL
BLOCKER" near the top.** It needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (and likely others) set for the **Preview**
environment scope in Vercel's project settings — this cannot be done by a
session, only by the planner in the Vercel dashboard. Nothing below,
including confirming the two rank-list fixes already in code
(`ba9bb73`, `52dd4d3`), can be verified until this is green.

1. **Verify what is actually there.** Run the three checks in
   `supabase/migrations/README.md` (16 tables; zero rows without RLS; 3 views),
   or `node scripts/verify-live.mjs`, which does those and more. Until this
   happens, section 0 is hearsay.
2. **Add both users, with a password,** under Authentication → Users. Sign-up
   is disabled and sign-in is by email and password, so each account must
   exist first — set a password there directly, or leave it unset and use the
   app's own `/forgot-password` flow afterwards to set one by email.
3. **Run `bootstrap.sql`** with its seven values edited. Status unconfirmed —
   if `/` renders empty or loops, this is the first thing to check, because
   `weddings` has no insert policy and the app shows nothing without a wedding
   row and a collaborator row.
4. **Set the environment and deploy.** `NEXT_PUBLIC_*`,
   `SUPABASE_SERVICE_ROLE_KEY`, `INVITE_TOKEN_PEPPER` and `CRON_SECRET` (both
   `openssl rand -hex 32`). `vercel.json` already schedules the reminder cron
   for Tuesdays at 10:00 UTC; it returns 401 without `CRON_SECRET`.
5. **Walk the spec's own "done when"** end to end: add a household, rank it
   above the cut, send an invitation to your own second address, reply as a
   guest with dietary requirements, watch it land on the dashboard, export the
   caterer's CSV.
6. **Exercise the import hardest**, with a real export from wherever the names
   actually live. It is new, it writes in bulk, and its dedupe has only ever
   seen test data.
7. **Print one page** of `/invitations/print` before trusting a stationery run.

**Start the sending domain today, independently of all the above** — SPF, DKIM,
DMARC and warming. Days of lead time, sitting directly in front of the one
immovable deadline. It is the likeliest thing to make V1 technically complete
and practically broken.

### Then

**This "then" is itself parked.** It used to point straight at V2. As of
session 7 it instead points at "Active work: lists, timeline and
reminders" near the top of this file — that work is next, ahead of V2,
and needs none of the live-verification steps above. Once the lists/timeline
system and reminders are built and this section's items are actually done,
resume here: whatever the first real invitation use exposes, then the 3c
leftovers (saved views, inline edit on more fields), then V2 —
`docs/wedding-platform-spec.md` has the full plan. Before starting V2,
decide the Gmail question: testing-mode OAuth issues refresh tokens that
expire every seven days, and the three ways to live with that are written up
in the spec. That decision changes the `email_*` tables, so make it before
the V2 migration.

---

## 5. The nine things worth knowing before changing anything

**1. Tenancy is a foreign key, not a convention.** Every tenant table carries
`wedding_id`, every parent carries a redundant `unique (id, wedding_id)`, and
children reference `(parent_id, wedding_id)`. Attaching a guest in one wedding
to a household in another is a foreign key violation — even for the service
role, which bypasses RLS entirely. Add a table, add it to the `tenant_tables`
array in a new migration; that array is the whole cost of securing it.

**2. `households.rank` is `COLLATE "C"`, and that is load-bearing.** Ranks are
compared in Postgres and in JavaScript. JavaScript compares UTF-16 code units,
so `'B' < 'a'`; a Supabase project defaults to `en_US.UTF-8`, where the
opposite holds. Unpinned, the cut line would silently disagree with the dragged
order. There is an assertion guarding it.

**3. Ranks never end in `'0'`.** Nothing can sort between `"x"` and `"x0"`, so
a key ending in the minimum digit is a dead end. `src/lib/rank.ts` enforces it
and the tests hammer it. If you seed by hand, respect it.

**4. `tier` is not a column.** It is derived in `v_households` from rank
against the two cut lines. Moving a line re-tiers the whole waitlist with no
write. Do not add a `tier` column, however tempting. `src/lib/tier.ts`
duplicates the logic for optimistic drags only.

**5. Empty `Relationships` arrays break embedded selects silently.** PostgREST's
type parser resolves `guests(*, households(display_name))` through the
`Relationships` array in `src/lib/types/database.ts`. Leave it empty and the
embed resolves to `never` — which compiles fine and loses all type safety. Add
an embed, add its relationship.

**6. The service role client is a loaded gun.** `src/lib/supabase/admin.ts`
bypasses RLS. Five legitimate callers, each of which scopes itself because the
database will not: the public RSVP path (a token resolved to one household),
the cron sender, `getFxRate()`, moodboard storage, and the moodboard share and
clip-token paths (a token resolved to one board or one wedding). That file
lists all five with the reason each is allowed. Everything a signed-in
collaborator does goes through `src/lib/supabase/server.ts`.

**6b. Storage has no policies, so a path IS the tenancy check.** The
moodboards bucket is private and carries no RLS on `storage.objects` at all —
deliberately, because that is what keeps storage out of every migration and
keeps `verify-migrations.sh` working against bare PostgreSQL. What is left is
`storageObjectPath()` in `src/lib/moodboards.ts`, which takes uuids and throws
on anything else. No action, route or extension payload may supply a path, a
filename or an extension. Its unit tests are not decoration.

**7. Import dedupe runs in JavaScript, and that is a decision.** `0001` enables
`pg_trgm` and builds `guests_name_trgm_idx` for exactly this.
`src/lib/import/trigram.ts` reimplements pg_trgm's algorithm in memory instead,
because reaching the index means a similarity RPC, an RPC means a new
migration, and `0001`–`0004` are frozen — an import that cannot run until somebody pastes SQL
into a dashboard is an import nobody uses. A few hundred names against a few
hundred is milliseconds, behind a preview screen. **If the list ever runs to
thousands, or a second wedding shares the database, move it to the index** —
the index is there, and the thresholds are constants in that file.

**8. The import never merges, only skips.** A duplicate is reported with what
it matched and defaults to skip; the user flips it. Both mistakes are bad — a
wrongly skipped guest gets no invitation, a wrongly created one gets two place
cards — but only one is visible when it happens. A skipped row is on screen
with its reason; a duplicate created is discovered at the stationer's. Do not
add an auto-merge.

**9. Deleting an RSVP question destroys its answers.** `rsvp_answers` cascades
on the question's foreign key. `removeQuestion` counts answers first and
deactivates rather than deletes when there are any — the answers are the reason
the question existed. Anything offering to tidy up questions must keep that
check.

---

## 6. Traps that have already cost time

**Supabase package version drift.** `@supabase/ssr` 0.5.2 passed
`SupabaseClient`'s generics in the order supabase-js used at 2.43; by 2.116
that order had changed, so every table in the app resolved to `never`. Nothing
failed — `never` is assignable to anything, so queries type-checked and casts
looked reasonable. `src/lib/types/guard.ts` now breaks the build if it happens
again. **Do not "simplify" that file away.**

The same class of bug appeared three times: the generic mismatch above,
`interface` row types (no implicit index signature, so they fail supabase-js's
`Record<string, unknown>` constraint — use type aliases), and empty
`Relationships`. All three failed silently. **When a Supabase query's types
look suspiciously permissive, check for `never` before trusting it.**

**A prefix rule that matched the wrong thing, silently.** The CSV importer read
the Side column with `/^(a|bride|...)/`, so "Aunt Margaret's lot" started with
`a` and became the bride's side — a third of a seating plan mislabelled with no
error anywhere. A unit test caught it before it ran on real data. Every value
parser in `src/lib/import/columns.ts` now matches exactly. **When parsing what
a human typed into a spreadsheet, exact beats clever: the wrong guess looks
right.**

**Two Supabase-managed objects that a migration must not touch.**
`storage.objects` (0013) and the `supabase_realtime` publication (0014) do not
exist on the bare PostgreSQL cluster `verify-migrations.sh` builds. The first
is handled by having no storage policies at all; the second by wrapping the
`alter publication` in an `if exists` guard, so it no-ops locally and works on
a real project. **Expect a third.** The rule: if Supabase creates the object,
a migration in this repo cannot assume it.

**`m.*` in a view is a trap for `create or replace view`.** `v_moodboards` was
first written as `select m.*, …`, which expands at definition time — so when
0014 added `moodboards.layout`, the new column landed in the MIDDLE of the
view's column list and the replace failed with "cannot change name of view
column". Views in this repo list their columns explicitly, and a later
migration appends at the END. This cost a build; it is in 0013's comments too.

**A guard written against the wrong error source, which therefore never
fired.** `/moodboards` 500'd on the live project with "Could not find the
table 'public.v_moodboards' in the schema cache". There WAS a guard meant to
degrade gracefully when a migration had not been applied — it checked for
PostgreSQL's `42P01`. But **the app does not talk to PostgreSQL, it talks to
PostgREST**, which reports a missing table as `PGRST205`. The guard looked
correct, read correctly, and was dead code in production. Worse, the
`/api/health` endpoint written to diagnose exactly this had the same bug and
would have reported the outage as an unrecognised error.

`src/lib/db-errors.ts` now owns that distinction (both codes, plus the
column-level ones a half-applied migration pair produces, plus a message
fallback) and is unit-tested against the real production log line. **When
writing a guard against a database error, check which layer the error comes
from** — `supabase/tests/*.sql` speak to Postgres directly and see 42P01; the
running app never does.

**Harnesses that cannot fail.** `verify-migrations.sh` briefly contained
`grep -E 'FAIL|ERROR' <<<"$out" && exit 1`, which returns non-zero whenever
grep finds nothing — the normal case. Under `set -e` that aborted the run after
the first test file while reporting success. `verify-live.mjs` had the same
shape of problem from the other direction: no request deadline, so a bad URL
hung rather than failed. **If you touch any verify script, make it fail on
purpose once and check that it says so.** One path in `verify-live.mjs` still
has not had that treatment — see section 1.

**An empty tool result read as an empty world.** Session 3 called
`list_projects`, saw one unrelated project, and reported that no wedding
project existed. It existed; the connector was scoped to another organisation.
**A tool that returns nothing is telling you about its own permissions as much
as about reality.** Say "nothing visible to this session", never "nothing
exists".

**Writing a spec is not permission to build it.** Session 11: asked for a
new feature spec, a session wrote one and then built the whole feature and
opened a PR in the same turn, before the planner had read a word of it. The
planner corrected this directly (see session 11's note near the top) — a
spec request gets a spec, nothing more, until the planner says to proceed.
Sessions 8–10 had already been quietly self-answering open questions and
building anyway when the planner hadn't weighed in; that was never actually
endorsed, it just hadn't been caught. **A spec with no reply yet is not a
green light, no matter how small the feature looks.**

---

## 7. Deliberate exceptions, so nobody "fixes" them

- **`rsvp_token_attempts` has no `wedding_id`.** A failed token lookup has no
  wedding to attribute itself to — that is the point of a throttle. No RLS
  policy; service role only.
- **The throttle fails open.** If the database errors while counting attempts,
  the request proceeds. A hiccup must not lock a guest out of replying, and a
  32-byte token is what is really doing the work.
- **`weddings` has no insert policy.** A collaborator inserting a wedding row
  would immediately lose access to it. Hence `bootstrap.sql` and `/setup`.
- **A malformed token and an unknown one produce the same page**, and invalid
  ids in an RSVP submission are dropped silently rather than rejected.
  Distinguishing them would confirm what exists.
- **`supabase/tests/fixtures/supabase_shim.sql` is a test fixture.** It fakes
  the Supabase-provided objects so migrations can be verified locally. Never
  paste it into a real project.
- **`supabase/seed.sql` creates two weddings.** The second exists so the
  tenancy tests have something they must not be able to see. Development only.
- **QR codes are served `no-store` and inlined as data URIs on the print
  sheet.** The image encodes the RSVP link, which is the household's only
  credential. A cached code outlives the invitation it belongs to — reissue one
  and a cached image still opens the old link. Do not add caching to
  `/api/qr`, and do not "optimise" the print sheet into `<img src="/api/qr/…">`:
  90 cards would become 90 requests, and the browser prints whatever arrived
  before the dialog opened.
- **The import re-parses the file on commit.** The browser sends the file text
  and the list of lines to skip — never the parsed guest rows. The server
  rebuilds the plan itself, so a tampered payload can skip rows but cannot
  invent a guest or reach another wedding.
- **A half-built choice question falls back to a text box.** A `single_select`
  with no options renders as text on the RSVP form rather than as nothing — but
  `coerceAnswer` still drops the answer, because an option not on the question
  is not a valid answer to it. The guest is not shown a dead control, and the
  caterer is not shown free text where a choice was meant.

---

## 8. Conventions

- **Migrations are append-only. That rule is now live.** They were edited in
  place during the build because nothing had ever run them for real. `0001` has
  now been applied to a real project, so `0001`–`0004` are frozen: editing one
  changes what a fresh database gets while leaving the live one untouched, and
  the two silently diverge. Add the next numbered migration, never edit an
  applied one. **One feature, one migration** — see `docs/specs/` — so a
  feature can ship without pulling another feature's tables in with it.
- **Every write is a server action** in `src/server/actions/`, returning
  `ActionResult` rather than throwing for expected problems.
- **Every read is in `src/server/queries/`**, wrapped in `cache()` so a layout
  and three components asking the same question cost one query.
- **Blank form field means null; absent key means untouched.** Collapsing the
  two is how a partial update silently wipes a column.
- **Pure logic lives in `src/lib/`, not beside the action that uses it.** A
  `"use server"` module may only export async functions, so anything worth
  unit-testing has to sit outside one — `src/lib/rsvp-answers.ts` was pulled out
  of the RSVP action for exactly that reason, and it guards a public endpoint.
  Put the rule in `lib/`, import it into the action, test it directly.

---

## 9. Open questions still blocking

From the spec. (1) and (2) decide whether the schedule is real. **(1) now also
gates the session-7 work:** task generation (see "Active work" above) needs
`weddings.wedding_date` to produce anything — without it, `/setup/plan`
should render an empty state, not an error, so this is worth having an
answer to but does not block building the feature itself.

1. **Wedding date and invitation send date.** The only fixed dates in the plan.
2. **RSVP lock date.** Drives the read-only cutover; already enforced by
   `weddings.rsvp_lock_at` wherever it is set.
3. **Guest pool size and final capacity.** Sets `weddings.capacity`.
4. **Sending domain.** See section 4 — start it today regardless of everything
   else.

Added since, and answerable without the planner:

5. **Did `bootstrap.sql` actually run on `<project-ref>`?** Section 0
   records the migrations as applied on the planner's word and the bootstrap as
   assumed. `node scripts/verify-live.mjs` answers this in about ten seconds.
6. **Which organisation owns that project?** A session whose Supabase connector
   is scoped elsewhere sees only an unrelated production project and concludes the account is
   empty. Recording the organisation in section 0 closes that trap for good.
