# Feature spec: The run sheet as one timeline

**Status: proposed, not built.** Asked for as a spec (2026-11-15). The scope in
§1 was agreed in conversation. The questions in §12 are still open, and
nothing beyond this file is built until they are answered (see
`docs/specs/README.md`).

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
8. A printable per-person view is wanted next. It is a separate spec.

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

1. **The cascade is the reason times are not stored.** Spec 5 chose chaining on
   purpose. Stored start and end on every item removes it. This is the largest
   change here, and §12 Q1 asks for it explicitly.
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
- Event as an optional label on an item.
- Migration of every existing item without losing a time, an owner, a vendor
  link or an event.
- Atomic save of an item with its assignees.

**Out:**
- Sections, headers, track columns, per-event pages.
- Chaining, offsets and cascading moves (§12 Q1).
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

- Add `starts_at timestamptz` and `ends_at timestamptz`, backfill from
  `v_run_sheet_items`, apply §12 Q2 to rows still null, then set both `not
  null` and add `check (ends_at > starts_at)`.
- Drop `not null` from `event_id`. The composite foreign key stays, so a set
  event must still belong to the wedding.
- `pinned`, `pinned_at`, `predecessor_id`, `offset_minutes`,
  `duration_minutes`, `owner`, `track` and `vendor_id` are no longer read or
  written by the app. They stay in place for this migration and are dropped in
  a later one once the data is verified. New rows write `pinned = false`,
  `predecessor_id = null`, `duration_minutes` as the span in minutes and
  `track = 'other'`, so every old constraint still holds.
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
| `vendor_id` | A vendor assignee row |
| `owner` free text | Per §12 Q3 |
| `track` | Dropped from the UI, derivable from assignee types |
| `event_id` | Kept as the optional label |
| Items with no resolvable time | Per §12 Q2 |

For every item that has a resolved time today, the migration stores exactly the
`starts_at` and `ends_at` the view gives. The SQL suite asserts this.

### 6.4 Timezone

- Times are entered and shown in `weddings.timezone`, never the device's, using
  `zonedInputToUtc`, `utcToZonedInput` and `formatTime` as today.
- `change_wedding_timezone()` is replaced to also shift `starts_at` and
  `ends_at`. A test corrects the timezone and asserts the wall-clock time of an
  item is unchanged.

### 6.5 The view

`v_run_sheet_items` is redefined without the recursive CTE: it reads the stored
columns, carries `assignee_count`, and `conflict` becomes "this item overlaps
another item that shares an assignee". The view keeps `security_invoker`.

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

One vertical time axis for the whole day, from the earliest start to the
latest end, padded by 30 minutes.

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
- Someone in no source can be added from the picker, per §12 Q5. A planner
  login does not see the add option, since it cannot write `people`.
- Unassigned items are allowed and have an "Unassigned" filter choice.

### 7.6 Filter

Filter by one or more assignees. Matching items stay where they are and the
rest dim. Positions never reflow.

### 7.7 Editor

The existing dialog pattern, extended. Fields in order: title, start, end,
assignees, location, notes, event, and the guest-visible checkbox it already
has. Saving writes the item and its assignees in **one transaction**, through
a single database function (§9), so a failed assignee write leaves the item
unchanged.

### 7.8 Moving

A move is one update of `starts_at` and `ends_at` together. Spec 45 applies:
every move works without dragging. Each item's `RowMenu` offers "Earlier by 15
minutes" and "Later by 15 minutes", and the editor's time fields do the rest.
Drag is a shortcut that snaps to 5 minutes, and the bottom edge resizes.

### 7.9 Devices

Phone (spec 48): one scrolling timeline, up to three legible lanes, narrower
lanes show the title only. iPad and laptop: wider lanes with full assignee
names. The emoji in the current controls go. Colour is used sparingly:
selected item, now line, overlap marker.

## 8. Screens

| Route | Change |
|---|---|
| `/run-sheet` | Becomes the timeline and list for the whole wedding. The picker goes. |
| `/events/[id]/run-sheet` | Redirects to `/run-sheet`. |
| Events screen | "Run sheet →" per event points at `/run-sheet`. |
| Nav | "Events & run sheet" and its `matchPrefixes` are unchanged. |

## 9. Code changes

- **`supabase/migrations/0048_run_sheet_one_timeline.sql`**: §6, plus a
  function `save_run_sheet_item(...)` (security invoker, so RLS applies) that
  inserts or updates an item and replaces its assignee set in one transaction.
- **`src/lib/run-sheet.ts`**: lane packer, shared-assignee overlap, midnight
  handling. The chain resolver and `computeConflicts` are removed.
- **`src/server/actions/run-sheet.ts`**: `saveRunSheetItem`,
  `moveRunSheetItem`, `duplicateRunSheetItem`, `deleteRunSheetItem`. Every
  write returns `ActionResult` and checks the Supabase `error`. The pin,
  unpin and reorder actions are removed.
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
2. **Stored times, not chains.** The request is a start and end on every item.
   Rejected: keeping chains next to stored times, since two sources of truth
   for one time disagree.
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

## 11. Test plan

- **Unit** (`src/lib/run-sheet.test.ts`, rewritten): lane packing (overlap,
  chains of overlap, identical times, touching items, one long item over
  several short ones), shared-assignee overlap, midnight crossing, and a London
  viewer with an Auckland wedding across a daylight-saving change.
- **SQL** (`04_run_sheet.sql`, rewritten): the backfill reproduces every time
  the view resolves today; `ends_at > starts_at`; exactly-one-source on
  assignees; a duplicate assignee is refused; a cross-wedding assignee is
  refused; a non-collaborator reads and writes nothing; `save_run_sheet_item`
  rolls back the item when an assignee insert fails; the audit row is written;
  `change_wedding_timezone` keeps the wall-clock time.
- **SQL** (`12_vendors.sql`): the inserted row gains times; deleting a vendor
  keeps the item and removes its assignee row.
- **SQL** (`25_planner_access.sql`): the new table is in the registry.
- **Browser** (a real run is needed): five overlapping items at phone width,
  the filter, the toggle, the editor, the no-drag moves.

## 12. Open questions

**Q1. Retiring the cascade.** Moving the ceremony no longer moves what follows
it. *Recommended:* accept the loss, and add a "shift this and everything after
it by N minutes" action later if it is missed. *Alternative:* keep chains as an
optional way to fill in a start time, which brings two sources of truth back.

**Q2. Items with no time yet.** Today an unpinned item with no predecessor
saves as "Time TBD". The new rule requires a start and end. *Recommended:*
migrated TBD items take the start of their event (or 09:00 on the event's date
if it has none) for 30 minutes, and are marked "time estimated" until edited.
*Alternative:* allow a null time and show those items in a "No time yet"
strip, which breaks "everything has a start and end".

**Q3. Existing `owner` text.** *Recommended:* a non-empty `owner` is matched
exactly, case-insensitively, against collaborators' display names, people,
guests and vendors. A match becomes an assignee. An unmatched value becomes a
new `people` row, deduplicated by name, and an assignee. *Alternative:* append
the text to the item's notes and add no assignee.

**Q4. Events on different days.** Events can fall on different dates (a
rehearsal dinner and the wedding). *Recommended:* the timeline shows one date at
a time, with a date control only when items fall on more than one local date,
and the list is one continuous list sorted by start. *Alternative:* one
continuous timeline across all dates.

**Q5. Who counts as a "guest name".** The guest list drives invitations, RSVP,
seat and per-head budget counts, so adding a non-guest (a groomsman who is not
invited, the photographer's assistant) as a guest changes those.
*Recommended:* guests are assigned from real guest records, and anyone else is
a `people` row created from the picker. *Alternative:* create a guest record
from the picker, at the cost of those side effects.

## 13. Build order

1. `0048`, `save_run_sheet_item`, the `0045` function replacement, and the SQL
   suite changes. Run `./scripts/verify-migrations.sh`.
2. `src/lib/run-sheet.ts` and its tests.
3. Actions and queries.
4. Timeline, list, picker, filter, editor.
5. Routes, the events link, registrations (audit, health, verify).
6. `npm run typecheck && npm test && npm run build`, and say which were run.
