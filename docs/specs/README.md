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
| 4 | [Household editing and moving guests between households](04-household-management.md) | Built (`moveGuest`/`moveGuests` actions, `HouseholdPicker`, wired into the household page, guest page, and guests-table bulk bar), in **PR #16, open and unmerged**, but built before the planner had read the spec — see `docs/HANDOFF.md` session 11. Do not merge or extend until the planner has read this spec and said to proceed. | V1 only |
| 5 | [Multi-cut guest lines, and a day-of run sheet](05-multi-cut-lines-and-run-sheet.md) | Built end to end, session 14 — schema (`0008_multi_cut_lines.sql`, `0009_run_sheet.sql`, `0012_budget_tier_position.sql`), `src/lib/tier.ts`/`run-sheet.ts`, all server actions/queries, the repeatable `CutLinePicker`, and the `/run-sheet` + `/events/[id]/run-sheet` screens. Same live/browser caveat as every prior session — see `docs/HANDOFF.md` session 14. | V1 only |
| 6 | [Budget management](06-budget-management.md) | Built end to end, session 12 (2026-09-15) — schema (`0010_budget.sql`), `src/lib/budget.ts`/`fx.ts` + `getFxRate`, all server actions/queries, `/budget`, the dashboard "Budget" tile, the `/guests/rank` per-seat figure, the `v_reminders_due` digest sync, and the budget-line <-> task/list linking (§7) with its reverse badges on `/lists/[id]` and `/timeline`. Built **ahead of spec 5**, at the planner's direct request. Same live/browser caveat as specs 1–3 — see `docs/HANDOFF.md` session 12. | V1 only; its reminders sync and linking additionally depend on specs 1 and 2, already shipped |
| 6.1 | [Budget — quantity × unit price, and linking to an existing task](06.1-budget-quantity-and-task-linking.md) | Built end to end, session 13 (2026-09-16) — `0011_budget_manual_quantity.sql` (the `manual` basis, `budget_items.quantity`), `src/lib/budget.ts`'s matching `computeCurrent` case, the item editor's quantity field, and a "Link a task…" search in `/budget`'s linked-tasks popup completing spec 6 §7. | Spec 6, already built |
| 7 | [Cooler list colors, auto-assign on task creation, a highlighted "today" on the calendar, and click-to-preview task cards](07-list-colors-task-assignment-calendar-today.md) | Built end to end, same session (2026-09-16) — new `LIST_COLOR_PALETTE`, `addItem` auto-assigning to the creating user, a highlighted today cell on `/calendar`, and a shared `TaskPreviewPopup` (click a card on `/calendar`/`/timeline`, see a summary, click through to `/lists/[id]`) reusing spec 6's `BudgetLinksPopup` pattern. No schema change. | Specs 1, 3, and 6, already built |
| 8 | [Vendor management — contacts, notes, and the budget link](08-vendor-management.md) | **Proposed, not built — no migration, no screens.** Nothing is built, schema included, until its §11 Open Questions are answered (question 1 changes the `vendors` table's own shape). | Spec 6 / 6.1, already built |
| 9 | [Moodboards, publicly shareable](09-moodboards.md) | Built end to end, session 17 (2026-09-16) — `0013_moodboards.sql`, `v_moodboards`, the private storage bucket and its `ensure-bucket.mjs`, `/moodboards`, `/moodboards/[id]`, `/m/[token]`, and the `/w` + `/rsvp/[token]` sections. The first feature in the project to need Supabase Storage. Never applied to a live project and never opened in a browser — see `docs/HANDOFF.md` session 17. | V1 only |
| 9.1 | [Moodboards — Pinterest import, and a right-click clipper](09.1-pinterest-import-and-clipper.md) | Built end to end, session 17 (2026-09-16) — `0014_moodboard_clipper.sql`, `src/lib/net/` (SSRF address checks + hardened fetcher), `src/lib/pinterest.ts`, `POST /api/clip`, `/moodboards/[id]/import`, and `extension/` (Chrome MV3). §1 records what of the planner's supplied prototype spec survived contact with this stack and what was replaced. **No Pinterest call has ever been made and the extension has never been loaded** — see `docs/HANDOFF.md` session 17. | Spec 9 |
| 10 | [Completed tasks sink to the bottom of the list](10-completed-tasks-sort-to-bottom.md) | Built end to end, same session (2026-09-16) — new `sortCompletedLast` in `src/lib/lists/sort.ts`, applied to `/lists/[id]`'s per-section checklist (including drag-and-drop/Move up-down and sub-items) and `/lists`'s "All"/"Flagged" smart views. No schema change. | Spec 1; spec 3 for the smart views |
| 11 | [Editable list titles, moving tasks between sections, reordering sections, and completing a task closes its sub-tasks](11-list-editing-cross-section-drag-and-cascading-completion.md) | **Proposed, not built.** No schema change, but §4's questions (does reopening a parent reopen its sub-items, do Move up/down cross section boundaries, is the settings-page rename wanted too) need answers first. | Spec 1, spec 10, already built |
| 12 | [Manual ordering in the "Assigned to me" view](12-reorder-assigned-to-me.md) | **Proposed, not built — needs a migration** (`list_items.mine_sort_order`). §4 asks the planner to confirm the new-column approach and how it interacts with due-date ordering before it's built. | Spec 1, spec 3 (the "Mine" smart view itself), already built |
| 13 | [Navigation regrouping — Tasks, a Guests hub, Events with its run sheet, and where Invitations lives](13-navigation-regrouping.md) | **Proposed, not built.** No schema, no new screens — a `Nav` reshuffle plus shared sub-tab strips over existing routes. §5 question 1 is a direct conflict in what was asked (Invitations can't share a tab with both Guests and Questions at once) and has to be answered before anything else in this spec is built. | V1, spec 1, spec 3, spec 5 part B, spec 6, already built |

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

**Spec 4 sits outside this ordering entirely.** Specs 1–3 are a rebase on
top of the shipped V1 MVP and deliberately never touch `guests` or
`households` (see "What's shared across both", below). Spec 4 is the
opposite: it's V1's own guest-list surface, unrelated to lists, timeline,
reminders, settings, calendar or mobile, and has no dependency on — or from
— any of specs 1–3. It can be built before, after, or interleaved with them.

**Spec 5 splits the same way spec 4 does.** Part A (multi-cut lines) is
V1's own guest-list surface again — same independence as spec 4, can be
built any time relative to specs 1–3 or spec 6. Part B (the run sheet) is
new schema and screens with no dependency on anything else either; it
reads `events` (V1) and nothing more.

**Spec 6 is the one exception** — it depends on specs 1 and 2 for its
reminders sync (§5/§6 of that spec), so it should ship after those two,
though it has no dependency on spec 3, 4, or 5.

**Spec 8 sits on top of spec 6**, as 6.1 and 7 already do. It turns
`budget_items.vendor_name` — free text that spec 6 §2 explicitly named as
"the natural migration target" once a vendor record exists — into a real
foreign key, and reads spec 6 §7's `v_budget_item_tasks` for the tasks it
shows against a vendor. It has no dependency on specs 3, 4, or 5, and
touches nothing in V1's guest/RSVP surface.

**Spec 9 depends on nothing but V1**, and is the only spec so far with an
infrastructure step of its own: one private Supabase Storage bucket, created
by a script rather than a migration so `verify-migrations.sh` keeps working
against a bare PostgreSQL cluster (spec 9 §3). It reuses V1's invitation-token
machinery for its public share links and adds a section to `/w` and
`/rsvp/[token]`, so it is the first feature since V1 to touch the public
surface at all — it still reads no `guests`, `households` or `rsvp_*` data.
Specs 8 and 9 both currently claim `0013_*.sql` and `supabase/tests/05_*.sql`;
neither is built, so whichever ships first takes the numbers and the other
renumbers.

**Spec 9.1 sits on spec 9 and splits cleanly in two.** Its clipper half
(a Chrome extension, `POST /api/clip`, live updates) depends on nothing but
spec 9 and is a complete feature alone. Its Pinterest half additionally
depends on a developer app registered outside this repository, at an access
tier nobody here can predict — so it is the one piece of planned work whose
schedule is not ours to set. Build order 2–5 of that spec deliberately
produces the clipper without touching Pinterest at all.

**Specs 11–13 are three independent proposals from the same round of
planner feedback, none of them built.** Spec 11 (list titles, cross-section
drag, cascading completion) and spec 12 (manual ordering in "Assigned to
me") both sit on top of specs 1, 3 and 10 only, and have no dependency on
each other — either can be answered and built first. Spec 13 (navigation
regrouping) depends on the underlying screens each grouping touches (specs
1, 3, 5 part B, 6, plus V1's own guest/invitation/event surface) but not on
specs 11 or 12 — it reshuffles `Nav` and adds shared tab strips over
existing routes, and would work the same way whether or not 11 or 12 have
shipped. Spec 13 is also the one with a genuine conflict in what was asked
(§5 question 1: Invitations can't pair with both Guests and Questions at
once) and should be read in full, question 1 first, before any of its parts
are built.

## What's shared across both

- Neither needs vendors, budget, or Gmail — only `weddings`, `events`, and
  the two collaborators already in the schema. That's what lets this ship
  ahead of V2. (Specs 6 and 8 postdate that sentence and do need budget;
  it still holds for specs 1–3, which is what it was written about.)
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
