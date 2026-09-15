# Feature specs

**Process, starting session 7:** each feature in the rebase gets its own
spec, built one at a time on top of the shipped V1 MVP. A spec is not a
green light — it's a proposal plus a list of decisions only the planner can
make. **Nothing beyond schema is built for a feature until its Open
Questions section has answers.** When you answer a spec's questions, they
get folded into that file (a new "Answered" section, dated), and the build
proceeds per that spec's own build order. Schema (a migration) may exist
ahead of that if it was reviewed as pure infrastructure — each spec says so
explicitly where true — but no server action, query, screen, or seed data
gets wired up until the questions are answered.

Why this exists: `docs/HANDOFF.md` used to carry the whole plan inline, for
every feature at once. That made it hard to build one thing, get it signed
off, and move to the next without the other features' half-finished
thinking sitting in the same document. One spec per feature keeps each
decision scoped to the feature it affects.

**Revision, same session:** the plan started as three specs — checklists,
task timeline, reminders — with checklists and the task timeline as
separate tables joined by a manual link. The planner's direction (Apple
Reminders' list model, a Jira-style timeline, and the two auto-syncing with
no manual step) meant that split was the wrong shape: it's one feature, one
table family, one spec. The two are now merged into
[`01-lists-and-timeline.md`](01-lists-and-timeline.md); reminders,
renumbered to spec 2, is unchanged in substance.

## Features and status

| # | Feature | Status | Depends on |
| --- | --- | --- | --- |
| 1 | [Lists, with an auto-synced timeline](01-lists-and-timeline.md) | Built end to end (schema, generation logic, queries/actions, all 5 screens), verified locally. Not yet applied to the live project or opened in a browser. | V1 only |
| 2 | [Reminders](02-reminders.md) | Built end to end (schema, digest logic, email template, extended cron, dashboard tiles), verified locally. Same live/browser caveat as spec 1. | Spec 1 shipped first |
| 3 | [Settings, Calendar view, Mobile](03-settings-calendar-mobile.md) | Built end to end (schema, settings/cut-line/list-appearance actions, `/settings`, `/calendar`, mobile nav, touch-drag fallbacks), verified locally. Same live/browser caveat as specs 1 and 2. | Specs 1 and 2 shipped first |

## Recommended build order

**Lists & timeline → reminders → settings/calendar/mobile.**

Reminders is second because there's nothing to remind about until list items
have due dates, and it reuses the existing `/api/cron/reminders`
infrastructure — building it second means extending working code instead of
guessing at the shape in advance.

This order is a near-constraint this time, not just a recommendation:
reminders' spec literally reads from the view spec 1 creates
(`v_timeline_items`).

Spec 3 is last, and within it, settings and calendar should ship before the
mobile pass — the mobile pass touches every screen the first two specs add,
so building it first would mean redoing it once those screens exist.

## What's shared across both

- Neither needs vendors, budget, or Gmail — only `weddings`, `events`, and
  the two collaborators already in the schema. That's what lets this ship
  ahead of V2.
- No guest-facing or invitation surface. Neither spec reads or writes
  `guests`, `households`, `invitations`, or `rsvp_*` — V1's guest/RSVP
  system is untouched and out of scope for this rebase entirely, per the
  planner's direction.
- Every new tenant table follows the existing tenancy pattern
  (`docs/HANDOFF.md` section 5, rule 1): `wedding_id` + composite foreign
  keys, added to the RLS `tenant_tables` array in the same migration that
  creates the table.
- Every write is a server action, every read is a cached query, pure logic
  lives in `src/lib/` and is unit-tested there — `docs/HANDOFF.md` section 8.
- Each feature's own spec has a "Test plan" section — the same shape of
  check V1 uses (`typecheck`, unit tests, `verify-migrations.sh`,
  `verify-bootstrap.sh`, `npm run build`, then actually opening it in a
  browser). No feature is "done" on green checks alone; V1's rank-list bugs
  (`docs/HANDOFF.md`, "THE ACTUAL BLOCKER" section history) passed every
  automated check and still didn't render.
