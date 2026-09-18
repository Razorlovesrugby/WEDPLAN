# Feature spec: List content — inline editing everywhere, notes sections, calculated due dates, and hiding completed tasks

**Status: built, then corrected, same round.** `0016_list_content_and_calculated_dates.sql`
built `collaborators.display_name`, `list_items.due_date_offset_days`, and
(§4's first draft) a `list_section_kind` enum + `list_sections.kind` for a
separate "Checklist vs. Notes" section type. Section, task, and sub-task
titles are `InlineText` (reusing `renameSection`/`updateItem`); a "Names"
section in `/settings` (`CollaboratorNamesEditor`); a due-date × clear
button; a fixed/relative toggle on every date row (`setDueDateOffset`,
recomputed in `updateWeddingSettings` whenever the wedding date changes);
and a client-persisted "Hide completed" toggle on `/lists/[id]` and every
smart view. **§4's section-kind picker was then replaced, same round, once
the planner described the actual want in full — see §4a.**
`0018_section_notes.sql` retires `kind`/`list_section_kind` outright and adds
`list_sections.notes`: every section, new or already existing, now carries
one free-text field alongside its checklist, not a choice between the two.
`npm run typecheck`, `npm test`, `scripts/verify-migrations.sh`,
`scripts/verify-bootstrap.sh`, and `npm run build` all pass on both
migrations in sequence. Not opened against a live project or a real
browser — same caveat every prior spec in this rebase carries.

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

## 4. Section notes — the "brain dump" / research request (corrected — see §4a)

**Superseded, same round, once the planner described the actual use case in
full — see §4a for what shipped instead.** The paragraphs below are the
original build, kept for the record rather than deleted, per this repo's own
convention (spec 12 §4 does the same for its own reversed draft).

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

## 4a. What shipped instead: a free-text field on every section

The build above shipped, then the planner asked to revisit it: a separate
"Notes" *kind* of section — pick Checklist or Notes at creation, mutually
exclusive — is not what was meant. The real want, given in full with a
worked example: an existing section like "Tuxedo" (under a "Suit" list)
already has real tasks in it, and *also* needs somewhere to keep reference
links and notes ("tried three tuxedo places, liked this one") that aren't
themselves a task — as part of that same section, not walled off in a
separate one. Every section should carry both a checklist **and** a notes
field, not a choice between them.

```
list_sections   notes text, nullable  -- replaces 0016's kind column/enum
```

- `0018_section_notes.sql` adds `list_sections.notes` and drops `0016`'s
  `kind` column and its `list_section_kind` enum outright — the "kind"
  concept is retired, not deprecated alongside the new field. Nothing needed
  migrating: no section had notes text before this column existed, whatever
  its old kind was, and a `kind = 'notes'` section's existing plain-text
  items are unaffected — they just render with full task controls again
  once `kind` (and the notesOnly rendering path it drove) is gone.
- **Every section — new or already existing — gets the field**, not a
  subset chosen at creation. `SectionNotes` (`section-notes.tsx`) renders
  directly under a section's own title: collapsed to a single line (`+ Add
  notes`, or a truncated preview of what's there) until clicked, then an
  editable, multi-line `<textarea>` that saves on blur via a new
  `updateSectionNotes(sectionId, notes)` action. Escape reverts and
  collapses without saving; Enter inserts a newline (this is prose, not a
  title — `InlineText`'s Enter-commits shape doesn't fit here).
- No filtering needed anywhere: since notes now live on the *section* row
  itself rather than as `list_items` rows, `getAllItems`/`getBoardItems`
  need no special-casing (the `excludeNotes` helper §4's build added is
  gone), and there's no longer a "can a task move into this section"
  question either — every section is a normal move-to destination again
  (the `applyItemMove` guard §4's build added is gone too).
- The "Add a section" form drops the Checklist/Notes picker entirely —
  `addSection` goes back to taking just a title.

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
- `list_sections.notes` and `SectionNotes` — see §4a, which superseded the
  `kind`-based version originally listed here.
- `list_items.due_date_offset_days`, the fixed/relative toggle in
  `ItemRow`, and the recompute call in the wedding-date-saving action.
- A "Hide completed" toggle, localStorage-persisted, on `/lists/[id]` and
  the smart views.

**Out:**
- No per-event anchor for calculated dates (§5) — wedding date only, this
  pass.
- No separate "kind" of section (§4's original build) — every section has
  the same notes field now (§4a).
- No avatar/initials/per-person color for assignment (§2) — just the
  label text.
- No server-side (shared) "hide completed" preference — client-only,
  matching the existing sort-preference precedent.

## 8. Data model

As shipped (§4a supersedes §4's `kind` column):

```
collaborators   display_name text, nullable
list_sections   notes text, nullable
list_items      due_date_offset_days integer, nullable
```

Two migrations: `0016` (this spec's original build — `display_name`,
`due_date_offset_days`, and `kind`/`list_section_kind`, additive) and
`0018` (§4a's correction — adds `notes`, drops `kind` and the enum
outright). No backfill needed for any of it: `display_name` and
`due_date_offset_days` are nullable with no prior data to reconcile, and no
section had notes text before `0018`'s column existed, whatever its old
`kind` was.

## 9. Test plan

- Unit: the due-date recompute logic (offset against a wedding date,
  against an unset wedding date — no crash, `due_date` stays null;
  switching an item between fixed and relative in both directions); the
  localStorage-persisted hide-completed filter's interaction with
  `sortCompletedLast`.
- SQL: extend `supabase/tests/01_tenancy.sql`'s `list_sections`/
  `list_items`/`collaborators` coverage for the new columns (updated for
  `notes` once §4a replaced `kind`).
- `npm run typecheck`, `npm test`, `npm run build`.
- Browser pass: rename a section, a task, and a sub-task inline; set a
  display name and confirm it shows on an assigned item and the reminder
  digest; set then clear a due date with the new × control; open an
  existing section's notes field, type something, confirm it saves and
  the section's tasks are untouched; set an item to "2 weeks before the
  wedding," change the wedding date in `/settings`, confirm the item's due
  date moved with it; toggle "Hide completed" and confirm done items
  disappear and reappear.
