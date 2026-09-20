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
| 6.1 | [Budget — quantity × unit price, and linking to an existing task](06.1-budget-quantity-and-task-linking.md) | Built end to end, session 13 (2026-09-16) — `0011_budget_manual_quantity.sql` + `0011_budget_manual_quantity_columns.sql` (split in session 21 to fix a `55P04` migration bug, `docs/HANDOFF.md`; the `manual` basis, `budget_items.quantity`), `src/lib/budget.ts`'s matching `computeCurrent` case, the item editor's quantity field, and a "Link a task…" search in `/budget`'s linked-tasks popup completing spec 6 §7. | Spec 6, already built |
| 7 | [Cooler list colors, auto-assign on task creation, a highlighted "today" on the calendar, and click-to-preview task cards](07-list-colors-task-assignment-calendar-today.md) | Built end to end, same session (2026-09-16) — new `LIST_COLOR_PALETTE`, `addItem` auto-assigning to the creating user, a highlighted today cell on `/calendar`, and a shared `TaskPreviewPopup` (click a card on `/calendar`/`/timeline`, see a summary, click through to `/lists/[id]`) reusing spec 6's `BudgetLinksPopup` pattern. No schema change. | Specs 1, 3, and 6, already built |
| 8 | [Vendor management — contacts, notes, and the budget link](08-vendor-management.md) | **Proposed, not built — no migration, no screens.** Nothing is built, schema included, until its §11 Open Questions are answered (question 1 changes the `vendors` table's own shape). | Spec 6 / 6.1, already built |
| 9 | [Moodboards, publicly shareable](09-moodboards.md) | Built end to end, session 17 (2026-09-16) — `0013_moodboards.sql`, `v_moodboards`, the private storage bucket and its `ensure-bucket.mjs`, `/moodboards`, `/moodboards/[id]`, `/m/[token]`, and the `/w` + `/rsvp/[token]` sections. The first feature in the project to need Supabase Storage. Never applied to a live project and never opened in a browser — see `docs/HANDOFF.md` session 17. | V1 only |
| 9.1 | [Moodboards — Pinterest import, and a right-click clipper](09.1-pinterest-import-and-clipper.md) | Built end to end, session 17 (2026-09-16) — `0014_moodboard_clipper.sql`, `src/lib/net/` (SSRF address checks + hardened fetcher), `src/lib/pinterest.ts`, `POST /api/clip`, `/moodboards/[id]/import`, and `extension/` (Chrome MV3). §1 records what of the planner's supplied prototype spec survived contact with this stack and what was replaced. **No Pinterest call has ever been made and the extension has never been loaded** — see `docs/HANDOFF.md` session 17. | Spec 9 |
| 10 | [Completed tasks sink to the bottom of the list](10-completed-tasks-sort-to-bottom.md) | Built end to end, same session (2026-09-16) — new `sortCompletedLast` in `src/lib/lists/sort.ts`, applied to `/lists/[id]`'s per-section checklist (including drag-and-drop/Move up-down and sub-items) and `/lists`'s "All"/"Flagged" smart views. No schema change. | Spec 1; spec 3 for the smart views |
| 11 | [Editable list titles, moving tasks between sections, reordering sections, and completing a task closes its sub-tasks](11-list-editing-cross-section-drag-and-cascading-completion.md) | Built end to end, same session (2026-09-17) — `InlineText` title editing on both `/lists/[id]` and `/settings`; `moveItemToSection`/`reorderSections` actions; a shared `DndContext` for cross-section item drag plus a per-item "Section" select; sections reorder via Move up/down (drag was scoped out while building — see spec's §1C); `setStatus` cascades closing to sub-items, not reopening. No schema change. Not yet opened in a browser (no Supabase project in this sandbox). | Spec 1, spec 10, already built |
| 12 | [Reordering the lists themselves in the sidebar](12-reorder-lists-sidebar.md) | Built end to end, same session (2026-09-17) — rewritten from its original draft (manual ordering inside "Assigned to me") after the planner clarified they meant reordering the lists shown under "Your lists" instead, see §4; new `reorderLists` action renumbering the existing `lists.sort_order`, plus drag/Move up-down in `ListsSidebar`. No schema change. Not yet opened in a browser (no Supabase project in this sandbox). | Spec 1, already built |
| 13 | [Navigation regrouping — Tasks, a Guests hub, Events with its run sheet, and where Invitations lives](13-navigation-regrouping.md) | Built end to end, same session (2026-09-17) — `Nav` collapsed from 14 entries to 8; a new shared `SubTabs` component over the Guests hub (`/guests`, `/guests/rank`, `/invitations`) and the Tasks hub (`/lists`, `/lists/[id]`, `/calendar`, `/board`, `/timeline`); a "Run sheet →" link per event row in `EventsEditor`; cross-links between `/questions` and `/invitations`. No schema, no URL changes. Not yet opened in a browser (no Supabase project in this sandbox). | V1, spec 1, spec 3, spec 5 part B, spec 6, already built |
| 14 | [The public wedding site, and the invites that point at it](14-public-site-and-invites.md) | **All six build steps built (2026-09-18).** All twelve questions answered. `0015`, `0016`, `0017`; `/w/[slug]` in the Script theme; the `/site`, `/site/theme`, `/travel` and `/gallery` editors; the FAQ starter library; the `/i/[token]` card with a real Open Graph image; save-the-dates and batched broadcasts; a themed print sheet; the coach with seats, capacity and a manifest export; guest photo uploads gated to the RSVP token. 130 new unit tests (436 total), 34 new SQL assertions (201 total). **Never run against a live project and never opened in a browser** — the OG image is the only thing seen. Known gap: coach seat capacity is checked but not locked. See the spec's "Build status". | V1; spec 9 for the moodboard sections already on `/w` |
| 15 | [List content — inline editing everywhere, notes sections, calculated due dates, and hiding completed tasks](15-list-content-editing-and-calculated-dates.md) | **Built, then corrected, same round.** `0016` built inline title editing, `collaborators.display_name`, calculated due dates (`due_date_offset_days`), hide-completed, and a first-draft "Checklist vs. Notes" section-kind picker. That last piece was replaced once the planner described the actual want in full — `0018` retires the kind/enum and adds `list_sections.notes` instead: every section, old or new, gets one free-text field alongside its checklist, not a separate kind of section. See spec's §4a. | Spec 1, spec 10, spec 11, already built |
| 16 | [List appearance, sidebar cleanup, and budget links at the section level](16-list-appearance-sidebar-and-budget-section-links.md) | **Proposed, not built — no open questions.** Removes spec 12's Move up/down sidebar buttons for a live outstanding-task count per list; makes `lists.color`/`lists.icon` mutually exclusive (icon wins when set) everywhere a list's identity shows; adds the one budget-link grain spec 6 §7 explicitly deferred — a `budget_item_sections` join table alongside the two spec 6 already built, badging a linked section's own heading only. | Spec 3, spec 6 / 6.1, spec 7, spec 12, already built |
| 17 | [Export all tasks to CSV](17-tasks-csv-export.md) | **Built, same session.** A fourth kind (`tasks`) on the already-built `/api/export/[kind]` route, a new `getItemsForExport` query, and an "Export CSV" link on `/lists`. No schema change. `typecheck`, `npm test` (384 tests), `npm run build` all pass; not opened against a live project. | Spec 1, already built; picks up real assignee names automatically once spec 15 lands |
| 18 | [Budget — NZD only, and a GST inclusive/exclusive toggle](18-budget-gst.md) | **Built end to end, session 22 (2026-09-18).** Part A removes spec 6's whole multi-currency/FX mechanism (`fx_rates`, every `currency`/`fx_rate` column, `getFxRate`'s live lookup) — every wedding is NZD only now. Part B adds a per-line `gst_treatment` toggle on `budget_items`; when exclusive, every total that sums the line adds a hardcoded 15%. `0019_budget_nzd_and_gst.sql`; `verify-migrations.sh` (211 assertions), `npm test` (437 tests), `npm run build` all pass. | Spec 6 / 6.1, already built |
| 19 | [Budget — an overall budget, percentage allocations, and allocation-derived estimates](19-budget-allocation-percentages.md) | **Built end to end, session 23 (2026-09-20)** — all six questions answered and the build authorized the same day. `0020_budget_allocations.sql` (`weddings.total_budget`, `allocation_pct` on categories and items, `v_budget_category_totals`, both existing budget views recreated), the allocation math in `src/lib/budget.ts`, `src/lib/budget-allocations.ts`, `setTotalBudget`/`setCategoryAllocation`/`applySuggestedAllocations`, and the `/budget` header, category rollup, item allocation field and dashboard stat. 473 tests, 250 SQL assertions, clean build. Same live/browser caveat as every session since 12 — see §13. **§8's suggested percentages shipped as the placeholder they are described as; the numbers still want the planner's eye.** | Spec 6 / 6.1 and spec 18, already built |
| 20 | [A last name column and real-name "Side" on the guest list](20-guest-last-name-column-and-named-sides.md) | **Proposed, not built — no migration, no code.** `guests.last_name` and `guests.side` already exist (V1); this splits the guest table's "Name" column into First/Last, adds a Side badge and filter using spec 15's `collaborators.display_name` (so Side shows "Ray"/"Olivia" instead of "Partner A"/"Partner B"), and wires up the `side` filter that already exists in `GuestFilters` but has no `FilterBar` control. Nothing is built until §5's questions are answered — chiefly whether `partner_a`/`partner_b` may just map to owner/non-owner, and whether "so we know who's in charge of emails" means a label or actual notification routing (out of scope as written). | V1 (guests), spec 15 (`collaborators.display_name`), already built |

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
planner feedback, all answered and built end to end 2026-09-17.** Spec 11
(list titles, moving/reordering sections, cascading completion) and spec 12
(reordering the lists sidebar) both sit on top of specs 1, 3 and 10 only,
and have no dependency on each other — either can be built first. Spec 13
(navigation regrouping) depends on the underlying screens each grouping
touches (specs 1, 3, 5 part B, 6, plus V1's own guest/invitation/event
surface) but not on specs 11 or 12 — it reshuffles `Nav` and adds shared tab
strips over existing routes, and works the same way whether or not 11 or 12
have shipped. Spec 13's one genuine conflict (§5 question 1: Invitations
was asked to pair with both Guests and Questions) is resolved as a
cross-link rather than a shared tab — see that spec's §1D and §5.

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

**Spec 14 is the first spec since V1 aimed at the public surface itself.**
It depends on nothing but V1's `site_content`, `events` and invitation
tokens, and on spec 9 only insofar as moodboards already publish into `/w`
and keep their section there. It claims migration `0015_public_site.sql`;
nothing else does. Its §15 build order is deliberately shippable in pieces. After session 20's
three rounds of answers, **nothing in it is blocked**, and steps 0–3 (the slug
column, theme and renderer, schedule and FAQ, and the whole invitation
surface) need one column between them. Step 3 is the only part carrying a date
that cannot move, so it goes first if the send is close. Note that Q9's answer
added `weddings.slug` after §4 had already been called settled — the spec
records that correction rather than absorbing it, and it is why there are two
migrations instead of one.

**Specs 15–17 are one round of task-list feedback, condensed from an
earlier six-file split down to three** at the planner's direct request.
The first draft treated "which date is a calculated due date relative to"
and "what does 'research under a section' mean" as open questions blocking
the build; the planner's own "brain dump" example resolved the second one
(a section-*kind* toggle — checklist vs. plain-text lines — covers both
requests with one mechanism, folded into spec 15 §4) and there was no need
to leave the first one open either, once "the wedding date, not a
per-list event" was picked as the sensible default (spec 15 §5) rather
than a question. All three specs now ship with zero open questions. Spec
15 (list content — editing, notes sections, calculated dates, hiding
completed) and spec 17 (CSV export) touch `/lists/[id]` and its item
model; spec 16 (sidebar, list appearance, budget-section links) is
independent of both and could be built first, last, or alongside them.
