# Feature spec: Everything works without dragging, and every control can be found by name

**Status: proposal, not built.** Written 2026-11-06 from a discovery pass over the code.
Nothing here is authorised to build until §8's questions are answered and the planner says to
build it.

**Depends on:** spec 41 (the shell). Independent of 42–44 and 46; could be built alongside any of
them.

## 1. What was asked

Laptop first, but "make sure it's easily navigated by AI and by mobile." Phones, keyboards,
screen readers and AI assistants driving a browser all get stuck on the same things: actions
that only work by dragging or hovering, and controls with no name.

## 2. What's there now

**Twelve components use drag and drop** (`@dnd-kit`). A quick count of each file shows how many
already have a keyboard sensor and a non-drag alternative. **This is a count of text, not a test.**
The build must check each one by using it.

| Component | Keyboard sensor | "Move…" alternative found |
| --- | --- | --- |
| `lists/lists-sidebar.tsx` | yes | yes |
| `lists/list-detail.tsx` | yes | yes |
| `lists/calendar-view.tsx` | **no** | yes |
| `lists/board-view.tsx` | **no** | yes |
| `lists/timeline-view.tsx` | **no** | **no** |
| `rank/rank-list.tsx` | yes | yes |
| `moodboards/board-grid.tsx` | **no** | **no** |
| `questions/questions-editor.tsx` | yes | **no** |
| `site/editor/builder.tsx` | **no** | yes |
| `site/editor/repeat-rows.tsx` | yes | **no** |
| `seating/seating-screen.tsx` | yes | **no** |
| `run-sheet/run-sheet-view.tsx` | yes | **no** |

**Hover-only UI** may exist in `moodboards/board-grid.tsx`, `site/editor/repeat-rows.tsx` and
`site/section-rail.tsx` (`group-hover:` / `onMouseEnter`). On a phone, a control that only
appears on hover can't be reached at all.

## 3. The proposal

### 3.1 A non-drag way to do every drag

- **Reordering** (lists, tasks, questions, repeat rows, blocks, moodboard pins, run-sheet rows): a
  **⋯ menu on each row** with **Move up · Move down · Move to top · Move to bottom**, plus
  **Move to…** where a row can change container (a task to another list or section, a guest
  to another table). These call the same server action the drop calls.
- **Dates by dragging** (calendar, timeline): the row's ⋯ menu gets **Change date…**, which opens
  the existing date field.
- **Seating**: each guest gets **Seat at…** (a table picker), in addition to dragging.
- **Every dnd-kit context gets `KeyboardSensor`** with `sortableKeyboardCoordinates`, plus
  dnd-kit's screen-reader announcements.

### 3.2 Nothing that only appears on hover

Controls revealed on hover are **always visible on touch devices** (`@media (hover: none)`) and
**visible when focused** (`:focus-within`) everywhere.

### 3.3 Every control has a name

- **Icon-only buttons** get an `aria-label` that says what happens ("Delete task 'Book
  florist'", not "Delete").
- **Every input has a visible `<label>`** or, failing that, an `aria-label`.
- **Headings in order** on every page: one `h1`, then `h2`s.
- **Stable `id`s** on primary actions (e.g. `id="send-invitations"`), so an AI assistant or a test
  can find them.

### 3.4 A check that keeps it that way

- An **axe-core run in headless Chromium** over every planner route with sample data, failing on
  "serious" or "critical" issues. It's a script under `scripts/`, run like `verify-migrations.sh`.
- A **unit test that fails if a dnd-kit `DndContext` is created without `KeyboardSensor`**
  (source-guard, the same style as spec 36's registry guard).

## 4. Not in scope

- A full WCAG audit, or testing with a real screen reader or phone. The axe run is automated.
- An API or tool list for AI assistants (see the discovery page's "later" note).

## 5. Data

**No migration.** Every Move action reuses an existing server action.

## 6. Files (expected)

- The twelve components in §2.
- `src/components/ui/row-menu.tsx` (new): the shared ⋯ menu with Move items.
- `src/lib/reorder.ts` (new or existing, pure): "move up / down / to top / to bottom" → new
  order, unit-tested.
- `scripts/a11y-check.mjs` (new): axe-core over the routes.
- Source-guard test for `KeyboardSensor`.

## 7. Test plan

- Unit: `reorder.ts` for each move at the edges (first, last, single item).
- Unit: the `KeyboardSensor` source guard.
- Headless Chromium: for each of the twelve, perform the action **once by menu and once by
  keyboard** and check the result. Axe run passes.
- typecheck, test, build.

## 8. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Add `axe-core` (and `@axe-core/playwright`) as dev dependencies? | **Yes.** Dev only, nothing ships to users. |
| 2 | Should the axe check fail the build, or just report? | **Report only at first**, then fail once the backlog is cleared. |
| 3 | Move menus on every reorderable row, or only where drag is the only way today? | **Every row**, so all lists behave the same. |
