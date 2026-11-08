# Feature spec: Everything works without dragging, and every control can be found by name

**Status: built (2026-11-08), branch `claude/nice-mccarthy-x93m9s`, no PR.** No migration. Two answers
("make iPad friendly", report-only check); spec 46 was done first at the planner's choice; then "Build
45 and 46" (46 was already built). **§10 is what was built.**

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

## 9. Answered (2026-11-08)

| Q | Question | Answer |
| --- | --- | --- |
| 3 | Move menus on every reorderable row, or only where drag is the only way? | **"Make iPad friendly."** Read as: every reorderable row gets the menu, and the pass is aimed at a touch tablet. That means: |
| 2 | Should the axe check fail the build? | **Report only for now.** |

What "iPad friendly" adds to §3, to confirm before building:

- **Touch targets of at least 44×44 pt** on every row action, the ⋯ menu, tick boxes and the side
  panel's Done button (Apple's minimum).
- **The ⋯ menu is a button, not a long-press**, and drag gets a short press-and-hold delay on touch
  (dnd-kit `TouchSensor`, ~200 ms), so scrolling a list never starts a drag.
- **No hover-only controls** (§3.2 already), checked at iPad widths (768 and 1024, both
  orientations), plus **the side panel as a sheet in portrait and on the right in landscape**.
- Q1 (add `axe-core` as a dev dependency) wasn't asked separately. "Report only" implies yes; to
  confirm when this is built.

## 10. Build status (2026-11-08)

**What was built:**

- **One drag setup** (`src/components/ui/use-drag-sensors.ts`), used by all 12 drag screens. The
  board view had none before.
  - **Touch** waits for a 200 ms press within 8 px, so scrolling never picks a row up.
  - **Mouse** starts after 4–6 px.
  - **Keyboard** works on every screen: Space, arrows, Space.
  - `stopDrag` stops a control *inside* a draggable thing (a select, ⋯, 📅) from starting a drag by
    mouse, touch or key.
  - `drag-sensors.test.ts` fails if a `DndContext` sets up its own sensors or none.
- **A ⋯ menu** (`src/components/ui/row-menu.tsx`): 44×44, arrow keys between items, Esc returns
  focus. It offers Move up / down / to top / to bottom, leaving out any that would do nothing or
  repeat another (`moveTargets` in `src/lib/reorder.ts`, tested). Where drag was the only way, it's
  added to:
  - the **lists sidebar** (spec 16 had dropped its buttons);
  - **run-sheet rows** (pinned rows have no menu);
  - **moodboard pictures**: "Move earlier / later / to the start / to the end".
- **Timeline cards** get the calendar's 📅 change-date button; before, dragging was the only way to
  change a date there.
- **The invitation builder's ▲▼** now show at every width. They were hidden at `lg:`, which
  includes an iPad in landscape.
- **Touch sizes,** on coarse pointers inside the planner (`[data-planner]`), so guest pages are
  untouched:
  - `.btn` is at least 44 px tall, and tick boxes and radios are 22 px;
  - `.touch-target` sets the 44×44 minimum, and the ↑↓ buttons on tasks, sections, ranking, RSVP
    questions and block rows grow to it;
  - `.hover-reveal` shows hover-only controls on touch and on focus (moodboard captions).
- **Labels:** a scan for symbol-only buttons with no `aria-label` found none to fix.
- **`npm run a11y`** (`scripts/a11y-check.mjs`, `axe-core` 4.10.2 as a **dev dependency only**).
  - It checks each page at iPad (1024 × 768) and phone (390) widths and **always exits 0** (Q2).
  - Planner pages need `A11Y_COOKIE` from a signed-in browser.
  - Run against the built app's public pages (`/login`, `/forgot-password`, `/start`, `/privacy`):
    no problems at either width.

**Departures:**

1. **Screens that already had a non-drag way keep it**, rather than gaining a second ⋯ menu:
   - ↑↓ buttons on tasks, list sections, ranking, RSVP questions and block rows;
   - "Move to…" on the board and the calendar;
   - tap-to-place on seating.

   Their buttons were made touch-sized instead. This answers "iPad friendly" with fewer controls.
2. **Planner pages weren't run through the accessibility check.** They need a signed-in session
   against a real project.

**Verified:** `npm run typecheck`; `npm test`, 1395 tests (16 new); `next build`; `npm run a11y` on
the public pages.

**Seen** on an emulated iPad (landscape, touch) on a temporary sample page (deleted):
- the lists sidebar's ⋯ is 44×44;
- it offers only the moves that do something;
- focus starts on the first item and Esc closes it;
- "Move up" reorders the list;
- no errors.

**Not verified:** a real iPad; long-press dragging by a real finger; the moves saving to Supabase.
