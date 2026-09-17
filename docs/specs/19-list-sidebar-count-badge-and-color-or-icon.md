# Feature spec: Drop the sidebar's up/down arrows for an outstanding-task count, and make list appearance color-or-emoji

**Status: proposed, not built.** Two small, independent UI changes to
lists' own appearance and to how they're reordered in the sidebar.

**Depends on:** Spec 3 (`list.color`'s fixed palette, `list.icon`), spec 7
(`LIST_COLOR_PALETTE`), spec 12 (`ListsSidebar`'s drag + Move up/down).
All already built.

## 1. What this changes

### A. The sidebar's ↑/↓ buttons go; a task count takes their place

`SortableListLink` (`lists-sidebar.tsx:146`) currently renders a drag
handle (⠿), the list link, *and* a pair of Move up/down buttons — the
buttons were built in spec 12 as "the touch-friendly fallback this app
uses everywhere else a drag surface exists." The planner's ask is that the
drag handle alone is enough here and the buttons are redundant clutter.

- Remove the `onMoveUp`/`onMoveDown` buttons and their column entirely.
  `applyMove` stays (it's still what a drag calls on drop) — only the two
  buttons and the prop plumbing that fed them come out.
- The `KeyboardSensor` already wired into `ListsSidebar`'s `DndContext`
  keeps keyboard-only reordering working with no buttons at all (dnd-kit's
  own sortable keyboard interaction — arrow keys while a handle has
  focus), so removing the buttons doesn't remove an access path, just a
  visibly redundant one.
- In the space the buttons occupied, show a small numeric badge — the
  count of that list's outstanding (not-done) items. This needs the
  sidebar's list query to also carry a per-list open-item count, which it
  doesn't today (`ListsSidebar` only receives `ListRow[]`, no aggregate).
  A new query alongside (or folded into) whatever already fetches the
  sidebar's `lists` prop, grouping `list_items` by `list_id` where
  `status != 'done'`.

### B. A list is either a color or an emoji, never both

`ListAppearanceRow` (`list-appearance-editor.tsx`) and every place a list's
identity renders (`ListsSidebar`, `item-row.tsx`'s list badge,
`calendar-view.tsx`, `timeline-view.tsx`, `board-view.tsx`) currently show
**both** the color dot and the icon at once when a list has an icon set —
`lists-sidebar.tsx:181-186` renders the color dot unconditionally, then
the icon right after it if one exists. The planner wants these mutually
exclusive: pick an emoji, the color swatch stops showing (for that list,
everywhere its identity renders); clear the emoji, the color comes back.

- No schema change — `lists.color` and `lists.icon` already both exist
  independently; this is a rendering rule, not a new column; nothing stops
  a list from *storing* both today and this doesn't add a constraint that
  forbids it.
- Every render site that currently does "color dot, then icon if set"
  becomes "icon if set, else color dot" — one small conditional, applied
  consistently: `ListsSidebar`'s row, `ListAppearanceEditor`'s swatch
  strip, `item-row.tsx`'s list-label badge, and the three drag-surface
  views (calendar/timeline/board) wherever they key a card's accent off
  `list.color`.
- In `ListAppearanceEditor`, the color swatch strip becomes visually
  disabled (not removed — still there to switch back to) while an icon is
  set, so it's clear which of the two is "on" rather than the picker
  silently doing nothing when a swatch is clicked with an icon present.
  Clicking a swatch while an icon is set clears the icon (picking a color
  is choosing "not an emoji," same as picking an emoji clears back to no
  stored color preference being shown).

## 2. A decision, not an open question

**Does the outstanding count include sub-items, or only top-level items?**
Include both — "outstanding tasks in the list" is naturally read as
everything not yet done, and a sub-item is still a real, separately
completable thing (spec 1 §5a). Excluding sub-items would make the badge
undercount lists that lean on sub-tasks and give a false sense of "nearly
done."

## 3. Scope

**In:**
- `lists-sidebar.tsx`: remove `onMoveUp`/`onMoveDown` buttons from
  `SortableListLink`; add an outstanding-count badge in their place.
- A new query (or an addition to the existing sidebar lists query)
  producing `{ list_id, open_count }` for the current wedding.
- Icon-over-color rendering rule applied at every site listed in §1B.
- `ListAppearanceEditor`: disable (not hide) the color swatch strip while
  an icon is set; clicking a swatch clears the icon; typing an icon clears
  nothing about the stored color (it's just not shown while the icon
  wins), so switching the icon back off returns the same color as before.

**Out:**
- No change to `reorderLists` itself, or to drag behavior — only the
  redundant button UI comes out.
- No change to the five smart views (Today/Scheduled/Flagged/All/Assigned
  to me) — they aren't reorderable and don't get a count badge; this is
  scoped to "Your lists" only, same boundary spec 12 already drew.
- No new column, no migration — both parts are rendering/query changes
  over existing data.

## 4. Test plan

- `npm run typecheck`, `npm test`, `npm run build`.
- Unit: the open-item-count query/aggregation, if it's pure enough to test
  without a database (otherwise a SQL assertion instead).
- Browser pass: confirm the sidebar shows a live count next to each list
  and no arrows; tick off every item in a list and confirm its badge drops
  to 0; set an icon on a list and confirm its color dot disappears
  everywhere the list's identity shows (sidebar, calendar, timeline,
  board, the item-row list badge); clear the icon and confirm the color
  returns unchanged from before the icon was set.
