# Feature spec: The run sheet as one timeline

**Status: proposed, not built.** Asked for as a spec (2026-11-15). All five
open questions are answered (§12). Nothing is built until the planner says to
build it (see `docs/specs/README.md`).

**Depends on:** spec 5 part B (the run sheet whose shape this replaces),
spec 8 (vendors), spec 39 (`people`), spec 40 (wedding timezone and
`change_wedding_timezone`), spec 32 (audit log), spec 45 (no-drag), spec 48
(phone).

## 1. What was asked

1. One big list. No sections.
2. Items can run at the same time.
3. Every item has a start time and an end time.
4. Items are assigned to people: guests, vendors, and the couple, several at
   once. "Both of us, plus the photographer" is one item with three assignees.
5. One timeline of the whole day, not split into sections.
6. A list view as well, as a toggle over the same data.
7. Where the old screen grouped things (by event, by track), that information
   is not lost.
8. An item can still be set to start when another ends, so moving one moves
   what follows it. This is optional per item.
9. A printable per-person view is wanted next. It is a separate spec.

## 2. Story

> **As the couple**, planning the day, **I want** every task on one timeline
> with a start and an end, several running at once, and the right people on
> each, **so that** I can see the whole day and who is doing what without
> moving between sections.

## 3. What is built today (verified against the source)

### 3.1 Data

`run_sheet_items` (`0009`), plus `vendor_id` (`0029`):

- `event_id` is **not null** and a composite foreign key to `events`. An item
  cannot exist without an event, so a wedding with no events cannot have a run
  sheet.
- **Times are not stored.** An item is **pinned** (`pinned_at`) or **chained**
  (`predecessor_id` plus `offset_minutes`, starting at its predecessor's end).
  `duration_minutes` (0 to 1440) gives the end. Check constraints: a pinned
  item has `pinned_at` and no predecessor; an unpinned one has no `pinned_at`;
  an item cannot follow itself.
- An unpinned item with no predecessor is valid and shows "Time TBD".
- **One owner per item**: free-text `owner`, and `vendor_id` (`on delete set
  null`). No guest, collaborator or person link.
- `track` enum (`guests | couple | vendors | other`).
- `guest_visible`, `sort_order`, timestamps. `guest_visible` is written by the
  editor and read by nothing.
- `v_run_sheet_items` resolves `starts_at`/`ends_at` with a recursive CTE and
  derives `conflict`: true when an item's end passes the next pinned item **in
  the same event**.
- RLS is `is_collaborator(wedding_id)`, forced, anon revoked.

### 3.2 Screens

- `/run-sheet` is an **event picker**. With exactly one event that has items it
  redirects to that event's page.
- `/events/[id]/run-sheet` shows one event's items in **four parallel columns
  by track**, each its own drag list, with an "Add item" per column and a red
  banner counting conflicts.
- A native `<dialog>` editor: title, location, owner, track, duration, notes,
  a "Pinned to a fixed time" checkbox that swaps a `datetime-local` for a
  predecessor select plus gap, a live "Starts around …" preview, a
  guest-visible checkbox, delete with `window.confirm`.
- Rows show start time and duration in minutes. **No end time is shown.**
- Controls use emoji (`📌`, `⠿`, `⚠`).
- The events screen has a "Run sheet →" link per event.
- `setRunSheetItemVendor` exists in `vendors.ts` and **no screen calls it**.

### 3.3 Actions (`src/server/actions/run-sheet.ts`)

`createRunSheetItem`, `updateRunSheetItem`, `pinRunSheetItem`,
`unpinRunSheetItem`, `reorderRunSheetItem`, `deleteRunSheetItem`.

- Saving an edit is **two separate writes** (fields, then pin or unpin). If the
  second fails the first has landed.
- `reorderRunSheetItem` reads every item in the wedding, then makes up to
  **three sequential updates** to re-point predecessors. It is not atomic and
  races with a concurrent edit.
- `deleteRunSheetItem` re-links successors one by one before deleting.
- Times arrive as `datetime-local` strings and are converted with
  `zonedInputToUtc(…, wedding.timezone)`. This is correct and stays.

### 3.4 Logic and tests

- `src/lib/run-sheet.ts` mirrors the SQL view (`resolveRunSheetTimes`,
  `computeConflicts`). 122 lines of unit tests cover chains, TBD propagation,
  cycles, and per-event independence.
- `supabase/tests/04_run_sheet.sql` (149 lines) tests the view.
- `supabase/tests/12_vendors.sql` inserts a `run_sheet_items` row with
  `track` and `duration_minutes` and no times, and asserts that deleting a
  vendor nulls `vendor_id`.

### 3.5 Other places that reference the table

| Place | What it does with it |
|---|---|
| `change_wedding_timezone()` (`0045`) | Rewrites `run_sheet_items.pinned_at` so a corrected timezone keeps wall-clock times. A new time column that is not added here silently shifts every item when the timezone is corrected. |
| `planner_table_access` (`0044`) | Registry with one row per table. `run_sheet_items` is `write`. A test compares it with `pg_tables`, so a new table without a row fails. |
| Audit (`0035`) | `run_sheet_items|id||title`. `18_audit_log` fails for a table that is neither audited nor excepted. |
| `src/lib/audit/describe.ts` | Labels it "run sheet item". |
| `src/app/api/health/route.ts` and `supabase/checks/verify_migrations_applied.sql` | One entry per migration that must be applied. |
| `src/lib/nav-groups.ts`, `planner-routes.ts` | Nav entry "Events & run sheet" with `/run-sheet` in `matchPrefixes`. |
| `src/lib/types/database.ts` | Hand-maintained row, view and relationship types. |
| `0022` comment | Records that the run sheet is internal and must never feed the guest page. Still true. |

### 3.6 Who can already be assigned elsewhere

- Tasks use `list_items.assigned_to` (a collaborator's `auth.users` id) **or**
  `assigned_person_id` (a `people` row), never both (spec 39).
- `people` is soft-deleted (`deleted_at`) and read by `getPeople`, which
  includes removed people so existing assignments keep their name.
- Guests are soft-deleted (`deleted_at`). Vendors are hard-deleted.
- A planner login (`people.access = 'planner'`) has `write` on the run sheet,
  `read` on guests, people and collaborators, and cannot write `people`.
- Collaborators are labelled by `display_name` (spec 15), with `sideLabel`
  as the existing fallback to "Partner A/B".

### 3.7 The request against what is built

| Wanted | Today |
|---|---|
| One list, no sections | One list **per event**, further split into four track columns |
| Overlap | Possible only across tracks; within a chain, strictly sequential |
| Start and end on every item | Start is computed or pinned, end is not shown, "Time TBD" is valid |
| Several assignees | One free-text owner and one unused vendor link |
| Guests as assignees | Not possible |
| The couple as assignees | Not possible, except by typing a name |
| One timeline of the day | No timeline, only column lists |
| Whole-day view | Impossible, each event is a separate page |

## 4. Findings that shape the design

1. **Chaining and stored times can coexist only if one of them is the source of
   truth.** Spec 5 computes every time from the chain on read. A stored start
   and end on every item, with chaining kept as an option, means the stored
   time is the truth and the chain is a rule applied when a time changes (§7.10).
   Computing on read for some items and storing for others would disagree.
2. **"Sections" in the request means two things in the code**: the per-event
   partition and the per-track columns. Both go. Event stays as an optional
   label, track goes.
3. **The editor and reorder actions are not atomic.** A stored-time model with
   assignees would add a third write to a path that already has two. Saving an
   item and its assignees must be one transaction.
4. **A move is currently three writes.** With stored times a move is one update.
5. **A new time column is silently wrong after a timezone correction** unless
   `change_wedding_timezone()` is extended. This is the easiest thing to miss.
6. **A planner can write the run sheet but cannot create a `people` row**, so
   the picker's "add a person" must be hidden for a planner.
7. **The existing vendor test inserts a row with no times.** It breaks when
   times become required and must be updated.

## 5. Scope

**In:**
- Stored `starts_at` and `ends_at` on every item, both required.
- Overlap with no limit and no general warning.
- Many assignees per item from four sources: the two collaborators, guests,
  vendors and `people`.
- One timeline for the whole day, overlapping items in lanes, and a
  Timeline / List toggle over one dataset.
- Filter by assignee.
- A soft warning when one assignee is on two overlapping items.
- Optional "starts after" on an item: its start is the other item's end plus a
  gap, and moving or resizing that item moves what follows it. Many items may
  follow one item.
- Event as an optional label on an item.
- Migration of every existing item without losing a time, a chain, an owner, a
  vendor link or an event.
- Atomic save of an item with its assignees, and atomic cascade of a move.

**Out:**
- Sections, headers, track columns, per-event pages.
- Pinned items as a separate concept. An item with no "starts after" is
  fixed: it does not move when anything else does.
- A warning for an item running past a pinned time.
- Printable or per-person export. That is the next spec.
- Publishing to `/w` and any change to `guest_visible`.
- Reminders or notifications to assignees.
- A done or not-done status.

## 6. Data model

Migration `0048_run_sheet_one_timeline.sql`. Append-only: nothing in `0009`,
`0029`, `0044` or `0045` is edited. `0045`'s function is replaced with
`create or replace`, in this migration.

### 6.1 Times become stored

On `run_sheet_items`:

- Add `starts_at timestamptz`, `ends_at timestamptz` and `time_estimated
  boolean not null default false`. Backfill them per §6.3, then set the two
  times `not null` and add `check (ends_at > starts_at)`.
- `predecessor_id` and `offset_minutes` stay and keep their meaning: this item
  **starts after** the predecessor, `offset_minutes` after its end. The
  stored times are the truth, and an item with a predecessor always satisfies
  `starts_at = predecessor.ends_at + offset_minutes`. The function in §9
  maintains that invariant.
- Drop `not null` from `event_id`. The composite foreign key stays, so a set
  event must still belong to the wedding.
- `pinned`, `pinned_at`, `duration_minutes`, `owner`, `track` and `vendor_id`
  are no longer read or written by the app. They stay in place for this
  migration and are dropped in a later one once the data is verified. New rows
  write `pinned = false`, `pinned_at = null`, `duration_minutes` as the span in
  minutes and `track = 'other'`, so every old constraint still holds.
- Index on `(wedding_id, starts_at)`.

### 6.2 Assignees

New table `run_sheet_item_assignees`:

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| wedding_id | uuid, not null, fk to `weddings`, on delete cascade | |
| item_id | uuid, not null | Composite fk `(item_id, wedding_id)` to `run_sheet_items`, on delete cascade |
| collaborator_user_id | uuid, null | References `collaborators (wedding_id, user_id)` |
| guest_id | uuid, null | Composite fk with `wedding_id`, on delete cascade |
| vendor_id | uuid, null | Composite fk with `wedding_id`, on delete cascade |
| person_id | uuid, null | Composite fk with `wedding_id` to `people`, on delete cascade |
| created_at | timestamptz | |

- `check` that exactly one of the four id columns is non-null.
- One partial unique index per source on `(item_id, <source id>)`, so nobody is
  on an item twice.
- RLS is `is_collaborator(wedding_id)`, forced, anon revoked, as every tenant
  table.
- A row in `planner_table_access`: `write`.
- Audited with the parent's label, and `describe.ts` names it "run sheet
  assignee". The audit registration follows `18_audit_log`'s rule.
- Guests and people are soft-deleted, so their rows survive and the app hides
  them (§7.5). A vendor delete cascades the assignee row and keeps the item,
  which preserves the behaviour `12_vendors.sql` asserts today.

"Both of us" is two rows, one per collaborator. There is no combined row.

### 6.3 Migrating existing data

| Old | New |
|---|---|
| Resolved `starts_at`/`ends_at` from the view | Stored columns |
| `predecessor_id`, `offset_minutes` | Kept, as "starts after" |
| `pinned` items | Items with no predecessor |
| `vendor_id` | A vendor assignee row |
| `owner` free text | An assignee, per §6.3.2 |
| `track` | Dropped from the UI, derivable from assignee types |
| `event_id` | Kept as the optional label |
| Items with no resolvable time | A time, per §6.3.1 |

For every item that has a resolved time today, the migration stores exactly the
`starts_at` and `ends_at` the view gives, and its chain link is unchanged. The
SQL suite asserts both.

#### 6.3.1 Items with no time ("Time TBD")

A chain whose first item has no time takes a root time, then resolves through
the existing chain as today, so the links survive:

- the event's `starts_at`, else the wedding date at 09:00 in the wedding's
  timezone, else 09:00 on the day the migration runs;
- the root lasts 30 minutes, or its own `duration_minutes` if that is above 0;
- every item in such a chain gets `time_estimated = true`.

`time_estimated` shows as a quiet "time estimated" note on the item and clears
when the item's start or end is saved.

#### 6.3.2 The `owner` text

A non-empty `owner` is matched, exactly and case-insensitively, in this order:
collaborators' display names, vendors, people, guests. A single match becomes
an assignee. No match, or more than one match within a source, creates a
`people` row with that name (one per distinct name) and assigns it. Created
people appear wherever people are offered for tasks (spec 39).

### 6.4 Timezone

- Times are entered and shown in `weddings.timezone`, never the device's, using
  `zonedInputToUtc`, `utcToZonedInput` and `formatTime` as today.
- `change_wedding_timezone()` is replaced to also shift `starts_at` and
  `ends_at`. A test corrects the timezone and asserts the wall-clock time of an
  item is unchanged.

### 6.5 The view

`v_run_sheet_items` is redefined without the recursive CTE: it reads the stored
columns, carries `time_estimated` and `assignee_count`, and `conflict` becomes
"this item overlaps another item that shares an assignee". The view keeps
`security_invoker`.

## 7. Behaviour

### 7.1 Items

- Create, edit, duplicate, delete. Title, start and end are required.
- Default length on create is 15 minutes. From the timeline the start is the
  tapped time. From the list it is the latest end time already in the list.
- Changing the start moves the end by the same span. Changing the end changes
  the span. Both are plain `datetime-local` fields in the wedding's timezone,
  with the timezone shown as a caption.
- An end may pass midnight, up to 06:00 the next day.
- Delete confirms and is a hard delete, as today.

### 7.2 Timeline

One vertical time axis for one day, from the earliest start to the latest end
on that day, padded by 30 minutes.

- A day runs from 06:00 to 06:00 in the wedding's timezone, so a 00:30 item
  belongs to the evening before. This matches the 06:00 limit on an end time.
- When every item falls on one day there is no date control. When items fall
  on more than one day, a date control appears above the timeline and the
  timeline shows one day at a time. It opens on the wedding date if it has
  items, otherwise on the earliest day. The list (§7.3) is not split by day.
- Height follows duration, with a tappable minimum.
- Overlapping items share the width in lanes. Sort by start, put each item in
  the first lane free at its start, then widen to the unused lane space on its
  right.
- Each item shows title, time range, assignee names, and the event name in
  secondary text when set.
- A "now" line shows only while the current moment is inside the day in the
  wedding's timezone.
- No headers, no per-person rows, no track columns.

### 7.3 List

One chronological list, sorted by start, then end, then title. Each row shows
the time range, title, assignee names and the event name. No headers or
dividers. A Timeline / List toggle sits at the top, and the choice is
remembered per user. Both views share the filter and open the same editor.

### 7.4 Overlap

Overlap is expected and silent. The only warning is **the same assignee on two
overlapping items**: a quiet marker on both items and in the editor, and a
count in one line at the top of the page. It never blocks saving. An item
sharing no assignee with another never warns.

### 7.5 Assigning

- One search field over the four sources, each result labelled by type.
- Multi-select, shown as chips.
- "Both of us" at the top adds both collaborators at once.
- Collaborators are labelled with `display_name`, falling back as `sideLabel`
  does.
- A soft-deleted guest or person is hidden from an item's assignees and from
  the picker. Their rows remain, so restoring them restores the assignment.
- Someone in no source can be added from the picker. This creates a `people`
  row (spec 39), never a guest, so invitations, RSVPs, seat counts and
  per-head budget figures are unchanged. A planner login does not see the add
  option, since it cannot write `people`.
- Unassigned items are allowed and have an "Unassigned" filter choice.

### 7.6 Filter

Filter by one or more assignees. Matching items stay where they are and the
rest dim. Positions never reflow.

### 7.7 Editor

The existing dialog pattern, extended. Fields in order: title, starts after
(optional) with its gap, start, end, assignees, location, notes, event, and the
guest-visible checkbox it already has. Saving writes the item, its assignees
and any cascade (§7.10) in **one transaction**, through a single database
function (§9), so a failed write leaves everything unchanged.

When "starts after" is set, the start field shows the computed time and is
edited through the gap (§7.10).

### 7.8 Moving

A move changes `starts_at` and `ends_at` together and carries every item that
follows it (§7.10). Spec 45 applies: every move works without dragging. Each
item's `RowMenu` offers "Earlier by 15 minutes" and "Later by 15 minutes", and
the editor's time fields do the rest. Drag is a shortcut that snaps to 5
minutes, and the bottom edge resizes. An item that starts after another cannot
be dragged earlier than that item's end, and the menu does not offer a move
that would do so.

### 7.9 Devices

Phone (spec 48): one scrolling timeline, up to three legible lanes, narrower
lanes show the title only. iPad and laptop: wider lanes with full assignee
names. The emoji in the current controls go. Colour is used sparingly:
selected item, now line, overlap marker.

### 7.10 Starts after

An item may start after another item in the same wedding, with a gap of 0 to
1440 minutes after that item's end. Many items may start after the same item,
which is how two things begin when the ceremony ends.

- Setting "starts after" sets the item's stored start to the other item's end
  plus the gap, and its end keeps its length.
- Changing a follower's start changes its gap. A start earlier than the other
  item's end removes the link, and the editor says so before saving.
- Changing an item's start or end shifts every item that follows it, and
  everything that follows those, by the change in its end. Gaps are kept. A
  cascade never changes an item's length and never touches an item with no
  link to the moved one.
- Resizing an item shifts followers by the change in its **end** only.
- A link that would make an item follow itself, directly or through others, is
  refused.
- Deleting an item keeps every follower's stored time. Each follower is
  re-linked to the deleted item's own predecessor when that gives a gap of 0 or
  more, and is otherwise unlinked.
- An item with no link is fixed and never moves when anything else does.
- A follower may end up overlapping other items. That is allowed and silent
  (§7.4).

## 8. Screens

| Route | Change |
|---|---|
| `/run-sheet` | Becomes the timeline and list for the whole wedding. The picker goes. |
| `/events/[id]/run-sheet` | Redirects to `/run-sheet`. |
| Events screen | "Run sheet →" per event points at `/run-sheet`. |
| Nav | "Events & run sheet" and its `matchPrefixes` are unchanged. |

## 9. Code changes

- **`supabase/migrations/0048_run_sheet_one_timeline.sql`**: §6, plus security
  invoker functions (so RLS applies), each one transaction:
  - `save_run_sheet_item(...)`: inserts or updates an item, applies "starts
    after" (§7.10), replaces its assignee set, and cascades the change to its
    followers with a recursive CTE. Refuses a cycle.
  - `delete_run_sheet_item(...)`: re-links or unlinks followers per §7.10,
    then deletes.
- **`src/lib/run-sheet.ts`**: lane packer, shared-assignee overlap, the day
  boundary, and a pure mirror of the cascade used for the editor's live preview
  of the computed start (the same "duplicate the SQL deliberately, test it
  against the SQL suite" pattern the file already follows). `resolveRunSheetTimes`
  and `computeConflicts` are removed.
- **`src/server/actions/run-sheet.ts`**: `saveRunSheetItem`,
  `moveRunSheetItem`, `duplicateRunSheetItem`, `deleteRunSheetItem`, each a
  thin call to a function above. Every write returns `ActionResult` and checks
  the Supabase `error`. The pin, unpin and reorder actions are removed.
- **`src/server/queries/run-sheet.ts`**: one wedding-wide `cache()`d query with
  assignees. The per-event and "events with items" queries go.
- **`src/server/actions/vendors.ts`**: `setRunSheetItemVendor` is removed
  (nothing calls it).
- **`src/components/run-sheet/`**: timeline, list, toggle, picker, filter,
  extended editor. The track-column view is replaced.
- **`src/lib/types/database.ts`**: hand-edit the row, view and relationship
  types for the new columns and table.
- **`src/lib/audit/describe.ts`**, **`src/app/api/health/route.ts`**,
  **`supabase/checks/verify_migrations_applied.sql`**: register `0048`.
- **Pages**: `/run-sheet` rewritten, `/events/[id]/run-sheet` becomes a
  redirect, the events-editor link updated.

## 10. Decisions

1. **One dataset, two views.** Rejected: separate list and timeline data.
2. **Stored times are the truth, and "starts after" is a rule applied on
   write.** Rejected: computing a chained item's time on read while storing the
   rest, since two sources for one time disagree.
3. **Four typed foreign keys for assignees.** Rejected: one polymorphic id,
   which cannot cascade or enforce the wedding.
4. **"Both of us" is two rows.** Each partner can be filtered or removed alone.
5. **Same-assignee overlap warns and never blocks.**
6. **Wedding timezone always, and `change_wedding_timezone()` covers the new
   columns.**
7. **Event becomes an optional label and track is dropped.** This is how
   "sections" in the request are met without losing which event an item
   belongs to.
8. **Old columns retire in two steps.** Stop using them now, drop them in a
   later migration.
9. **One transactional save for an item and its assignees.** Rejected: an
   action that writes the item and then the assignees.
10. **A deleted vendor cascades its assignee rows and the item stays**, the
    behaviour `12_vendors.sql` already asserts.
11. **An unlinked item is the new "pinned".** Rejected: a separate pinned flag,
    which would repeat what having no predecessor already says.
12. **Editing a follower earlier than its predecessor's end unlinks it.**
    Rejected: a negative gap, which the existing 0 to 1440 range excludes.
13. **Owner text becomes people.** Names like "DJ" or "best man" become `people`
    rows and appear wherever people are offered for tasks. Rejected: moving the
    text into notes, which would assign nobody.

## 11. Test plan

- **Unit** (`src/lib/run-sheet.test.ts`, rewritten): lane packing (overlap,
  chains of overlap, identical times, touching items, one long item over
  several short ones), shared-assignee overlap, the 06:00 day boundary,
  midnight crossing, the cascade mirror (a move, a resize, two followers of one
  item, a three-deep chain, a cycle refused), and a London viewer with an
  Auckland wedding across a daylight-saving change.
- **SQL** (`04_run_sheet.sql`, rewritten):
  - Migration: the backfill reproduces every time the view resolves today and
    keeps every link; a TBD chain gets the §6.3.1 root time, resolves through
    its links and is flagged; owner text matches in the §6.3.2 order, an
    ambiguous name creates a person, and the same name creates one person.
  - Invariants: `ends_at > starts_at`; a follower's start equals its
    predecessor's end plus its gap after any save, move, resize or delete.
  - Cascade: moving an item shifts followers and followers of followers by the
    change in its end; a cycle is refused; deleting a mid-chain item keeps
    every follower's time.
  - Assignees: exactly-one-source; a duplicate is refused; a cross-wedding
    assignee is refused; a non-collaborator reads and writes nothing.
  - `save_run_sheet_item` rolls back the item when an assignee insert fails;
    the audit row is written; `change_wedding_timezone` keeps the wall-clock
    time of `starts_at` and `ends_at`.
- **SQL** (`12_vendors.sql`): the inserted row gains times; deleting a vendor
  keeps the item and removes its assignee row.
- **SQL** (`25_planner_access.sql`): the new table is in the registry.
- **Browser** (a real run is needed): five overlapping items at phone width,
  the filter, the toggle, the editor, the no-drag moves.

## 12. Answered (2026-11-15)

1. **Chaining stays, as an option.** An item may start after another, and a
   move carries what follows it (§7.10). Stored times are the truth.
2. **Items with no time get one.** The §6.3.1 root time, flagged "time
   estimated" until edited.
3. **Owner text becomes assignees**, matched to collaborators, vendors, people
   and guests, otherwise a new person (§6.3.2).
4. **One date at a time.** A date control appears only when items fall on more
   than one day (§7.2).
5. **Non-guests are people, not guests** (§7.5).

## 13. Build order

1. `0048`, `save_run_sheet_item`, `delete_run_sheet_item`, the `0045` function
   replacement, and the SQL suite changes. Run `./scripts/verify-migrations.sh`.
2. `src/lib/run-sheet.ts` and its tests.
3. Actions and queries.
4. Timeline, list, picker, filter, editor.
5. Routes, the events link, registrations (audit, health, verify).
6. `npm run typecheck && npm test && npm run build`, and say which were run.
