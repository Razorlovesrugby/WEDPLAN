# Feature spec: The run sheet as one timeline

**Status: proposed, not built.** Asked for as a spec (2026-11-15). The scope
below was agreed in conversation; the questions in §11 are still open, and
nothing beyond this file is built until they are answered (see
`docs/specs/README.md`).

**Depends on:** spec 5 part B (the run sheet it replaces the shape of), spec 8
(vendors), spec 39 (`people`), spec 20b (`sideLabel`), spec 32 (audit log),
spec 40 (wedding timezone), spec 45 (no-drag), spec 48 (phone).

## 1. What was asked

1. One big list. No sections.
2. Items can run at the same time.
3. Every item has a start time and an end time.
4. Items are assigned to people: guests, vendors, or both, and to several at
   once. "Both of us, plus the photographer" is one item with three assignees.
5. One timeline of the whole day, not split into sections.
6. A list view as well, as a toggle over the same data.

## 2. Story

> **As the couple**, planning the day, **I want** every task on one timeline
> with a start and an end, several running at once, and the right people on
> each, **so that** I can see the whole day and who is doing what without
> flipping between sections.

## 3. How it works today (verified against the source)

- `run_sheet_items` (`0009`) belongs to one event (`event_id`, hard partition).
  Each event has its own run sheet at `/events/[id]/run-sheet`; `/run-sheet`
  is a picker over events.
- Times are **not stored**. An item is either **pinned** (`pinned_at`) or
  **chained**: it starts at its predecessor's end plus `offset_minutes`.
  `duration_minutes` gives the end. `v_run_sheet_items` resolves this with a
  recursive CTE, mirrored in `src/lib/run-sheet.ts`.
- An unpinned item with no predecessor is allowed and shows as "time TBD".
- One owner per item: free text `owner`, plus `vendor_id` (`0029`).
- `track` (`guests | couple | vendors | other`) lays the screen out as parallel
  columns.
- `conflict` is true when an item's end passes the next pinned item in the
  same event.
- `guest_visible` exists and nothing reads it.
- `src/components/site/on-the-day.tsx` is the guests' page and is **not** the
  run sheet.

## 4. Scope

**In:**
- Stored `starts_at` and `ends_at` on every item, both required, `ends_at`
  after `starts_at`.
- Overlap allowed with no limit and no warning in general.
- Many assignees per item, from four sources: the two collaborators, guests,
  vendors, and `people`.
- A single timeline for the whole day, with overlapping items in side-by-side
  lanes, and a Timeline / List toggle over one dataset.
- Filter by assignee.
- A soft warning when one assignee is on two overlapping items.
- Migration of every existing item, with no loss of time, owner or event.

**Out:**
- No grouping, headers, or sections, and no `track` columns.
- No chaining, offsets, or cascading moves (see §11 Q1).
- No printable or per-person export. That is the next spec.
- No change to `guest_visible` and no publishing to `/w`.
- No reminders or notifications to assignees.

## 5. Data model

Migration `0048_run_sheet_one_timeline.sql`. Append-only: nothing in `0009`
or `0029` is edited.

### 5.1 Times become stored

On `run_sheet_items`: add `starts_at timestamptz` and `ends_at timestamptz`,
backfill from `v_run_sheet_items`, then set both `not null` and add
`check (ends_at > starts_at)`. `pinned`, `pinned_at`, `predecessor_id`,
`offset_minutes` and `duration_minutes` are no longer read or written by the
app. The columns stay in place for this migration, removed in a later one once
the data is verified. New rows are written with `pinned = false`,
`predecessor_id = null`, and `duration_minutes` equal to the span in minutes,
so the old constraints remain satisfied.

Items whose backfilled time is null (the "time TBD" ones) are handled per §11
Q2.

### 5.2 Assignees

New table `run_sheet_item_assignees`:

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| wedding_id | uuid, not null | Tenancy |
| item_id | uuid, not null | Composite FK `(item_id, wedding_id)` to `run_sheet_items`, on delete cascade |
| collaborator_user_id | uuid, null | `collaborators.user_id` |
| guest_id | uuid, null | Composite FK with `wedding_id` |
| vendor_id | uuid, null | Composite FK with `wedding_id` |
| person_id | uuid, null | Composite FK with `wedding_id` to `people` |

- `check` that exactly one of the four id columns is non-null.
- One partial unique index per source on `(item_id, <source id>)` so nobody
  is on an item twice.
- RLS: `is_collaborator(wedding_id)`, forced, anon revoked, same as every
  tenant table.
- Audited like its parent (`18_audit_log.sql` fails otherwise).
- `describe.ts` names it "run sheet assignee".

Composite foreign keys mean an assignee can only be someone in the same
wedding.

"Both of us" is two rows, one per collaborator. There is no combined row.

### 5.3 What replaces `owner`, `vendor_id` and `track`

- `vendor_id` on an item becomes a vendor assignee row. The column is no
  longer read or written.
- `owner` free text is migrated per §11 Q3, then no longer read or written.
- `track` is no longer read or written. It is derivable from assignee types.
- `event_id` stays, optional in the UI, shown as a quiet label on the item.
  It no longer partitions anything. See §11 Q4 for events on different days.

### 5.4 The view

`v_run_sheet_items` is redefined to read the stored `starts_at`/`ends_at`
with no recursive CTE, and carries `assignee_count`. `conflict` is redefined
as "this item overlaps another item sharing an assignee", computed over the
assignee table. `src/lib/run-sheet.ts`'s chain resolver and
`computeConflicts` are replaced by the lane packer (§6.2) and a
shared-assignee overlap function, both pure and unit-tested.

### 5.5 Timezone

Times show and edit in the wedding's timezone (`weddings.timezone`, spec 40),
never the device's. The viewer may be in London and the wedding in New
Zealand, including across a daylight-saving change.

## 6. Behaviour

### 6.1 Items

- Create, edit, delete, duplicate. Title, start and end are required.
- Default length on create is 15 minutes. From the timeline, the start is the
  tapped time. From the list, it is the latest end time in the list.
- An end may pass midnight, up to 06:00 the next day.
- Delete confirms. An item is a plain row, hard-deleted as today.
- Mark done is not part of this spec.

### 6.2 Timeline

One vertical time axis for the whole day, from the earliest start to the
latest end, padded by 30 minutes.

- Item height follows duration. Very short items keep a tappable minimum.
- Overlapping items share the width in lanes. Lane assignment: sort by start,
  put each item in the first lane free at its start, then widen to unused
  lane space on its right.
- Each item shows title, time range, assignee names, and the event name in
  secondary text.
- A "now" line shows only while the current moment is inside the day in the
  wedding's timezone.
- No section headers, no per-person rows.

### 6.3 List

One chronological list, sorted by start, then end, then title. Each row shows
the time range, title, assignee names and the event name. No headers or
dividers. A Timeline / List toggle at the top, the choice remembered per
user. Both show the same filter state and open the same editor.

### 6.4 Overlap

Overlap is expected and silent. The only warning is **the same assignee on
two overlapping items**: a quiet indicator on both items and in the editor.
It never blocks saving.

### 6.5 Assigning

- One search field over the four sources, each result labelled by type.
- Multi-select, shown as chips.
- "Both of us" at the top adds both collaborators in one tap.
- The collaborators are labelled by `display_name` (spec 15).
- Someone not yet in any source is added from the picker as a **person**
  (`people`, spec 39), not as a guest, and assigned in the same step. See §11
  Q5.
- A soft-deleted guest or person drops off the item's displayed assignees.
  Their rows remain.
- Unassigned items are allowed.

### 6.6 Filter

Filter by one or more assignees. Matching items stay where they are and the
rest dim. Positions never reflow. "Unassigned" is a choice.

### 6.7 Editor

The existing item editor, extended. Fields: title, start, end, assignees,
location, notes, event. The wedding timezone is shown as a caption on the
time fields. Every time change is reachable without dragging (spec 45).

### 6.8 Moving by hand

Touch and pointer drag moves an item (snaps to 5 minutes), and its bottom
edge resizes it. These are shortcuts. The editor's time fields do the same
without dragging.

### 6.9 Devices

Phone: one scrolling timeline, up to three legible lanes, narrower lanes show
the title only. iPad and laptop: wider lanes with full assignee names, and
the editor opens beside the timeline. Visual rules follow the rest of the
planner: no emoji, colour used sparingly (selected item, now line, overlap
indicator), no summary widgets above the timeline.

## 7. Screens

| Route | Change |
|---|---|
| `/run-sheet` | Becomes the one timeline and list for the wedding. The event picker is removed. |
| `/events/[id]/run-sheet` | Redirects to `/run-sheet`. |
| `EventsEditor` | The "Run sheet →" link per event points at `/run-sheet`. |
| Nav | "Events & run sheet" keeps its `matchPrefixes`. |

## 8. Code changes

- `src/lib/run-sheet.ts`: lane packer, shared-assignee overlap, wedding-
  timezone helpers. Chain resolver removed.
- `src/server/actions/run-sheet.ts`: create, update, delete, duplicate,
  set-assignees. Every write returns `ActionResult` and checks the Supabase
  `error`.
- `src/server/queries/run-sheet.ts`: one wedding-wide query, `cache()`d. The
  per-event and "events with items" queries go.
- `src/server/actions/vendors.ts`: the path that clears
  `run_sheet_items.vendor_id` clears the vendor's assignee rows instead.
- `src/components/run-sheet/*`: new timeline and list views, picker and
  filter, extended editor.
- `src/lib/types/database.ts`: regenerated types.
- `src/lib/audit/describe.ts`: the assignee table's label.

## 9. Decisions

1. **One dataset, two views.** A list and a timeline over the same query.
   Rejected: separate list and timeline data.
2. **Stored times, not chains.** The request is a start and end on every
   item. Rejected: keeping chains alongside stored times, because two sources
   of truth for a time disagree.
3. **Assignees are four typed foreign keys.** Rejected: one polymorphic id,
   because it cannot cascade or enforce the wedding.
4. **"Both of us" is two rows.** One can be removed, filtered, or counted
   alone. Rejected: a combined "couple" row.
5. **Same-assignee overlap warns, never blocks.** Rejected: a hard block.
6. **Wedding timezone always.** Rejected: device timezone.
7. **Old columns are retired in two steps.** Stop using them now, drop them in
   a later migration. Rejected: dropping in the same migration as the backfill.

## 10. Test plan

- Unit (`src/lib/run-sheet.test.ts`): lane packing (overlap, chains of
  overlap, identical times, touching items), shared-assignee overlap,
  midnight crossing, a London viewer with an Auckland wedding across a
  daylight-saving change.
- SQL (`supabase/tests/04_run_sheet.sql`, updated): the backfill reproduces
  every previously resolved time; `ends_at > starts_at`; exactly-one-source
  on assignees; cross-wedding assignee refused; a non-collaborator reads and
  writes nothing; audit rows written.
- Browser (not run in the sandbox unless stated): the timeline with five
  overlapping items on a phone width, the filter, the toggle, the editor.

## 11. Open questions

**Q1. Retiring the cascade.** Spec 5 chose chaining on purpose, so moving the
ceremony shifts everything after it. A stored start and end for every item
removes that. *Recommended:* accept the loss, and add a "shift this and
everything after it by N minutes" action to the editor later if it is missed.
*Alternative:* keep chains as an optional way to fill in a start time, which
brings two sources of truth back.

**Q2. Items with no time yet.** Today an unpinned item with no predecessor
saves as "time TBD". The new rule requires a start and end. *Recommended:*
migrated TBD items take the start of their event (or 09:00 on the event date
if it has none) for 30 minutes, and are marked "time estimated" in the UI
until edited. *Alternative:* allow a null time and show those items in a "No
time yet" strip, which breaks "everything has a start and end".

**Q3. Existing `owner` text.** *Recommended:* a non-empty `owner` is matched
exactly (case-insensitive) against collaborators' display names, people,
guests and vendors. A match becomes an assignee. An unmatched value becomes a
new `people` row, deduplicated by name, and an assignee. *Alternative:* append
the text to the item's notes and add no assignee.

**Q4. Events on different days.** Items today belong to events, which can fall
on different dates (a rehearsal dinner and the wedding). "One timeline of the
whole day" is clear when they share a date. *Recommended:* the timeline shows
one date at a time, with a date control only when items exist on more than one
local date, and the list is one continuous list sorted by start. *Alternative:*
one continuous timeline across all dates.

**Q5. Who counts as a "guest name".** The guest list drives invitations, RSVP,
seat and per-head budget counts, so adding a non-guest (a groomsman who is not
invited, the photographer's assistant) as a guest would change those. *Recommended:*
assigning a guest uses real guest records, and anyone else is a `people` row
created from the picker. *Alternative:* create a guest record from the picker,
at the cost of those side effects.

## 12. Build order

1. `0048` migration, view, and the SQL suite updates, and `verify-migrations.sh`.
2. `src/lib/run-sheet.ts` and its tests.
3. Actions and queries.
4. Timeline, list, picker, filter, editor.
5. Route changes and the `vendors.ts` path.
6. Typecheck, tests, build, SQL suite. Say which were run.
