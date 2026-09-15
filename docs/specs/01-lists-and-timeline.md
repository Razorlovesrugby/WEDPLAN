# Feature spec: Lists, with an auto-synced timeline

**Status: schema landed (`supabase/migrations/0004_lists.sql`), verified
against `verify-migrations.sh`, `verify-bootstrap.sh`, and a manual smoke
test of the timeline view's filter behaviour (below). No server action,
query, screen, or seed loader exists yet. Open questions below are
unanswered — nothing past schema gets built until they are.**

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
  state, free reordering.
- Smart views computed from `list_items`, not stored: **Today** (due today,
  not done), **Scheduled** (any due date, not done), **Flagged**, **All**
  (every item, every list). Exact set confirmed in open questions.
- The timeline screen: every dated item across every list, chronological,
  grouped/coloured by originating list.
- Seed data: the four checklist templates
  (`supabase/templates/checklists.json`) and the date-offset timeline
  template (`supabase/templates/task-timeline.json`, restructured to load
  as one more `list_templates` row rather than a separate task-template
  table — see section 8, build order).
- Idempotent generation for the timeline template specifically: pick it,
  preview computed dates against the actual wedding date, generate. Safe to
  re-run after the date changes.

**Out, explicitly, this pass:**
- No vendor or budget link on any item — those tables don't exist until V2.
- No `task_dependencies` / ordering-between-items table. Nothing in the
  seed data has a real dependency edge to model.
- No board (Kanban) view unless open question 2 says yes.
- No natural-language quick-add ("tomorrow", "next Friday") unless open
  question 4 says yes — v1 assumes a real date picker.
- No nesting below one level of sections unless open question 5 says yes.
- No recurring items unless open question 6 says yes.

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

## 6. Screens

| Route | What it does |
| --- | --- |
| `/lists` | Sidebar of the wedding's lists plus the smart views (Today, Scheduled, Flagged, All); selecting one shows its sections and items |
| `/lists/[id]` | One list: sections, inline add/edit, tick, flag, set a date, reorder |
| `/timeline` | Every dated item across every list, chronological, grouped/coloured by list |
| `/setup/plan` | Instantiate the timeline template: preview computed dates against the wedding date, generate |

**Interaction bar, matching the persona:** inline add without a modal
(type a title, hit enter, it's in the list), inline date-setting without
leaving the row, keyboard navigation between rows, optimistic updates (a
tick or a reorder reflects instantly, confirms against the server after).
`docs/HANDOFF.md` section 6 has two real, previously-shipped bugs in
`/guests/rank` — a CSS containment bug that rendered a virtualised list
blank, and a drag modifier that silently clamped every drag to zero
movement. Both passed typecheck, unit tests, and a clean build. Anything
here using virtualisation or drag (a long list, a draggable timeline) is
exposed to the exact same class of bug and needs to actually be opened in a
browser, not just checked.

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
  instantiate a template, add/edit/reorder/tick/flag/date a section or item.
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
  no change), template-instantiation copy logic, smart-view filter logic.
- Add a cross-wedding RLS assertion for at least `list_items` to
  `supabase/tests/01_tenancy.sql` — none exists yet for any table in this
  feature.
- `typecheck`, `npm test`, `npm run build` clean (not yet run this session —
  `node_modules` isn't installed in this container).
- Opened in a browser: create a blank list, add an item, set a date,
  confirm it appears on `/timeline` with no other action; clear the date,
  confirm it disappears from `/timeline` and stays in its list; instantiate
  the timeline template against a real wedding date and spot-check a few
  computed dates by hand.

## 9. Build order for the next session

1. ~~`0004_lists.sql`~~ — done, verified (section 7).
2. Restructure `supabase/templates/task-timeline.json` so its 175 tasks load
   as one `list_templates` payload (title, bucket, offset_days, note per
   item) rather than a separate task-template shape — same JSON shape
   `checklists.json` already uses, just with `offset_days` present per item.
3. `scripts/seed-templates.mjs`.
4. `src/lib/lists/generate.ts` + unit tests.
5. `src/server/queries/lists.ts`, `src/server/actions/lists.ts`.
6. `/lists`, `/lists/[id]`, `/timeline`, `/setup/plan`.
7. Cross-wedding RLS test for `list_items`.
8. Full check pass (`typecheck`, `npm test`, `verify-migrations.sh`,
   `verify-bootstrap.sh`, `npm run build`) and a real browser pass before
   calling any of it done.

## 10. Open questions

**1. Which seed templates ship as starting points?** The registry/gift-list
template (147 items) is the most US-shaped of the four — it assumes US
registry platforms with US bank payouts, which don't map to a UK wedding.
Ship all four (decor, stationery, registry, timeline) as-is, drop or
re-label registry, or something else? Given "maximum flexibility, I can add
any new list" is the actual requirement, templates are optional starting
points rather than a fixed menu — but the seed data still needs a decision
on what ships pre-loaded vs. what you'd rather build from blank.

**2. Board (Kanban) view, alongside the timeline?** You described the
persona as a heavy Jira/Trello user specifically, not just Apple Reminders.
Jira and Trello are board-first tools. Do you want a status-grouped board
(e.g. Not started / In progress / Done) as a second view over the same
`list_items`, or is List + Timeline the complete set for this pass? This
also decides whether `list_items` needs a third state beyond
done/not-done — right now "done" is just `done_at is not null`, with no
"in progress."

**3. Timeline interaction — drag to reschedule, and what zoom levels?**
Jira's timeline lets you drag a bar to change its dates. Do you want the
same here (drag an item horizontally to change its `due_date`), or is the
timeline read-mostly with dates edited from the list view? And should it
zoom (week / month / quarter), given the seed data spans over a year
(-391 to -1 days)?

**4. Natural-language quick add?** Apple Reminders and Things both parse
"tomorrow," "next Friday," "in 2 weeks" typed straight into the title field
into a real due date. Real engineering effort (a date-parsing library, or
hand-rolled parsing) versus a plain date picker. Worth it for v1, or a
second-pass polish item?

**5. Nesting beyond one level of sections?** Newer Apple Reminders supports
sub-items under an item. The seed data only ever needs one level (list →
section → item). Do you want true nesting (an item can have child items),
or is section-level grouping enough?

**6. Recurring items?** Apple Reminders supports repeat rules. A wedding is
a bounded, one-time project, so this is likely low value (a possible
exception: "check in with the caterer every 2 weeks"). Worth building, or
skip entirely?

**7. Is the wedding date set?** Needed to produce real due dates when
generating the timeline template. If not set yet, the feature still ships
(empty state on `/setup/plan`), but worth knowing whether this is currently
blocked on that decision.

**8. Assignment between the two of you, or fully shared?** `list_items`
records `done_by` (who ticked it), but nothing records who an item is
*for* before it's done. Do you want an `assigned_to` field and per-person
filtered views, or does everything stay a single shared pool for both
collaborators? (The earlier AI-native planning pass argued explicitly
against assignment-nagging between two people marrying each other — worth
deciding deliberately either way.)

**9. Priority levels — how many, and shown how?** The schema has
`priority smallint` (0 = none, ascending) already, matching Apple
Reminders' three-level `!`/`!!`/`!!!` scheme. Confirm three levels is
right, and whether smart views should sort by priority, due date, or
manual order by default.
