# Feature spec: Completed tasks sink to the bottom of the list

**Status: built end to end, same session (2026-09-16).** One small,
unambiguous UI/behavior fix the planner asked for directly — no open
questions to block the build on.

**Depends on:** Spec 1 (lists — `list_items.status`, `sort_order`,
sub-items, `reorderItems`), spec 3 (`/lists` smart views). Both already
built.

## 1. What this changes

Ticking a task done left it sitting wherever it was in the list — mixed in
among the still-open tasks above and below it, so a mostly-finished section
still read as a wall of items and you had to scan past done ones to find
what's actually left. A finished task should read as *out of the way*, not
just crossed out in place.

Every place a checklist renders top-to-bottom now sinks `status: "done"`
items beneath everything else, while leaving not-done items exactly where
they were relative to each other, and done items in the same relative
order among themselves that they had before. Nothing about `sort_order`'s
meaning or storage changes — this is a display-time partition, applied
wherever a list of items gets rendered:

- **`/lists/[id]`** (`ListDetail`/`SectionGroup` in
  `src/components/lists/list-detail.tsx`) — the main per-section checklist,
  including drag-and-drop and the Move up/down buttons (spec 3, section 7,
  decision 6's touch-friendly fallback). Checking an item off now visibly
  drops it to the bottom of its section instantly (the existing
  `router.refresh()` in `ItemRow.onToggleDone` re-renders with the new
  `status`, and the section's local reorder state re-partitions on every
  render — see the code comment in `SectionGroup` for why this doesn't
  require resetting that state). Un-checking it moves it back up among the
  not-done items, at wherever its manual position among *those* still puts
  it.
- **Sub-items** under a parent, rendered inline in `ItemRow` — same
  treatment, applied when `list-detail.tsx` builds `subItemsByParent`.
- **`/lists`'s "All" and "Flagged" smart views** (`SmartView` in
  `src/components/lists/smart-view.tsx`) — both of these already include
  done items (unlike "Today"/"Scheduled"/"Mine", which already filter them
  out with `.neq("status", "done")` at the query — see below). The
  partition is applied to whatever the query already sorted by (due date),
  so within each of the two groups the existing ordering is unchanged;
  only the done/not-done split is new.

The partition itself is one small pure function,
`sortCompletedLast(items, isDone)` in the new `src/lib/lists/sort.ts` — a
stable two-bucket split (not-done first, done second, original relative
order preserved within each bucket), unit-tested in `sort.test.ts`. Every
call site above just calls it with the right `isDone` predicate; there's no
per-screen logic beyond that.

**Drag-and-drop / Move up-down, specifically:** `SectionGroup` already kept
two id sequences apart before this change — a keyboard/mouse-drag-driven
"raw" order used only to remember manual positioning, and a "current" order
actually rendered. This change makes the rendered one
`sortCompletedLast(raw, ...)` instead of the raw sequence itself. A drag (or
Move up/down click) that would land a not-done item among the done ones, or
vice versa, doesn't produce a mixed order — the moved item's own `status`
still decides which bucket it renders in on the very next partition, so it
snaps to the correct side of the line, in-place among the ones already
there. The Move up/down buttons additionally never let you click *toward*
that boundary in the first place: the last not-done item's "down" arrow and
the first done item's "up" arrow are both disabled, matching how those
buttons already disable at the true top/bottom of the list. Persisted
`sort_order` (via `reorderItems`) always ends up reflecting whatever is
currently displayed, so a fresh page load produces the identical order — no
special-casing needed there, and no risk of the stored order silently
drifting from what's on screen.

## 2. Scope

**In:**
- `src/lib/lists/sort.ts` — new `sortCompletedLast`, with
  `src/lib/lists/sort.test.ts`.
- `src/components/lists/list-detail.tsx` — `SectionGroup`'s rendered/
  draggable order, its Move up/down enablement, and `ListDetail`'s
  `subItemsByParent`.
- `src/components/lists/smart-view.tsx` — `SmartView` sorts its items
  through `sortCompletedLast` before rendering.

**Out:**
- **`/board`** (`board-view.tsx`) — already groups items into three status
  columns (Not started / In progress / Done); a "Done" column *is* "sunk to
  the bottom" for that screen's shape. No change.
- **`/calendar` and `/timeline`** — date-driven grids/buckets, not a
  manually-ordered top-to-bottom list; a task's position there is its due
  date, not something this request is about. Out, same as spec 7's Part D
  explicitly left `/board` alone for a different but analogous reason.
- **"Today"/"Scheduled"/"Mine" smart views** — already exclude done items
  entirely at the query (`getTodayItems`/`getScheduledItems`/
  `getAssignedToMeItems` in `src/server/queries/lists.ts`, each
  `.neq("status", "done")`), so there's nothing for these to sink beneath —
  a done item never appears there in the first place, before or after this
  change.
- No schema change, no migration. `list_items.sort_order` keeps its
  existing meaning (spec 1, section 6); this only changes what order the
  UI renders a given set of rows in, and, via `reorderItems`, what order a
  manual drag persists them in going forward.
- No change to `setStatus`, `reorderItems`'s signature, or any other server
  action.

## 3. Test plan

- `src/lib/lists/sort.test.ts` — 5 unit tests: done sinks below not-done,
  relative order is preserved within each group, and the all-done/
  all-not-done/empty no-op cases.
- `npm run typecheck` and `npm test` (304 tests, up from 220 at spec 7 as
  the suite has grown since — all passing, no regressions).
- `npm run build` compiles and typechecks clean; page-data collection fails
  only on missing `NEXT_PUBLIC_SUPABASE_*`/`NEXT_PUBLIC_SITE_URL`, the same
  sandbox-has-no-Supabase-project caveat every prior spec in this rebase
  carries (`docs/HANDOFF.md`).
- Not yet opened in a browser against a live project — same caveat as
  every prior spec.
