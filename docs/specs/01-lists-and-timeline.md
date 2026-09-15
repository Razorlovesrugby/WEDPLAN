# Feature spec: Lists, with an auto-synced timeline

**Status: schema landed (`supabase/migrations/0004_lists.sql`), verified
against `verify-migrations.sh`, `verify-bootstrap.sh`, and a manual smoke
test of the timeline view's filter behaviour (below). No server action,
query, screen, or seed loader exists yet. Open questions (section 10) are
now answered — several answers expand scope beyond the original schema
(board view, sub-item nesting, recurrence, assignment) and require schema
changes before `0004_lists.sql` is final. See section 10 for the decisions
and section 5a for the resulting schema deltas.**

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

**Not yet built:**
- `src/server/queries/lists.ts` — list all lists with progress, read one
  list with sections/items, the four smart-view queries, the timeline
  query.
- `src/server/actions/lists.ts` — create/rename/archive a list,
  instantiate a template, add/edit/reorder/tick/flag/date/assign a section
  or item, add/remove a sub-item, change status (list and board), set or
  clear a repeat rule.
- `src/lib/lists/generate.ts` — pure offset-to-date logic for the timeline
  template: given a wedding date and the template's items, compute
  insert/update rows, clamp anything landing before today into an explicit
  overdue-on-import state. Unit-tested directly before it's wired into a
  server action, per the `lib/` convention in `docs/HANDOFF.md` section 8.
- `scripts/seed-templates.mjs` — load `supabase/templates/checklists.json`
  and a restructured `task-timeline.json` into `list_templates`, upsert on
  `key`.

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

## 9. Build order for the next session

1. ~~`0004_lists.sql`~~ — done, verified (section 7).
2. `0005_lists_status_assignment.sql` (name indicative) — the schema
   deltas from section 5a: `status`, `parent_item_id`, `repeat_rule`,
   `recurrence_parent_id`, `assigned_to`. Re-run `verify-migrations.sh` /
   `verify-bootstrap.sh`.
3. Restructure `supabase/templates/task-timeline.json` so its 175 tasks load
   as one `list_templates` payload (title, bucket, offset_days, note per
   item) rather than a separate task-template shape — same JSON shape
   `checklists.json` already uses, just with `offset_days` present per item.
   Exclude the registry template from `scripts/seed-templates.mjs`'s load
   list per open question 1 — leave its entry in `checklists.json` rather
   than deleting 147 items of content, since it may be wanted again for a
   future US-facing variant; it just never reaches `list_templates`.
4. `scripts/seed-templates.mjs`.
5. `src/lib/lists/generate.ts` + unit tests, including recurrence
   (open question 6) — needs its repeat-rule shape settled first.
6. `src/server/queries/lists.ts`, `src/server/actions/lists.ts` — covering
   status transitions, sub-items, assignment, and NL quick-add parsing
   (open question 4).
7. `/lists`, `/lists/[id]`, `/timeline` (drag-to-reschedule, zoom),
   `/board`, `/setup/plan` (real empty state for no wedding date).
8. Cross-wedding RLS test for `list_items`.
9. Full check pass (`typecheck`, `npm test`, `verify-migrations.sh`,
   `verify-bootstrap.sh`, `npm run build`) and a real browser pass before
   calling any of it done.

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
