# Feature spec: Manual ordering in the "Assigned to me" view

**Status: proposed, not built.** One clear request with one real design
decision behind it (§4) — the shape of a new column, not whether to build
this at all.

**Depends on:** Spec 1 (`list_items.assigned_to`), spec 3 (`/lists`'s
`SmartView`/"Mine" — spec 3 §7 introduced the "Assigned to me" smart view
itself; see `src/server/queries/lists.ts`'s `getAssignedToMeItems`), spec 10
(`sortCompletedLast`, unaffected by this — "Mine" already excludes done
items at the query, so there's nothing for that partition to do here either
way). All already built.

## 1. What this changes

"Assigned to me" ("Mine" in `SMART_VIEWS`, `/lists?view=mine`) is the one
smart view where the planner's own queue — everything assigned to them,
across every list — lives in one place. Today it's read-only ordering:
`getAssignedToMeItems` sorts by `due_date` ascending (undated items last),
and `SmartView` (`src/components/lists/smart-view.tsx`) renders whatever
that query returns with no drag handle at all — every other list of items
in this app (`/lists/[id]`'s sections, `/board`'s columns) can be manually
reordered; this one can't.

The request is to make "Mine" a manually-ordered queue, the way a to-do
list works when it's your own — not "what's due first" but "what I've
decided to do first," regardless of date.

**Why this needs a new column rather than reusing `sort_order`:**
`list_items.sort_order` already means something specific — "this item's
position within its list, or within its section if it has one"
(`list_items_list_idx`, `list_items_section_idx`, both `(…, sort_order)`).
An item assigned to the planner sits in exactly one list and, usually, one
section; repurposing `sort_order` for "Mine" ordering would mean dragging a
card in "Mine" silently reshuffles where that same task sits on
`/lists/[id]` and `/timeline` too — which is not what "reorder my queue"
means, and would be a confusing surprise the first time someone opened the
list a "Mine" drag had just touched. This needs its own dimension, kept
separate the same way `list_items.priority` and `sort_order` are already
two independent things on the same row.

`assigned_to` is a single user per item (spec 1) — a task is never
assigned to two people at once — so a single new column carries this with
no per-user join table needed; the item can only ever appear in one
person's "Mine" view in the first place.

## 2. Ordering behaviour

New column, `list_items.mine_sort_order integer, nullable, default null`.

- **Unset (`null`) is the current behaviour**: sorted by `due_date`
  ascending, undated last — exactly what `getAssignedToMeItems` does today.
  A freshly-assigned item starts here; nothing changes until the planner
  actually drags something.
- **The first drag in "Mine" seeds the column** for every item currently in
  the view: whatever order is on screen at that moment (today's due-date
  order) is written out as `mine_sort_order` values, 10 apart, the same
  `(index + 1) * 10` scheme `reorderItems` already uses — then the dragged
  item's new position is applied on top of that. From that point on, every
  item that has a `mine_sort_order` sorts by it; the ones that still don't
  (assigned after that point, or never touched) fall in after them, still
  ordered by due date among themselves. This mirrors how `sort_order` and
  the section drag already work: touching drag-and-drop is what turns a
  screen from "automatically sorted" into "manually ordered," not a
  separate settings toggle.
- **Reassigning an item away and back**, or unassigning and reassigning it
  to someone else, leaves `mine_sort_order` as-is — a harmless leftover
  value nobody else's "Mine" view ever reads, since it only ever sorts rows
  where `assigned_to = current user`. No cleanup needed on reassignment.
- **A new server action**, `reorderMyItems(orderedIds: string[])` —
  deliberately not a reuse of `reorderItems`, which renumbers `sort_order`
  and is scoped to items the caller can prove belong to one list/section
  context. This one validates every id in the batch actually has
  `assigned_to = ` the current session user before writing (`reorderItems`
  has no equivalent check today because a list's own drag surface is
  already scoped to that list's own items server-side by construction; this
  one draws from every list at once, so the check has to be explicit).

## 3. Scope

**In:**
- New migration: `list_items.mine_sort_order integer null`, no default
  beyond `null`, no index needed (this app's item counts don't warrant one
  for a `where assigned_to = $1 order by mine_sort_order` scan — same scale
  argument `reorderItems`'s own comment makes about `sort_order`).
- `getAssignedToMeItems`: order by `mine_sort_order` (nulls last) then
  `due_date` (nulls last) — one query change.
- `src/server/actions/lists.ts`: new `reorderMyItems`.
- `SmartView`: when `view === "mine"`, render with the same drag-handle/
  Move up-down pattern `SectionGroup` already uses (`useSensors`,
  `DndContext`, `SortableContext`, plus the up/down button fallback), calling
  `reorderMyItems` instead of `reorderItems`. The other four views
  ("today," "scheduled," "flagged," "all") are unchanged — still read-only,
  still just a filter over items whose real home is a list (spec 1 §1).

**Out:**
- No change to `sort_order`, `/lists/[id]`, `/timeline`, or `/board` — a
  "Mine" drag never touches how a task's own list renders it.
- No per-user ordering table. One column is enough because one item has one
  assignee.
- No equivalent manual ordering added to "Today," "Scheduled," "Flagged," or
  "All" — not asked for, and each of those already has an ordering that
  means something (due date; priority, for "flagged") that a manual queue
  would compete with. Can be revisited on its own if wanted later.

## 4. Open questions — need the planner's answers before anything is built

1. **Confirming the new-column approach over reusing `sort_order`** (§1).
   Recommendation: confirm — reusing it would make a "Mine" drag quietly
   reorder the underlying list too, which is very likely not intended and
   would be a strange thing to discover after the fact.
2. **Does "Mine" become fully manually ordered the moment any drag happens
   (§2), or should due-date ordering keep applying as a tie-breaker even
   after some items have a manual position?** Recommendation: full manual
   order among the items that have one, due-date order only for the
   leftover items that don't (as written in §2) — mixing the two within the
   same ordered items would mean a drag doesn't reliably stay where it was
   dropped once a due date changes underneath it.
