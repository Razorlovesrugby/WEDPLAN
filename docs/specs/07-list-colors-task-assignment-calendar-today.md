# Feature spec: Cooler list colors, auto-assign on task creation, a highlighted "today" on the calendar, and click-to-preview task cards

**Status: built end to end, same session (2026-09-16).** Four small,
independent UI/behavior fixes the planner asked for directly, each with an
unambiguous answer — no open questions to block the build on. Part D was
added as a same-session follow-up request after A–C shipped.

**Depends on:** Spec 1 (lists — `assigned_to`), spec 3 (`/calendar`'s month
grid, `list.color`'s fixed palette), spec 6 (`BudgetLinksPopup`, the
click-a-card/see-a-dialog/click-through pattern Part D reuses). All already
built.

## 1. What this changes

**Part A — the list color palette read as beige, not "cool".** Spec 3,
section 7, decision 4 fixed `list.color` to a small named palette
(`src/lib/list-colors.ts`) rather than a free color picker, to keep every
list legible wherever its color shows up (a swatch dot, a calendar-day
left border, a timeline/board card border, an email digest's left border).
That reasoning still holds — this only replaces the eight hues themselves.
The old set (Slate, Clay, Moss, Amber, Wine, Ink blue, Sage, Plum) was
muted and warm/brown-leaning. The new set is more saturated and spans
pink, red, and blue (plus violet and teal for spread), per the planner's
direct request ("pinks, reds, blues, not beige").

**Part B — a new task wasn't assigned to anyone.** `assigned_to` has
existed since spec 1 (`list_items.assigned_to`, the assign selector in
`item-row.tsx`), but nothing set it at creation — every new item started
unassigned, and assigning was a manual second step. Every creation path
(the quick-add box, the full add-item form, a task spun off a budget line
in `src/server/actions/budget.ts`/`budget-links.ts`) already goes through
one function, `addItem` in `src/server/actions/lists.ts`. Now `addItem`
reads the session user and sets `assigned_to` to whoever is creating the
item — still freely reassignable afterward through the existing
`assignItem` action, same as before.

**Part C — "today" on `/calendar` was easy to miss.** The month grid
(`src/components/lists/calendar-view.tsx`) already tracked `isToday`, but
it only showed up as a slightly bolder, accent-colored digit in the
corner — same size and weight class as "in month" vs. "out of month" text,
easy to scan past. Today's cell now gets a soft accent background wash and
an inset accent ring around the whole cell, and the date number itself
sits in a solid accent-filled circle badge instead of plain text.

**Part D — clicking a task on `/calendar` or `/timeline` did nothing but
start a drag.** `/budget` already has this exact pattern: click a budget
line's label, a dialog (`BudgetLinksPopup`) opens with a summary and
click-through links to whatever it's linked to, close it or follow a link.
Task cards on `/calendar` and `/timeline` had no equivalent — the whole
card (or, on `/calendar`, its title) only carried dnd-kit's drag listeners,
so there was no way to see a task's details or jump to it on `/lists/[id]`
without dragging it or hunting for its list. A new shared component,
`TaskPreviewPopup`, gives both screens the same click → dialog →
click-through flow: click a card's title (`/calendar`) or the card itself
(`/timeline`, excluding its own 💰 budget-link badge, which already
stops propagation) to open a read-only dialog with the title, list (dot +
name), status, due date, flag/priority, and notes if any, plus an "Open
task →" link to `/lists/[list_id]?highlight=[item_id]` — the same
highlight-and-scroll destination `BudgetLinksPopup`'s task links already
use. Both `DndContext`s now pass a `PointerSensor` with a 4px distance
`activationConstraint` (matching `list-detail.tsx`'s existing sortable
DndContext) so a plain click isn't swallowed as a zero-distance drag.

## 2. Scope

**In:**
- `src/lib/list-colors.ts` — new `LIST_COLOR_PALETTE` (8 entries: Rose,
  Ruby, Cobalt, Sky, Fuchsia, Crimson, Violet, Teal) and matching
  `DEFAULT_LIST_COLOR`.
- Every hardcoded `"#8a8580"` fallback (the old default, duplicated as a
  literal instead of importing the constant) in `item-row.tsx`,
  `lists-sidebar.tsx`, `timeline-view.tsx`, `list-detail.tsx`,
  `board-view.tsx`, `calendar-view.tsx`, and the reminder email template
  (`src/lib/email/templates.ts`) — all switched to import and use
  `DEFAULT_LIST_COLOR`, so an unset list's color stays consistent with the
  picker everywhere it renders instead of only in the settings picker.
- `addItem` in `src/server/actions/lists.ts` — sets `assigned_to` to the
  current session user's id on insert.
- `CalendarDay` in `src/components/lists/calendar-view.tsx` — today's
  cell background/ring and date-badge styling.
- `src/components/lists/task-preview-popup.tsx` — new `TaskPreviewPopup`,
  shared by `CalendarView` and `TimelineView`.
- `CalendarView`/`TimelineView` — a `PointerSensor` with a distance
  activation constraint, `previewItem` state, and the click handler wiring
  down through `CalendarDay`/`CalendarCard` and `TimelineColumn`/
  `TimelineCard`. Both now take a required `timezone` prop (the popup's
  due-date formatting), threaded from `wedding.timezone` in
  `/calendar/page.tsx` and `/timeline/page.tsx`.

**Out:**
- No new picker UI, no free-text/hex color input — still a fixed swatch
  set (spec 3's decision 4 stands).
- No migration and no backfill of existing `lists.color` values already
  stored as one of the old hexes — those rows keep whatever they have;
  this only changes which hexes the *picker* offers and what an *unset*
  list falls back to. A planner who wants an existing list re-colored just
  clicks a new swatch in `/settings`, same as always.
- No change to `assignItem`, the assign selector, or reassignment — Part B
  only changes the value a new item starts with.
- No change to `/calendar`'s urgency rings (overdue/due-soon) or drag-drop
  — Part C is additive styling on the same cell.
- No editing inside the preview popup — status, date, assignment, and
  notes stay editable only on `/lists/[id]` and `/board`, same as before;
  Part D is look-then-click-through, not a second place to edit a task.
- No board-view (`/board`) equivalent — that screen already links to
  nothing on click (drag between columns is its whole interaction) and
  wasn't asked for; can follow the same pattern later if wanted.

## 3. Test plan

- `npm run typecheck` and `npm test` (220 tests, unchanged pass count —
  none of these four changes touch logic covered by existing unit tests,
  no new pure-logic module was added that needs its own).
- `npm run build` compiles and typechecks clean; page-data collection
  fails only on missing `NEXT_PUBLIC_SUPABASE_*`/`NEXT_PUBLIC_SITE_URL`,
  which is this sandbox having no Supabase project configured, not a
  regression.
- Not yet opened in a browser against a live project — same caveat every
  prior spec in this rebase carries (`docs/HANDOFF.md`).
