# Feature spec: Reordering the lists themselves in the sidebar

**Status: built end to end, same session (2026-09-17).** One request, no
schema question behind it — this spec originally covered a different idea
(manual ordering inside the "Assigned to me" smart view); the planner
clarified they meant reordering the *lists* shown under "Your lists" in
the sidebar instead ("Wedding Day," "Vendors," "Ceremony," and so on), not
the tasks inside any of them. That earlier idea is dropped entirely — see
§4 for the record of that clarification. The file keeps its original
number so `docs/specs/README.md`'s numbering and any existing links to it
stay stable.

**Depends on:** Spec 1 (`lists.sort_order`, already used to order
`ListsSidebar`'s "Your lists" section). Already built.

## 1. What this changes

`ListsSidebar` (`src/components/lists/lists-sidebar.tsx`) renders every
list under "Your lists" in `lists.sort_order` order — set once, at
creation (`createList` always inserts at `last + 1`), and never changed
again after that. There's no way to move "Vendors" above "Ceremony" once
both exist except archiving and recreating both in the order you want,
which loses everything already in them.

This adds manual reordering, the same shape as `reorderItems` and (spec 11
§1C) `reorderSections` already use elsewhere in this file:

- A new server action, `reorderLists(orderedIds: string[])` — validates
  every id belongs to the current wedding's non-archived lists (mirroring
  `reorderItems`'s tenancy scoping), then renumbers `lists.sort_order`
  `(index + 1) * 10` apart, same scheme as every other reorder action in
  this codebase.
- `ListsSidebar` becomes a small client component with its own
  `DndContext`/`SortableContext` (the same `PointerSensor` +
  `KeyboardSensor` combination `SectionGroup` already uses) wrapping the
  "Your lists" entries, each with a drag handle, plus Move up/down buttons
  as the touch-friendly fallback this app uses everywhere else a drag
  surface exists (spec 3 §7 decision 6).
- The five smart-view links above "Your lists" (Today, Scheduled, Flagged,
  All, Assigned to me) are **not** reorderable — they're a fixed, named set
  of filters (spec 1 §1: "never edited directly — they're filters, not
  storage"), not rows with their own `sort_order`.

`ListsSidebar` already needs `usePathname`/`useSearchParams` and is a
client component today; this only adds local drag state and the same
optimistic-reorder-then-persist pattern `SectionGroup.applyMove` already
uses — reorder locally, call `reorderLists`, roll back on failure.

## 2. Scope

**In:**
- `src/server/actions/lists.ts`: new `reorderLists`.
- `ListsSidebar`: drag handles + Move up/down on each list link under
  "Your lists," calling `reorderLists`.

**Out:**
- No change to the five smart-view links — fixed order, not reorderable.
- No change to `/settings`' "List appearance" editor, which lists the same
  lists but for color/icon/title editing (spec 11 §1A), not ordering — it
  keeps rendering in whatever order `reorderLists` leaves `sort_order` in,
  same as it already reads that column today.
- No change to archived lists — they don't appear in the sidebar at all
  (`ListsSidebar`'s `lists` prop is already the non-archived set), so
  there's nothing to reorder among them.
- No per-user ordering — one `sort_order` column, shared by everyone on the
  wedding, same as it is today. Two collaborators dragging lists into a
  different order is the same kind of shared edit as renaming one.

## 3. Data model

No schema change. `reorderLists` writes `lists.sort_order`, an existing
column already used for this exact ordering — it's just never been
user-editable after creation until now.

## 4. What this replaced

The original version of this spec proposed a new `list_items.mine_sort_order`
column so the "Assigned to me" smart view could be manually reordered
independently of a task's position in its own list. The planner's request
("Able to reorder tasks assigned to me under your lists") turned out to
mean something else on clarification: reordering the *lists* that appear
under the "Your lists" heading in the sidebar, not the tasks inside the
"Assigned to me" view. That idea, migration and all, is dropped — nothing
from the original draft carries forward, and "Assigned to me" stays exactly
as it is today (read-only, sorted by due date).

## 5. Test plan

- `npm run typecheck`: clean.
- `npm test`: 304 tests, unchanged pass count — no new pure-logic module
  needed testing away from a database.
- `npm run build`: compiles and typechecks clean; page-data collection
  fails only on missing `NEXT_PUBLIC_SUPABASE_*`/`NEXT_PUBLIC_SITE_URL`,
  the same sandbox-has-no-Supabase-project caveat every prior spec in this
  rebase carries.
- Not opened in a browser against a live project — same caveat; this
  sandbox has no Supabase project and no way to stand one up (no
  `supabase` CLI, no running Docker daemon for `supabase start`).
