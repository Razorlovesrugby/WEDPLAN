# Handoff

**Living document.** Rewritten at the end of every work chunk. A new session
needs this file and `docs/wedding-platform-spec.md`, and nothing else.

Last updated: session 9 — Reminders built end to end (spec 2), on top of
session 8's Lists + Timeline.

## Session 9: Reminders built — the digest, not just the schema. Read this first.

**Spec 2 (`docs/specs/02-reminders.md`) is built, not just scoped.** Its six
open questions had never been answered by the planner directly, so this
session answered them itself (cadence = the existing Tuesday 10:00 UTC
cron, recipients = always both collaborators, email only, a 7-day urgency
window, a one-line count before the itemised list, grouped by list — full
reasoning in the spec's section 7) and built against those answers:

- `0006_reminders.sql` — one enum value (`message_log.kind` gains
  `'digest'`). Everything else this feature reads already existed from
  spec 1.
- `src/lib/reminders/digest.ts` — pure content logic (`buildDigest`,
  `hasAnythingToReport`, `isoWeek` for the dedupe key), 12 unit tests.
- `digestEmail()` in `src/lib/email/templates.ts` — grouped by list, a
  one-line summary, same text-first/HTML-mirrors convention as the
  existing invitation/reminder emails.
- `/api/cron/reminders` extended, not duplicated: a second loop after the
  existing RSVP-chase loop, reusing the same cron secret check, the same
  `sendEmail`/dev-mode-fallback path, and the same `message_log` dedupe
  mechanism (key: `digest:{wedding_id}:{isoWeek}:{recipient}`). Skips
  entirely when a wedding has nothing overdue or due within 7 days —
  see the spec's added decision on that.
- Collaborator emails resolved via `supabase.auth.admin.getUserById()` on
  the service-role client (the Admin API, not PostgREST) — no new profile
  table, and not reachable from a signed-in collaborator's own browser
  session, which is exactly why this lives in the cron route.
- Dashboard tiles: a new "Tasks" section on `/` (Overdue, Due this week),
  built from `getTimelineSummary` — the same `getTimelineItems` +
  `buildDigest` pipeline the cron digest uses, so the dashboard and the
  email can never disagree about what counts as overdue.

`verify-migrations.sh` (still 70 assertions — 0006 adds no new tenant
table, just an enum value already covered by `message_log`'s existing
policy), `verify-bootstrap.sh`, `typecheck`, `npm test` (171 tests, 12 of
them new) and `npm run build` are all green.

**Same caveat as session 8, because it's the same root cause: nothing here
has been applied to the live project or opened in a browser.** No real
email has ever been sent by this app — the dev-mode fallback in
`sendEmail()` (log instead of send when `RESEND_API_KEY` is unset) has
never actually been exercised by a cron run, only relied upon by
inspection. That is still the single most useful thing for the next
session to unblock, ahead of any further feature work — see session 8's
note below for the full context (the organisation-scoping gap in section 0
is unchanged).

## Session 8: Lists + Timeline built, not yet seen live. Read this first.

**Everything in spec 1 (`docs/specs/01-lists-and-timeline.md`) is built:**
`0005_lists_status_assignment.sql`, the restructured timeline template,
`scripts/seed-templates.mjs`, `src/lib/lists/generate.ts` (29 unit tests),
every query and action, and all five screens (`/lists`, `/lists/[id]`,
`/timeline`, `/board`, `/setup/plan`). `verify-migrations.sh` (70
assertions), `verify-bootstrap.sh`, `typecheck`, `npm test` (159 tests) and
`npm run build` are all green. Full detail, including what's deliberately
simplified (reordering renumbers rather than using a fractional index,
drag-to-reorder is one section at a time, timeline drag snaps to a bucket
not a pixel-exact date, assignment is labelled by role not name), is in
spec 1's status block — read that before touching this feature further.

**What session 8 could NOT do, for the same reason every prior session
couldn't:** no live Supabase project was reachable (section 0's
organisation-scoping gap is unchanged), so **none of this migration has
been applied to a real project and none of these five screens has been
opened in a browser.** That is the single most important thing for the next
session to do — not polish, not more features. `docs/HANDOFF.md` section 6
has two real bugs from `/guests/rank` that passed every automated check and
only showed up on screen; the three drag surfaces this session added
(list reordering, timeline rescheduling, board status) are exactly that
class of risk and have never been watched work.

## Session 7: the build direction changed, and so did the process. Read this first.

**The planner made the call directly, not from a spec session: invitations
are done for now, and the product needs to work more like the spreadsheet
it is replacing before it sends another one.** Then, same session, a second
and more specific direction: build it like **Apple Reminders (freeform
lists, any item can carry a due date) fused with a Jira-style timeline that
auto-syncs** — set a date on anything, anywhere, and it appears on the
timeline with no manual step. No vendors, no budget, no AI, no further
invitation or guest-facing work.

**Process change, also this session: each feature gets its own spec
document with its own open questions, and nothing beyond schema is built
until the planner has answered that feature's questions.** The full plan for
each feature — data model, screens, dependencies, build order, open
questions — lives in **[`docs/specs/`](specs/)**, not inline in this file:

| Spec | Status |
| --- | --- |
| [`docs/specs/01-lists-and-timeline.md`](specs/01-lists-and-timeline.md) | Built end to end (schema, generation logic, queries/actions, all 5 screens) and verified locally. Not yet applied to the live project or opened in a browser — see session 8 above. |
| [`docs/specs/02-reminders.md`](specs/02-reminders.md) | Built end to end (schema, digest logic, email template, extended cron, dashboard tiles) and verified locally. Same live/browser caveat as spec 1 — see session 9 above. |

**This spec structure went through two revisions in one session, both
recorded in `docs/specs/README.md`:** first a 3-way split (checklists /
task timeline / reminders) with checklists and tasks as separate tables
joined by a manual link; then, once the planner's actual model (one
integrated system, not two features bolted together) was clear, merged
into the single "Lists, with an auto-synced timeline" spec above. The
schema was rewritten to match each time — `0004_checklists.sql` and
`0005_task_timeline.sql` no longer exist; `0004_lists.sql` replaces both.
Re-verified clean (`verify-migrations.sh`, `verify-bootstrap.sh`) at each
step, plus a manual smoke test confirming the auto-sync view actually
filters on `due_date` correctly (spec 1, section 7). No server action,
query, screen, or seed loader exists yet, and none should until spec 1's
open questions are answered.

**This does not mean V1 is being thrown away.** Everything below about the
guest list, ranking and RSVP system is accurate and unchanged; it is just
not what the next session should spend time on. The items in section 4
(Vercel Preview build, live Supabase verification, the sending domain,
printing) are **parked, not fixed, and not forgotten** — see the note at the
top of that section.

---

Last updated: end of session 6.

**V1's code is complete. V1 is not done. Session 6 found two real UI bugs in
`/guests/rank` and fixed both in code — but as of this update, THIS BRANCH
HAS NEVER SUCCESSFULLY DEPLOYED, so neither fix has been confirmed live.**
Read "THE ACTUAL BLOCKER" below before anything else in this document; an
earlier version of this file called that blocker resolved, and it was not —
that was a bad inference by a session, corrected below.

What's confirmed vs. not:

1. **`/guests/rank` rendered completely blank** — heading and capacity
   control showed, but no rows and no error. Fixed in code, commit `ba9bb73`.
   **Never confirmed live** (see blocker).
2. **Dragging a row did nothing** — no movement, no error. Fixed in code,
   commit `52dd4d3`. **Never confirmed live** (see blocker).

Both fixes are in `src/components/rank/rank-list.tsx`, both in how the
`@tanstack/react-virtual` virtualizer and `@dnd-kit` interact. Typecheck, all
130 unit tests, and `npm run build` with placeholder env vars all pass for
both — none of which would have caught either bug, and none of which prove
anything about Vercel's actual deployment, which is the thing that has
actually been tested here and has actually failed, every time, on every
commit pushed this session including a docs-only one.

Branch: `claude/guest-import-continuation-gvj9rj`, from `main`. **Now merged
— PR #7 merged the rank-list fixes, PR #8 merged the correction below that
un-resolved the Vercel blocker.** Sessions 1–6's branches were merged in
PRs #1–#8. Session 7 (this rebase) is on `claude/read-this-7sohh0`.

**Session 6 could not verify the live project either — same organisation
scoping gap as every prior session.** This session's Supabase connector saw
exactly one project, `arm15lite_PROD` (`dgpplqzsukifcvddoxcd`) — described in
the warning box in section 0. No `.env.local` and no `NEXT_PUBLIC_SUPABASE_*`
/ `SUPABASE_SERVICE_ROLE_KEY` were present in this container either,
so `scripts/verify-live.mjs` still cannot be run from inside a session.
**Open question 6 is unchanged: find out which organisation actually owns
`lsgbwxisqqazahgkibmj` and give a session's Supabase connector access to it.**

## What session 6 did

1. **Confirmed live, by the planner directly (not by a session):** password
   sign-in works, and CSV import against a real guest list works — both were
   open questions in every prior handoff (section 2) and are now answered.
2. **Found and fixed live-use finding #1: `/guests/rank` rendered blank.**
   Root cause in `src/components/rank/rank-list.tsx` — the virtualised
   list's scroll container had `contain: "strict"` (which includes CSS
   *size* containment: the element must size itself without regard to its
   contents) but only a Tailwind `max-h-[70vh]` — a maximum, not a definite
   height. With no definite height anywhere else, the browser collapsed the
   container to zero height. The virtualizer had no space to place rows in,
   so nothing rendered — no console error, because nothing crashed; there
   was simply nowhere to draw. Fixed by dropping `size` from the containment
   value (`contain: "layout paint"` — layout/paint containment is kept for
   the virtualizer's perf benefit; only `size` was the problem). Commit
   `ba9bb73`.
3. **Discovered the branch's Vercel Preview deployment cannot build at all**,
   failing at "Collecting page data" with `NEXT_PUBLIC_SUPABASE_URL:
   Required`. Not a code bug — `src/lib/env.ts` validates `clientEnv` at
   module load deliberately, so a misconfigured deployment fails loudly
   instead of shipping broken. **Still failing as of this update** — see
   "THE ACTUAL BLOCKER" below. An earlier revision of this file marked this
   resolved; it was not, and how the planner then saw enough of
   `/guests/rank` to report the drag bug in finding #4 is genuinely unclear
   — see the open question in that section.
4. **Found and fixed live-use finding #2: dragging a row did nothing.**
   Root cause, same file — `DndContext` used the `restrictToParentElement`
   modifier, which dnd-kit implements as `useRect(activeNode.parentElement)`:
   it clamps the dragged element to the bounds of its actual DOM parent, not
   the scrollable list. Because the virtualizer wraps each row in its own
   individually absolutely-positioned div (one div per row, sized to exactly
   `ROW_HEIGHT`), that "parent" was a box exactly the row's own size — zero
   room to move, so every drag was clamped back to where it started. Fixed
   by dropping the modifier; `restrictToVerticalAxis` alone (which doesn't
   depend on any container rect — it just zeroes the horizontal component of
   the transform) still keeps drags vertical-only. Commit `52dd4d3`.
   **Not yet confirmed live** — this was diagnosed from the dnd-kit source
   in `node_modules`, not watched fixed in a browser.

Typecheck, all 130 unit tests, and `npm run build` (with placeholder env
vars) pass after both fixes. Neither check would have caught either bug —
both are runtime rendering/interaction problems, exactly the gap section 2
has warned about since session 3.

## THE ACTUAL BLOCKER: this branch's Vercel build has never succeeded

**Status as of the last confirmed attempt: still failing, on commit
`bb268e6` — a docs-only commit (this file), which failed identically to the
code commits before it.** So this is not a per-commit fluke and not
something any code change fixes. Every build of
`claude/guest-import-continuation-gvj9rj` has failed at the same step:

```
Collecting page data ...
Error: Invalid client environment:
  NEXT_PUBLIC_SUPABASE_URL: Required
  NEXT_PUBLIC_SUPABASE_ANON_KEY: Required

See .env.example.
    at .next/server/app/api/export/[kind]/route.js
Error: Command "npm run build" exited with 1
```

**This is not a code bug. It is deliberate, working as designed** — see
`src/lib/env.ts`: `clientEnv` is validated at module load specifically so a
misconfigured deployment fails loudly at build time instead of shipping
silently broken. The fix is entirely in Vercel's project settings, and
**no session can do it**: a coding session has no Vercel login, no API
token, and no CLI available in its environment — there is no tool it can
call. This is not a to-do a session skipped; it is outside what a session
can reach at all, the same way sending real email or clicking a live
Supabase dashboard is. Only the planner, in the Vercel dashboard, can fix
it:

1. Open the Vercel project → **Settings → Environment Variables**.
2. `NEXT_PUBLIC_SUPABASE_URL` is known without looking it up — it's just the
   project ref as a URL: `https://lsgbwxisqqazahgkibmj.supabase.co`.
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` has to come from the Supabase dashboard —
   no session's Supabase connector can reach this project (section 0), so
   this value has never been available to a session either. Supabase
   dashboard → project `lsgbwxisqqazahgkibmj` → **Settings → API** → the
   `anon` `public` key.
4. Add both. While there, confirm `SUPABASE_SERVICE_ROLE_KEY`,
   `INVITE_TOKEN_PEPPER` and `CRON_SECRET` are set too — the build log above
   only shows the *first* missing value; more may be missing behind it.
   Generate `INVITE_TOKEN_PEPPER` / `CRON_SECRET` with
   `openssl rand -hex 32` only if they don't already exist — **never
   regenerate an existing `INVITE_TOKEN_PEPPER`**, it invalidates every
   invitation token already issued.
5. **Check the environment scope each variable is set for.** Vercel scopes
   variables to Production / Preview / Development independently. A branch
   push like this one builds as a **Preview** deployment. If the planner
   has a working Production site (from `main`) that they've already logged
   into and imported guests on, the likeliest explanation for this exact
   failure is that the variables are ticked for Production only — tick
   Preview too, or every future branch hits this identical wall on its
   first push.
6. Redeploy. Compiling alone takes ~10s in the logs above; the whole build
   fails within 20s of starting when these are missing, so it should go
   green just as fast once they're set.

**Open question this raises, unresolved:** the planner reported trying to
drag a row on `/guests/rank` and it not working, which implies they saw
rows rendered — but every Preview build for this branch, including the one
carrying the blank-list fix, has failed before deploying. Either they were
looking at a different deployment (Production, from `main` — which still
has the *unfixed* blank-list bug too, since that fix has only ever landed on
this unmerged branch), or a Preview build succeeded at some point this
session that wasn't captured in a pasted log. Worth asking the planner
directly which URL they were on when they saw the rows, once the Preview
build is actually green — don't assume either explanation.

---

## Active work: lists, timeline and reminders — see `docs/specs/`

**The full plan moved out of this file and into one spec per feature.** See
the table near the top of this document, or go straight to
[`docs/specs/README.md`](specs/README.md) for the index and build order.
Schema is `0004_lists.sql` + `0005_lists_status_assignment.sql` — two
migrations for one feature: 0004 shipped the core shape, 0005 added what
answering the open questions required (board status, sub-items, recurrence,
assignment). Both are one feature's migrations, not two features sharing one.

Kept here, because it doesn't belong in any one feature's spec:

- **Scope for the whole rebase:** neither lists/timeline nor reminders need
  vendors, budget or Gmail — only `weddings`, `events` and the
  collaborators already in place. That's why this can ship ahead of V2
  rather than as part of it. Neither touches `guests`, `households`,
  `invitations` or `rsvp_*` either — no guest-facing work is in scope.
- **This is a narrower slice than the full AI-native product direction**
  floated in an earlier, unmerged planning pass (ingestion, a vigilance
  engine, semantic search). Nothing in `docs/specs/` depends on any of
  that, and nothing there should grow to need it without the planner
  asking again.
- **Both specs are now built end to end** — spec 1 (session 8: schema,
  generation logic, queries/actions, all five screens) and spec 2 (session
  9: schema, digest logic, email template, extended cron, dashboard tiles).
  See each session's note above, and each spec's own status block, for
  what's simplified and what's still unverified — nothing in either has run
  against the live project, in a browser, or (for spec 2) sent a real
  email.

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
| **Project ref** | `lsgbwxisqqazahgkibmj` |
| **URL** | `https://lsgbwxisqqazahgkibmj.supabase.co` |
| **Organisation** | unknown — see open question 6 |
| **Migrations** | `0001`, `0002`, `0003` reported applied; `0004` and `0005` written and verified locally, neither yet applied here |
| **Bootstrap** | assumed run — unconfirmed |

**Recorded on the planner's word. No session has ever verified it.** The
Supabase connector in sessions 2 and 3 was scoped to a different organisation
and returned `You do not have permission to perform this action` for this ref,
so not one check query has run against it.

`scripts/verify-live.mjs` exists to close exactly this gap — see section 1.
Run it, then replace this block with what it actually reported.

> **`arm15lite_PROD` (`dgpplqzsukifcvddoxcd`) is not this project.** It is an
> unrelated production database for a rugby club app — 29 tables, thousands of
> live rows, 62 migrations of its own. It shares the account and, depending on
> connector scope, may be the *only* project a session can see, which makes it
> exactly the wrong thing to reach for when the wedding project looks absent.
> Never apply these migrations to it, and do not read it "just to check" — the
> planner has asked explicitly that it not be touched. If `list_projects` does
> not return `lsgbwxisqqazahgkibmj`, the connector is scoped to the wrong
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
| — | `bootstrap.sql` | Your wedding, both collaborators, starting events and questions |

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
| `/board` | Kanban — Not started / In progress / Done, drag between columns |
| `/setup/plan` | Preview + generate the 175-task timeline template; real empty state with no wedding date |
| `/setup` | Explains the bootstrap step when no wedding is attached |
| `/api/cron/reminders` | Weekly chase of non-responders only |
| `/api/export/[kind]` | Guest, household and catering CSV |
| `/api/qr/[invitationId]` | One QR code, PNG or `?format=svg` |

### Checks

```bash
npm run typecheck                 # clean — reconfirmed, session 9
npm test                          # 171 tests passing — reconfirmed, session 9
./scripts/verify-migrations.sh    # 70 SQL assertions, throwaway PG cluster — reconfirmed, session 9
./scripts/verify-bootstrap.sh     # bootstrap on a clean database — reconfirmed, session 9
npm run build                     # reconfirmed, session 9
```

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
reading `sendEmail()`'s existing dev-mode fallback). See session 9's and
session 8's notes near the top of this file.

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
bypasses RLS. Two legitimate callers: the public RSVP path (scoped by resolving
a token to one household) and the cron sender. Everything a signed-in
collaborator does goes through `src/lib/supabase/server.ts`.

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

5. **Did `bootstrap.sql` actually run on `lsgbwxisqqazahgkibmj`?** Section 0
   records the migrations as applied on the planner's word and the bootstrap as
   assumed. `node scripts/verify-live.mjs` answers this in about ten seconds.
6. **Which organisation owns that project?** A session whose Supabase connector
   is scoped elsewhere sees only `arm15lite_PROD` and concludes the account is
   empty. Recording the organisation in section 0 closes that trap for good.
