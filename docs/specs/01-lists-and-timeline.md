# Feature spec: Lists, with an auto-synced timeline

**Status: built end to end and verified locally — schema (`0004_lists.sql` +
`0005_lists_status_assignment.sql`), seed data restructuring, generation
logic, server queries/actions, and all five screens from section 6. Not yet
applied to the live project (nobody has run these migrations against
`lsgbwxisqqazahgkibmj` — see `docs/HANDOFF.md` section 0) and not yet opened
in a browser — see the caveats at the end of this status block and in
`docs/HANDOFF.md`'s "Active work" section.**

**What's actually done, this pass:**
- `supabase/migrations/0005_lists_status_assignment.sql` — every schema delta
  from section 5a: `status`, `parent_item_id` (with a database trigger
  enforcing one level of nesting), `repeat_rule`, `recurrence_parent_id`,
  `assigned_to`, and the parent-status auto-derivation trigger described
  there. `v_timeline_items` replaced (not edited — 0004 stays frozen) to
  surface the three new columns.
- `supabase/templates/task-timeline.json` restructured into the same
  `{source, templates: {key: {label, sections, item_count}}}` shape
  `checklists.json` already used, with `offset_days`/`note` per item —
  build order step 3.
- `scripts/seed-templates.mjs` — loads decor, stationery and the timeline
  template into `list_templates`; registry and photography stay in
  `checklists.json` but are deliberately not loaded (open question 1).
- `src/lib/lists/generate.ts` — offset-to-date generation (with an explicit
  `overdue_on_import` flag rather than clamping the date itself),
  recurrence (`computeNextDueDate`, `shouldSpawnNext`, `spawnNextOccurrence`),
  and natural-language quick-add parsing. 29 unit tests in
  `generate.test.ts`, covering every case in section 8's test plan for this
  layer.
- `src/server/queries/lists.ts` and `src/server/actions/lists.ts` — every
  query and action listed in section 7, including status transitions,
  sub-items, assignment, recurrence spawning on completion, and NL
  quick-add.
- All five screens: `/lists`, `/lists/[id]`, `/timeline`, `/board`,
  `/setup/plan` (with a real empty state for the unset wedding date).
- A cross-wedding RLS test section (`supabase/tests/01_tenancy.sql` section
  9) covering `lists`/`list_sections`/`list_items` isolation,
  `list_templates`' read-all/write-none policy, the composite FK, one-level
  nesting, and the parent-status auto-derivation trigger.
- `verify-migrations.sh` (70 assertions), `verify-bootstrap.sh`,
  `npm run typecheck`, `npm test` (159 tests) and `npm run build` all pass.

**What's genuinely simplified or deferred, so nobody re-discovers these as bugs:**
- **Reordering renumbers, it doesn't use a fractional index.**
  `list_items.sort_order` is a plain integer (0004, frozen), not a
  fractional string like `households.rank` — so a drag-drop renumbers the
  whole section it happens in (`reorderItems` in `src/server/actions/lists.ts`)
  rather than computing one midpoint. Cheap at this app's scale; would need
  revisiting if lists ever got as large as the guest list.
- **Drag-to-reorder is scoped to one section at a time.** Dragging an item
  to a *different* section isn't built — only within the section it started
  in. Moving sections is possible via `updateItem`'s `section_id` field, just
  not through drag yet.
- **`/timeline`'s "drag-to-reschedule" snaps to a bucket, not a pixel-exact
  date.** Week zoom buckets by day (exact), but month zoom buckets by week
  and quarter zoom by month — dropping an item into a bucket sets its
  `due_date` to that bucket's start date, not to wherever the pointer let go
  within it.
- **Assignment is by role, not by name.** `assigned_to` is real
  (`auth.users.id`), but the UI labels the picker "You" / "Owner" / "Partner"
  rather than an email or display name — `auth.users` lives outside the
  `public` schema PostgREST exposes, and this app has never had a profile
  table. `getCollaborators` in `src/server/queries/wedding.ts` is the new
  query this leans on.
- **Never opened in a browser.** Everything above is typecheck-clean,
  unit-tested where it's pure logic, and RLS-tested against a throwaway
  cluster — none of which catches a rendering or drag-interaction bug, the
  exact gap `docs/HANDOFF.md` section 6 has flagged since session 3, and the
  exact class of bug section 6's own `/guests/rank` story is about. The
  three drag surfaces here (list reordering, timeline rescheduling, board
  status) are the most exposed to it and the least excusable to skip.

This spec replaces the earlier separate "Checklists" and "Task timeline"
specs. They were two features joined by a manual "turn this checklist item
into a task" action. That's the wrong shape for what was actually asked
for: one system, Apple Reminders' list model plus a Jira-style timeline
that updates itself. See section 3 for why the schema is now one table
family instead of two.

## 1. Product framing

**Persona: AI-native, Type A, spreadsheet-fluent, and already fluent in
Jira/Trello and the Apple ecosystem.** Not a casual to-do app user — someone
who expects speed, keyboard-first interaction, and zero friction between
"I thought of something" and "it's captured, dated, and visible everywhere
it's relevant." No guest-facing or invitation surface is part of this
feature; V1's guest/RSVP system is untouched and this spec never reads or
writes `guests`, `households`, `invitations`, or `rsvp_*`.

**Two borrowed models, fused:**

- **Apple Reminders** — any number of freeform lists, created at will, no
  fixed taxonomy. An item is a title plus optional notes, a due date, a
  flag, a priority. Smart, computed views (Today, Scheduled, Flagged, All)
  sit alongside the user's own lists and are never edited directly — they're
  filters, not storage.
- **Jira's timeline** — a chronological view across many items at once,
  not a single list read top to bottom. Here, it's simpler than Jira's
  (no epics, no swimlanes-by-assignee by default — see open questions):
  every item with a due date, from every list, laid out by date.

**The integration is the feature.** Setting a due date on an item — in any
list, whether it's a decor checklist or a blank list created five seconds
ago — is the only action that puts it on the timeline. There is no second
step, no separate "task," nothing to keep in sync, because there is nothing
to convert.

## 2. What this replaces

Every separate spreadsheet tab that's really "a list of things, some with
dates": the decor checklist, the stationery checklist, the gift/registry
list, and the 175-row "Checklist & Timeline" tab that recomputes due dates
from the wedding date. One primitive now covers all of them.

## 3. Why one table family, not two

The earlier specs modelled `checklist_items` (no date, lives in a checklist)
and `tasks` (has a date, lives in a flat list) as separate tables, connected
by an optional `checklist_items.task_id`. That's a reasonable model for two
*different* features. It's the wrong model for *one* feature where "does
this item have a date" is a fact about the item, not a fact about which
table it's in.

The unified model: `list_items` always belongs to a `list`, and always may
or may not have a `due_date`. The timeline isn't a table — it's
`v_timeline_items`, a view that selects every `list_items` row with a
`due_date`, joined back to its list for context (title, colour, kind). Add
a date to an item, it's on the timeline on the next read, automatically.
Clear the date, it's gone from the timeline and still sitting in its list.
This was smoke-tested directly (insert one dated item, one undated item in
the same list; the view returns exactly the dated one) — see section 7.

The 175-item "Checklist & Timeline" seed becomes a `list_templates` row like
any other checklist template, except its items carry `offset_days`. At
generation time, `offset_days` against `weddings.wedding_date` produces a
real `due_date`, written onto ordinary `list_items` rows in an ordinary
(if system-created) list. No separate generation target, no separate table.

## 4. Scope

**In:**
- `lists` a wedding can create without limit — from a template or blank.
- `list_sections` for grouping within a list (the seed data already needs
  this — e.g. "Ceremony decor" vs. "Reception decor" within one Decor list).
- `list_items`: title, notes, qty, url, due date, flag, priority, done
  state (now three states — see section 5a), assignment (`assigned_to`),
  free reordering, and one level of sub-items (see section 5a).
- Smart views computed from `list_items`, not stored: **Today** (due today,
  not done), **Scheduled** (any due date, not done), **Flagged**, **All**
  (every item, every list), plus a per-person filter driven by
  `assigned_to` (open question 8).
- User-selectable sort within a list/smart view — due date, priority, or
  manual order — defaulting to due date (open question 9).
- The timeline screen: every dated item across every list, chronological,
  grouped/coloured by originating list, with week/month/quarter zoom and
  drag-to-reschedule (open question 3).
- A board (Kanban) view over the same `list_items`, grouped by status —
  Not started / In progress / Done (open question 2).
- Natural-language quick-add ("tomorrow", "next Friday") parsed from the
  title field into a real `due_date` (open question 4).
- Recurring items with a repeat rule (open question 6).
- Seed data: decor and stationery checklist templates plus the date-offset
  timeline template (`supabase/templates/task-timeline.json`, restructured
  to load as one more `list_templates` row rather than a separate
  task-template table — see section 8, build order). The registry/gift-list
  template is dropped (open question 1) — US-shaped, doesn't fit a UK
  wedding.
- Idempotent generation for the timeline template specifically: pick it,
  preview computed dates against the actual wedding date, generate. Safe to
  re-run after the date changes. Wedding date isn't set yet (open question
  7), so `/setup/plan` must ship a real empty state, not just an edge case.

**Out, explicitly, this pass:**
- No vendor or budget link on any item — those tables don't exist until V2.
- No `task_dependencies` / ordering-between-items table. Nothing in the
  seed data has a real dependency edge to model.
- Registry/gift-list template dropped, not just deprioritised (open
  question 1).
- Nesting stops at one level of sub-items — no grandchildren (open
  question 5).

## 5. Data model — landed in `0004_lists.sql`

```
list_templates   id, key, title, kind, sort_order, payload (jsonb)
                 -- global reference data, no wedding_id, read-only via API
                 -- items in payload MAY carry offset_days for generation

lists            id, wedding_id, template_key, title, kind, color, icon,
                 event_id, sort_order, archived_at

list_sections    id, wedding_id, list_id, title, sort_order

list_items       id, wedding_id, list_id, section_id, title, notes, qty,
                 url, due_date, done_at, done_by, flagged, priority,
                 snoozed_until, sort_order, template_key, offset_days,
                 generated_at

v_timeline_items -- view: every list_items row with a due_date, joined to
                    its list, where the list isn't archived. security_invoker
                    so RLS on list_items still applies to whoever queries it.
```

- `kind` (`checklist | timeline | generic`) is display metadata, not a
  behavioural fork — a "timeline"-kind list is still just a list, it just
  gets a default view/icon suited to dated items.
- `done_at timestamptz`, not a boolean — matches the rest of the schema
  (`invitations.sent_at`, `rsvps.responded_at`).
- `flagged boolean` and `priority smallint` are Apple Reminders' flag and
  priority, kept as two separate concepts rather than folded into one.
- `template_key` + `offset_days` on `list_items` are set only for
  generated rows. `(wedding_id, template_key)` is a unique constraint, so
  regenerating the same template for the same wedding updates the existing
  row rather than duplicating it.
- RLS: `list_templates` is readable by any authenticated collaborator,
  writable by nobody through the API. `lists` / `list_sections` /
  `list_items` follow the standard tenant policy
  (`is_collaborator(wedding_id)`).

## 5a. Schema deltas required by section 10's answers

`0004_lists.sql` as landed does not yet cover these — a follow-up migration
is needed before the build order in section 9 can proceed past step 3:

- **Status beyond done/not-done** (open question 2): board view needs
  "in progress" as a distinct state from "not started" and "done". Add a
  `status` column (`not_started | in_progress | done`) rather than
  inferring it from `done_at`; keep `done_at` as the completion timestamp,
  set when `status` transitions to `done`. Transitions are manual (drag on
  the board, or an explicit control on the list view) **except** one
  automatic rule: a parent item with sub-items moves to `in_progress` the
  moment any sub-item is done while at least one remains not-done, and
  back to `not_started` if all its sub-items become not-done again. A
  direct manual status set on the parent always wins over the derived
  value until its sub-item completion state next changes.
- **One level of sub-items** (open question 5): `list_items` gets a
  self-referencing nullable `parent_item_id`. Constrain to one level (a
  row with a non-null `parent_item_id` cannot itself be a parent) at the
  application layer or via a check/trigger — schema doesn't need a second
  table. A sub-item is an ordinary `list_items` row in every other
  respect: it can carry its own `due_date`, and if it does it appears on
  `v_timeline_items` exactly like a top-level item (same rule as section
  3 — "add a date, it's on the timeline," with no exception for depth).
  A parent's own `status` auto-derives `in_progress` when some but not all
  of its sub-items are done (and no manual override is in play) — see the
  status rule below.
- **Recurrence**: `repeat_rule jsonb` on `list_items` — full weekday/
  monthly patterns (e.g. "every Monday," "the 1st of the month," plus
  simple N-day/week/month intervals), with an explicit end condition
  (after N occurrences, until a date, or none). Completing a recurring
  item **spawns a new `list_items` row** for the next occurrence and
  leaves the completed row as a record — recurrence produces history, it
  doesn't reset in place. `list_items` needs a `recurrence_parent_id`
  (self-referencing, nullable) so spawned occurrences trace back to the
  originating item and its `repeat_rule`. The rule-shape parser (cron-like
  vs. a small structured enum) is an implementation choice for step 5 of
  the build order, not a product decision — Apple Reminders' own set of
  patterns is a reasonable reference.
- **Assignment** (open question 8): `assigned_to uuid references
  auth.users (id) on delete set null` on `list_items` — same convention as
  the existing `done_by`, not a new reference to `collaborators`. Nullable
  (unassigned = shared pool). Smart views gain an "assigned to me" filter
  (`assigned_to = auth.uid()`).
- **Sort preference** (open question 9): no schema change — `priority`
  and `sort_order` already exist; the due-date/priority/manual toggle is a
  query-time `ORDER BY` choice. Decided: persisted client-side
  (`localStorage`, per list/smart-view id), not server-side — it's a view
  preference, not shared data, and needs no schema column or round trip.

None of this invalidates the `v_timeline_items` view or the core
list/section/item shape — these are additive columns.

## 6. Screens

| Route | What it does |
| --- | --- |
| `/lists` | Sidebar of the wedding's lists plus the smart views (Today, Scheduled, Flagged, All, and "Assigned to me"); selecting one shows its sections and items |
| `/lists/[id]` | One list: sections, inline add/edit, tick, flag, set a date, assign, add a sub-item, reorder |
| `/timeline` | Every dated item across every list, chronological, grouped/coloured by list, with week/month/quarter zoom and drag-to-reschedule |
| `/board` | Every item across every list (or scoped to one list), grouped into Not started / In progress / Done columns; drag between columns to change status |
| `/setup/plan` | Instantiate the timeline template: preview computed dates against the wedding date, generate |

**Interaction bar, matching the persona:** inline add without a modal
(type a title, hit enter, it's in the list), inline date-setting without
leaving the row, keyboard navigation between rows, optimistic updates (a
tick or a reorder reflects instantly, confirms against the server after).
`docs/HANDOFF.md` section 6 has two real, previously-shipped bugs in
`/guests/rank` — a CSS containment bug that rendered a virtualised list
blank, and a drag modifier that silently clamped every drag to zero
movement. Both passed typecheck, unit tests, and a clean build. Anything
here using virtualisation or drag (a long list, a draggable timeline, a
draggable board) is exposed to the exact same class of bug and needs to
actually be opened in a browser, not just checked.

## 7. Server actions, queries, and what's already verified

**Verified this session, schema only:**
- `verify-migrations.sh` (52 assertions) and `verify-bootstrap.sh` both
  green with `0004_lists.sql` applied.
- Manual smoke test: seeded a list, inserted one item with a `due_date` and
  one without, queried `v_timeline_items` — exactly the dated item came
  back. Confirms the auto-sync mechanism works before any application code
  is built on top of it.

**Built this pass — see the status block at the top for what's simplified:**
- `src/server/queries/lists.ts` — lists, one list's sections/items, all
  five smart views (today/scheduled/flagged/all/mine), the timeline query
  (`v_timeline_items`), the board query, and a read-only timeline-template
  preview shared with `/setup/plan`.
- `src/server/actions/lists.ts` — create/update/archive a list, instantiate
  a checklist template, generate the timeline template (idempotent, upserts
  on `(wedding_id, template_key)`), add/rename/remove a section,
  add/quick-add/update/tick/flag/date/priority/assign an item, add a
  sub-item (one level, enforced by 0005's trigger), set/clear a repeat rule,
  reorder, delete.
- `src/lib/lists/generate.ts` — offset-to-date generation (returns an
  `overdue_on_import` flag rather than clamping the date), recurrence, and
  NL quick-add parsing. Unit-tested directly, per the `lib/` convention in
  `docs/HANDOFF.md` section 8.
- `scripts/seed-templates.mjs` — loads `checklists.json`'s decor and
  stationery templates and the restructured `task-timeline.json` into
  `list_templates`, upsert on `key`.

## 8. Test plan

- Unit tests: generation logic (normal engagement, null wedding date,
  short engagement clamp, re-generate after a date change, re-generate with
  no change), template-instantiation copy logic, smart-view filter logic
  (including "assigned to me"), NL quick-add parsing (a representative set
  of phrases plus unparseable input falling back to no date), recurrence
  (next-occurrence computation for each supported pattern, end condition,
  completing a recurring item spawns a new row and leaves history),
  status-transition logic (not_started →
  in_progress → done and back, and its interaction with `done_at`), the
  parent-status auto-derivation from sub-item completion (including a
  manual override on the parent holding until the next sub-item change),
  and one-level sub-item constraints (a sub-item can't itself be a
  parent).
- Add a cross-wedding RLS assertion for at least `list_items` to
  `supabase/tests/01_tenancy.sql` — none exists yet for any table in this
  feature.
- `typecheck`, `npm test`, `npm run build` clean (not yet run this session —
  `node_modules` isn't installed in this container).
- Opened in a browser: create a blank list, add an item, set a date,
  confirm it appears on `/timeline` with no other action; clear the date,
  confirm it disappears from `/timeline` and stays in its list; instantiate
  the timeline template against a real wedding date and spot-check a few
  computed dates by hand; drag an item on `/timeline` and confirm its
  `due_date` updates; drag an item between columns on `/board` and confirm
  its status (and `done_at` where relevant) updates; add a sub-item and
  confirm it's scoped to its parent.

## 9. Build order

1. ~~`0004_lists.sql`~~ — done, verified (section 7).
2. ~~`0005_lists_status_assignment.sql`~~ — done. Schema deltas from section
   5a: `status`, `parent_item_id` (plus a one-level-nesting trigger and the
   parent-status auto-derivation trigger), `repeat_rule`,
   `recurrence_parent_id`, `assigned_to`. `verify-migrations.sh` (70
   assertions) and `verify-bootstrap.sh` both green with it applied.
3. ~~Restructure `supabase/templates/task-timeline.json`~~ — done. Registry
   stays in `checklists.json` unloaded, per open question 1; photography
   stays too, for the same "kept for a possible future variant" reason,
   also unloaded.
4. ~~`scripts/seed-templates.mjs`~~ — done. Not yet run against a live
   project — needs `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`, which no session has had for this project
   (see `docs/HANDOFF.md` section 0).
5. ~~`src/lib/lists/generate.ts` + unit tests~~ — done, including
   recurrence (open question 6). 29 tests.
6. ~~`src/server/queries/lists.ts`, `src/server/actions/lists.ts`~~ — done,
   covering status transitions, sub-items, assignment, and NL quick-add
   parsing (open question 4).
7. ~~`/lists`, `/lists/[id]`, `/timeline`, `/board`, `/setup/plan`~~ — done.
   See the status block at the top for where drag-to-reschedule and
   drag-to-reorder are simplified.
8. ~~Cross-wedding RLS test for `list_items`~~ — done, plus `lists`,
   `list_sections`, `list_templates`, the composite FK, one-level nesting,
   and the parent-status trigger (`supabase/tests/01_tenancy.sql` section 9).
9. ~~Full check pass~~ — `typecheck`, `npm test` (159 tests),
   `verify-migrations.sh`, `verify-bootstrap.sh`, `npm run build` all green.
   **Not done: a real browser pass.** No live Supabase project was reachable
   from this session (same gap as every prior session — see
   `docs/HANDOFF.md` section 0), so nothing above has been watched actually
   render or drag. That is the next thing to do with this branch, not an
   afterthought — see the status block's last bullet.

## 10. Open questions — answered

**1. Which seed templates ship as starting points?** Decided: drop the
registry/gift-list template (US-shaped, doesn't map to a UK wedding). Ship
decor, stationery, and the timeline template only.

**2. Board (Kanban) view, alongside the timeline?** Decided: yes. A
status-grouped board (Not started / In progress / Done) ships as a second
view over `list_items`. Requires the `status` column in section 5a —
"done" is no longer just `done_at is not null`.

**3. Timeline interaction — drag to reschedule, and what zoom levels?**
Decided: yes to both. Dragging an item on the timeline updates its
`due_date`; the timeline supports week / month / quarter zoom, given the
seed data spans over a year (-391 to -1 days).

**4. Natural-language quick add?** Decided: yes, build it for v1 — parse
phrases like "tomorrow," "next Friday," "in 2 weeks" typed into the title
field into a real `due_date`, rather than shipping only a plain date
picker.

**5. Nesting beyond one level of sections?** Decided: yes, true nesting —
an item can have child sub-items (one level deep, not arbitrary depth; see
`parent_item_id` in section 5a). Sub-items can carry their own due date
and appear on the timeline like any other item. A parent auto-shows
`in_progress` while some but not all of its sub-items are done.

**6. Recurring items?** Decided: yes, build it, with Apple-Reminders-style
patterns (weekday/monthly, plus simple N-day/week/month intervals) and an
explicit end condition. Completing a recurring item spawns a new row for
the next occurrence rather than resetting in place, so completion history
is kept (`recurrence_parent_id`, section 5a).

**7. Is the wedding date set?** No, not set yet. `/setup/plan` must ship a
real empty state for the unset-date case, not just handle it as an edge
case.

**8. Assignment between the two of you, or fully shared?** Decided: add
`assigned_to` and per-person filtered views (e.g. "assigned to me"),
rather than a fully shared pool.

**9. Priority levels — how many, and shown how?** Confirmed: three levels
(matching Apple Reminders' `!`/`!!`/`!!!`), keeping `priority smallint` as
already landed. Sort is user-selectable — due date, priority, or manual
order — defaulting to due date when a list/smart view is first opened.
