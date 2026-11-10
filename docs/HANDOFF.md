# Handoff

**Living document.** Rewritten at the end of each work chunk. It holds the current state and the three most recent sessions. Older sessions are in [`history/sessions.md`](history/sessions.md). A new session needs this file and `docs/wedding-platform-spec.md`.


## Start here (read this first)

**What this is.** WEDPLAN: a wedding planning platform. Couples sign themselves up at `/start` and plan with their collaborators; guests reach RSVP links and wedding websites without an account. Next.js App Router on Vercel, Supabase (Postgres, Auth, RLS keyed to `wedding_id`), TypeScript, Vitest. `README.md` is the overview; `docs/wedding-platform-spec.md` is the technical spec; `docs/specs/README.md` is the index of per-feature specs and how the spec process works.

**Where it stands. It is live and has real users.** The planner reported in session 55 (2026-11-09) that the app is deployed, works, and is in use by real couples and their guests. That is the planner's word: no session has run `scripts/verify-live.mjs` or seen the live project, so which migrations are applied is not recorded here. Specs 1–47 are built and merged to `main` (per-spec status in `docs/specs/README.md`). Migrations run `0001`–`0046`.

**What that changes.** Every migration now runs against real guest data: no destructive change to a column without a backfill, and check what a live database already holds before assuming a fresh one. Guest-facing pages (`/w`, `/rsvp`, `/i`, `/m`, `/registry`, `/privacy`) are used by people with no account and no way to report a bug except to the couple. The app serves many weddings, so nothing may assume there is only one (session 55 found the privacy notice doing exactly that).

**What has and hasn't been verified by a session.** Typecheck, unit tests, the SQL suite (`./scripts/verify-migrations.sh`) and `npm run build` pass. Some screens were rendered in headless Chromium with sample data. Beyond the planner's report above, no session has checked anything against live Supabase, a real phone, a printer or a real inbox. Say which checks you actually ran.

**How to work here.**
- Rules and conventions are in `CLAUDE.md`; section 8 below has the full convention list. A spec request is not a build request.
- Verify with `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (non-root user) and `npm run build` (with the placeholder env from `.github/workflows/verify.yml`; without `NEXT_PUBLIC_SITE_URL` the build fails on `/api/export/[kind]`), and say which you ran.
- At the end of a work chunk, rewrite the "Recent sessions" block below (keep about three), and move older entries to [`history/sessions.md`](history/sessions.md).

**Map of this file.** Recent sessions (next) → 1 What exists → 3 Where this veered off the spec → 5 Things worth knowing before changing anything → 6 Traps → 7 Deliberate exceptions → 8 Conventions → 9 Open questions. Sections 0, 2 and 4 (live project, unverified, launch checklist) and the old "Active work" note were pre-launch and moved to [`history/sessions.md`](history/sessions.md) in session 55; the numbers are kept because specs cite them.

---

## Recent sessions

**Session 56 (spec 48):** the phone experience, built on branch `claude/vibrant-bohr-xd2w8t`
(no PR). The planner said the live app was poor on a phone (zooming, sideways scroll, Guests with
no phone view, a bad bottom bar) and asked for it fixed, Apple-style. Read the spec's §2–§4:

- **Bug fixed: Guests zoomed out on phones.** The guest table's `sr-only` labels escaped its
  scroller and made the page 746px wide. Every sideways scroller is now `relative`, and the shell
  has `overflow-x: clip`. **Rule: a sideways scroller must be `relative`.**
- **No zoom:** 16px inputs on touch screens and below `md:`; `touch-action: manipulation`.
- **Tab bar** is `PHONE_TABS` in `nav-groups.ts` (Today · Tasks · Guests · Website) plus More, a
  bottom sheet; `/menu` is its no-JS fallback. `TAB_BAR`/group tabs from spec 41 are gone.
- **Guests on a phone** are cards (`phoneCards()` in `guests-table.tsx`); a mark opens
  `InviteCell` with `layout="sheet"`. The table is `md:` up only.
- **Verified:** typecheck, 1415 unit tests, build, Guests/filters/sheets on an emulated iPhone 13
  with sample data (390px wide throughout). **Not verified:** a real phone, live data, any other
  screen on a phone.

**Session 55 (no spec):** went live; privacy notice and docs. Branch
`claude/confident-keller-xiwcvn` (no PR opened). A brainstorm of non-feature work, then the
planner said the app is **live, works, and has real users**, and asked for a check against a
"don't get sued" checklist (privacy, cookies, embeds, accessibility, consent).

- **Bug fixed: the privacy notice named the wrong couple.** `/privacy` loaded the first wedding
  ever created and showed that couple to every wedding's guests. It now names no couple and reads
  no data (a static page). It also says the site is free and run by an individual, names the
  Google Maps and Spotify embeds (`site/blocks/media.tsx`) and guest photo uploads, and cites
  NZ's Privacy Act 2020 and Privacy Commissioner instead of the UK/EU.
- **Checked and fine:** the only cookie is sign-in (no consent banner needed); no analytics; fonts
  are self-hosted; images checked have alt text.
- **Deliberately not done** (planner: no charging, no business, region not needed): no terms page,
  refund policy, business details or storage region.
- **Docs:** this file rewritten for launch (above); sessions 45–52 and the pre-launch sections
  moved to `history/sessions.md`; spec index updated to "merged".
- **Verified:** typecheck, 1411 unit tests, build (CI env). **Not verified:** the page in a
  browser or on the live site.

**Session 54 (spec 47):** the guest table, built on branch `claude/pensive-euler-natrmu` (merged, PR #96). A brainstorm with mockups, then a spec, six questions (all recommended, plus a Planning
view), then "Build it all". No migration. Read the spec's §11:

- **The table** (`src/components/guests/guests-table.tsx`) groups by household; view and grouping
  are `?view=` / `?rows=people`, rules in `src/lib/guest-table.ts`. Event cells are symbols
  (`status-mark.tsx`); each household has a **Links ▾** menu (`household-links.tsx`); reply bars
  above the table are `event-summary.tsx`.
- **Behaviour change:** `listGuests` with both `rsvp` and `event` now keeps only guests invited to
  that event (the exports follow).
- **After a review (same session):** `listGuests` now filters `listAllGuests` (one cached read);
  `listInvites` pages past the 1000-row cap. Ten fixes in the spec's §11 "Review fixes".
- **Verified:** typecheck, 1410 unit tests, build, a sample page in headless Chromium at 1280px and
  an emulated iPad, axe clean. **Not verified:** Supabase, real data, a real iPad or phone.

---

## 1. What exists

### Database — `supabase/migrations/`

Numbered migrations `0001`–`0046`, applied in order; the table below covers the
early ones (later ones are named in each spec). `bootstrap.sql` makes a wedding by hand;
`/start` is the normal way since spec 40. Full instructions in `supabase/migrations/README.md`.

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

---

## 9. Open questions still blocking

None for the code. The pre-launch list (wedding date, RSVP lock, capacity, sending domain,
bootstrap, project organisation) is per-wedding settings or done now that the app is live; it is
kept in `history/sessions.md`. One worth closing when convenient: run
`node scripts/verify-live.mjs` once and record which migrations the live project actually has.
