# Feature spec: List content — inline editing everywhere, notes sections, calculated due dates, and hiding completed tasks

**Status: built, same session.** `0016_list_content_and_calculated_dates.sql`
(`collaborators.display_name`, the `list_section_kind` enum +
`list_sections.kind`, `list_items.due_date_offset_days`); section, task, and
sub-task titles are now `InlineText` (reusing `renameSection`/`updateItem`);
a "Names" section in `/settings` (`CollaboratorNamesEditor`); a due-date ×
clear button; a fixed/relative toggle on every date row (`setDueDateOffset`,
recomputed in `updateWeddingSettings` whenever the wedding date changes); a
section-kind picker ("Checklist" / "Notes") on "Add a section," with
notes-kind sections rendering plain editable lines (no checkbox/date/flag/
priority/assignment) and excluded from `getAllItems`/`getBoardItems` so a
brain-dump line never shows up as a task; and a client-persisted "Hide
completed" toggle on `/lists/[id]` and every smart view. A checklist item
can no longer be dragged or selected into a notes section (`list-detail.tsx`'s
`applyItemMove` guard). `npm run typecheck`, `npm test` (384 tests),
`scripts/verify-migrations.sh` (192 SQL assertions, +5 for this migration),
`scripts/verify-bootstrap.sh`, and `npm run build` all pass. Not opened
against a live project or a real browser — same caveat every prior spec in
this rebase carries.

**Depends on:** Spec 1 (lists/sections/items, `assigned_to`,
`due_date`), spec 10 (`sortCompletedLast`), spec 11 (`InlineText`, already
wired to a list's own title). All already built.

## 1. Section, task, and sub-task titles become editable

`renameSection(sectionId, title)` already exists
(`src/server/actions/lists.ts:342`) and `updateItem(itemId, { title })`
already accepts a title patch — neither needs server-side work. The gap is
purely UI: `list-detail.tsx:432` renders a section's name as a plain
`<h2>`, and `item-row.tsx:185` renders a task's title as a plain `<span>`.
Both become `InlineText` (click, edit, Enter/blur saves, Escape cancels —
the exact component spec 11 already wired to a list's own title). Since
sub-items render through the same `ItemRow`, wiring the one span covers
task and sub-task titles alike — no separate sub-item component to touch.

## 2. Assignment shows a real name, not "You" / "Owner" / "Partner"

`collaborators` (`id, wedding_id, user_id, role, created_at`) has no name
field — spec 1 punted on this because `auth.users` sits outside the schema
PostgREST exposes and this app has never had a profile table. This adds
one:

```
collaborators   display_name text, nullable
```

Editable in `/settings` next to the existing role display, save-on-blur
like every other settings field. Every place that renders an assignee
(item rows, `TaskPreviewPopup`, the "assigned to me" view label, the
reminder digest) reads `display_name`, falling back to the current role
label when unset — a wedding that never sets a name keeps working exactly
as today. **Decided:** either collaborator can edit either name — this app
already treats shared state this way (list titles, section names,
`lists.sort_order`), and a per-person ownership check would be new
machinery for a two-person tenant where a typo fix shouldn't need the
other person to log in.

## 3. A due date can't be blanked once it's set

`setDueDate`/`onDateChange` already handle `null` correctly server-side —
clearing sends `null` and it saves. The bug is the native
`<input type="date">` widget: Safari (including iOS) has no clear
affordance at all, and Chrome's is easy to miss once a date is showing.
Adds an explicit × button next to the date input, visible only when a
date is set, calling the same clear path already wired.

## 4. "Notes" sections — the "brain dump" / research request

A section today is only ever a checklist — every item in it has a
checkbox, a due date, a status. What's being asked for (both "add research
under a section" and "a section for a free-text line called brain dump")
is a section that holds plain lines of text instead: capture something
without it becoming a to-do with a due date attached to it.

One mechanism covers both asks:

```
list_sections   kind text not null default 'checklist'  -- 'checklist' | 'notes'
```

- A `'checklist'` section (every section today, and the default for any
  new one) behaves exactly as it does now — nothing changes for existing
  data.
- A `'notes'` section renders its items as plain text lines: no checkbox,
  no due date, no flag, no priority, no status, no assignment — just a
  title, added the same inline quick-add way every section already
  supports, editable and deletable the same way. Under the hood it's still
  an ordinary `list_items` row (so no new table, no change to
  `v_timeline_items`/`/board`/the smart views — see below), just rendered
  without the task controls, since a notes-kind item never carries a due
  date, status, or assignment for any of those to act on.
- **A section's kind is fixed at creation** — `addSection` gains a `kind`
  parameter, chosen when the section is made ("Checklist" vs "Notes,"
  defaulting to "Checklist"). Switching an existing checklist section
  (with real tasks already sitting in it, due dates and all) into notes
  mode isn't offered — there's no sensible migration for a task that
  already has a due date and a status the moment it becomes a plain line.
  Creating a new "Brain dump" section costs nothing and is what the
  request actually names.
- Timeline, board, and the smart views (Today/Scheduled/Flagged/Assigned
  to me) naturally show nothing from a notes section, since none of its
  items ever carry a due date, flag, priority, or assignment — no filter
  changes needed anywhere but the section's own rendering in
  `list-detail.tsx`.

## 5. Calculated due dates ("Event − 2 weeks") instead of only a fixed date

Today a `due_date` is always a fixed calendar date; the one place this app
already computes a date from an offset is template generation
(`offset_days` against `weddings.wedding_date`, applied **once**, at
generate time — spec 1 §5a). This is different: setting a date as "2 weeks
before the wedding" on any ordinary item, at any time, and having it
*stay* correct if the wedding date later moves.

```
list_items   due_date_offset_days integer, nullable
             -- non-null: due_date is calculated, not fixed.
             -- negative = before the wedding date, positive = after,
             --   0 = on the day.
```

- **Anchor: the wedding date only** for this pass — not a per-list event
  date. `lists.event_id` exists, but nothing in the request names an
  event other than "the wedding," and a single anchor keeps the recompute
  logic (next bullet) to one column, one trigger path. A per-event anchor
  is a reasonable later addition, not built now.
- **Recompute happens in the one action that already changes
  `weddings.wedding_date`** (`src/server/actions/settings.ts`) — on save,
  it walks every `list_items` row with a non-null `due_date_offset_days`
  and rewrites `due_date` from the new anchor. That's the only write path
  to `wedding_date` today, so this stays correct without needing a
  database trigger; if a second write path to `wedding_date` is ever
  added, it needs the same recompute call, same as any other
  single-call-site convention already in this codebase.
- **Fixed and calculated are mutually exclusive per item**, same shape as
  the color-or-emoji rule in spec 16: typing a fixed date directly into an
  item that currently has an offset clears the offset; choosing "relative"
  on an item with a fixed date clears that date and starts the offset at
  0.
- **UI:** a toggle on `ItemRow`'s date row — "Fixed date" / "Relative to
  the wedding," the second showing a single "weeks before/after" number
  input (stored as `value * 7` days) next to the computed date, read-only
  ("2 weeks before → Sat 30 May 2026"). Matches the planner's own phrasing
  ("Event − 2 weeks," "Event − 4 weeks") rather than a raw day count.
- **Sub-items get this too** — a sub-item already carries its own
  `due_date` (spec 1 §5a); no special case needed.

## 6. Hiding completed tasks

Spec 10 already sinks completed items to the bottom of a list/section;
this adds hiding them outright. A "Hide completed" toggle sits next to
`/lists/[id]`'s existing due-date/priority/manual sort control, per list
and per smart view. **Decided: persisted client-side (`localStorage`),
same key/id scheme as the existing sort preference** (spec 1 §5a — "a view
preference, not shared data, needs no schema column or round trip").
Toggling it filters `status = 'done'` items out of the rendered list
entirely, applied after `sortCompletedLast`'s ordering (moot once they're
filtered, but keeps the two features independent rather than one assuming
the other is on).

## 7. Scope

**In:**
- `InlineText` wired to section headings and item/sub-item titles.
- `collaborators.display_name text`, an update action, and every
  assignee-rendering surface reading it with the role-label fallback.
- A × clear button on the due-date input.
- `list_sections.kind` (`checklist | notes`), `addSection`'s new
  parameter, and notes-mode rendering in `list-detail.tsx`.
- `list_items.due_date_offset_days`, the fixed/relative toggle in
  `ItemRow`, and the recompute call in the wedding-date-saving action.
- A "Hide completed" toggle, localStorage-persisted, on `/lists/[id]` and
  the smart views.

**Out:**
- No per-event anchor for calculated dates (§5) — wedding date only, this
  pass.
- No converting an existing checklist section to notes mode, or vice
  versa (§4).
- No avatar/initials/per-person color for assignment (§2) — just the
  label text.
- No server-side (shared) "hide completed" preference — client-only,
  matching the existing sort-preference precedent.

## 8. Data model

```
collaborators   display_name text, nullable
list_sections   kind text not null default 'checklist'  -- 'checklist' | 'notes'
list_items      due_date_offset_days integer, nullable
```

One migration, additive — no backfill needed for any of the three
(`kind` defaults every existing section to `'checklist'`, its current
behavior; the other two are nullable with no prior data to reconcile).

## 9. Test plan

- Unit: the due-date recompute logic (offset against a wedding date,
  against an unset wedding date — no crash, `due_date` stays null;
  switching an item between fixed and relative in both directions); the
  localStorage-persisted hide-completed filter's interaction with
  `sortCompletedLast`.
- SQL: extend `supabase/tests/01_tenancy.sql`'s `list_sections`/
  `list_items`/`collaborators` coverage for the three new columns.
- `npm run typecheck`, `npm test`, `npm run build`.
- Browser pass: rename a section, a task, and a sub-task inline; set a
  display name and confirm it shows on an assigned item and the reminder
  digest; set then clear a due date with the new × control; create a
  "Brain dump" notes section, add a few plain lines, confirm none of them
  show up on `/timeline` or `/board`; set an item to "2 weeks before the
  wedding," change the wedding date in `/settings`, confirm the item's due
  date moved with it; toggle "Hide completed" and confirm done items
  disappear and reappear.
