# Feature spec: The seating canvas, round two: reach it without a mouse, resize and turn, steady edits, and the holes in spec 59

**Status: proposed, not built. The questions in §9 need answers before anything is built.**

**Depends on:** spec 59 (the seating canvas on a laptop: focus mode, navigation, selection, Stamp), spec 57 (the venue
designer: spaces, layouts, the close-up, the share link), spec 53 (undo and redo through whole-plan state), spec 45 (every
drag has a click alternative), spec 48 (phone view), spec 46 (command palette). Spec 59's Parts D (table items and rules) and
E (notes for vendors), and migration `0062`, stay in spec 59; this spec does not repeat them.

## 1. What was asked

"Everything that spec 59 missed." Spec 59 is silent in places, contradicts itself in two, and leaves some ways of working out
of reach. Each gap below is a fact about the app, checked against the code.

1. Spec 59 says two things that cannot both hold (favourites' scope, what Alt does) and names two features it gives nowhere
   to keep their state (Lock item on tables, Bring to front and Send to back).
2. Nothing on the plan can be reached from the keyboard alone: the plan is one focus stop, and tables and furniture are not.
3. On a tablet, multi-select, copy, the right-click menu and Stamp along a line do not exist, yet an iPad in landscape opens in
   focus mode and can move furniture.
4. Items can't be resized by dragging, a selection can't be turned as one formation, and snap guides line things up with
   other furniture but not with the building.
5. A refresh of the screen can undo an edit that has not finished saving.
6. The vendor's shared plan and the table close-up cannot be zoomed or panned.
7. Batch writes check everything first and put earlier writes back on failure, which is not the single transaction spec 59
   describes.
8. Much of spec 59 has only been tried in headless Chromium, with the server actions stubbed.

## 2. Story

> **As the couple, their planner, or a vendor with the link**, **I want** every way of working on the plan to be reachable
> by keyboard, by touch and by mouse, and my edits to stay where I put them while the screen refreshes, **so that** nobody is
> shut out of the plan by what they are holding, and nothing I just did quietly moves back.

## 3. Part A: Decisions spec 59 needs

### A.1 Favourites belong to one event's plan

Favourites are kept in the plan's settings, and a plan belongs to one event. Everyone on the wedding who opens that event's
plan sees the same Favourites row. A wedding with two events that seat has a row for each. The Library says so under the
row ("Shared with everyone on this plan"). Dishes are added to the row when Part D of spec 59 makes them placeable.

### A.2 What Alt does

Alt held **before** a drag starts copies what is picked, and the copy lands where it is dropped. Alt pressed **during** a drag
(one that did not start with Alt) turns snapping off for that drag. The hint line and the shortcut sheet say both.

### A.3 Lock item covers tables and furniture

Lock item (right-click, or in the inspector) holds one table or one piece of furniture or décor still. A locked item is drawn,
can be selected and edited, but is skipped by box selection, can't be dragged, nudged, turned, aligned or deleted, and shows a
padlock when hovered or selected. It binds everyone, is separate from Lock room (everyone, everything) and from a layer lock
(this device, a whole layer), and is carried by undo and History. Seating guests at a locked table still works.

### A.4 Order on the plan

Furniture and décor draw in an order the couple can change: **Bring to front** and **Send to back** (right-click and the
inspector) move the selection above or below everything else of its kind in that space. Tables always draw above furniture
and décor, so the order is among furniture and décor only. The order is stored per item and is the same for everyone and in
every export and the share link.

### A.5 One transaction

Moving, copying, deleting or stamping a selection is one database call that either does all of it or none of it, instead of
checks followed by separate writes with a put-back. It is refused whole when the layout is locked, is not the one the person
is looking at, or an item named is not in it.

## 4. Part B: Without a mouse

### B.1 Keyboard

- **Tab** moves into the plan; **Tab** and **Shift+Tab** then move through its tables and furniture in reading order (top to
  bottom, left to right within a row of about a metre), skipping locked layers. **Esc** leaves the plan to the next control.
- **Enter** opens the table's close-up, or the item's inspector. **Shift+Enter** adds or removes it from the selection.
  **Space** alone does the same as Shift+Enter; Space held while dragging still pans.
- The keys that already act on the selection (arrows, R, Delete, ⌘/Ctrl+D, C, V, A) act on the focused item when nothing else
  is picked.
- A polite live region says what happened: "Table 4 selected, 3 of 14", "3 things moved 5 cm right", "Pasted 2 things".
  Each table and item has an accessible name with its kind, name or number, seats taken and room position ("Table 4, round,
  6 of 8 seated, near the top left").
- Focus is visible on the item (a ring outside its outline, not the hover colour).

### B.2 Touch

On a tablet (768 px and wider) and an iPad in landscape:

- A **Select several** switch on the toolbar. On, a tap adds or removes an item and a drag on empty floor draws a selection
  box; off, a drag on empty floor pans, as today. A selection keeps its inspector, Duplicate, Align and Delete.
- **Long-press** an item or empty floor opens the right-click menu.
- **Stamp** with a **Line** switch on: a drag stamps along it, as Shift+drag does with a mouse.
- Two-finger pinch and pan, tap to select and tap to seat are unchanged. Nothing on a phone changes (spec 48).
- In focus mode, **← Seating** is the way out; no control depends on Esc, Space or `\`.

### B.3 Where focus mode starts

Focus mode starts at 1024 px wide. A tablet below that uses the page layout with the same floating toolbar.

## 5. Part C: What design tools do that the plan still can't

### C.1 Resize by dragging

With one fixture selected, handles at its corners and edge midpoints resize it; Shift keeps its proportions, Alt resizes about
its centre, and sizes snap to 5 cm (and to neighbours' edges, as moving does). The width and depth fields stay and agree. A
table with an explicit size (an oval, a long table, a banquet run's overall length) resizes the same way; a round or square
table has one handle for its diameter. Sizes stay inside the limits the database holds (fixtures 20 to 5000 cm, tables 40 to
2000 cm). A resize is one write and one undo step. A locked item has no handles.

### C.2 Turn a selection as a formation

With several things selected, the turn handle turns the whole formation about its centre: positions move round the centre and
each item turns by the same angle. **R** still turns each item about its own centre; the right-click menu offers **Turn 90° as
a group** beside **Turn 90°**.

### C.3 Snap to the building

Snap guides also line a moving item up with walls, their ends, doors, windows, markers and the edges of areas, and show the
distance to the nearest wall, coloured by the walkway thresholds. Guides to the building are a different colour from guides to
other furniture. Alt turns them off with the rest.

## 6. Part D: The plan elsewhere

### D.1 The shared plan and the close-up

The vendor's shared plan, the day-link plan and the table close-up (spec 57 C.2, and where spec 59 Part D places items) zoom
and pan:

- Pinch and Ctrl/⌘+scroll zoom about the pointer (10% to 800%); a plain scroll **scrolls the page**, because these pages have
  more below the plan; dragging a zoomed plan pans it; a **Fit** button and the zoom box are shown.
- The keys `+`, `−`, `0` and Shift+1 work when the plan has focus. Nothing on these pages writes.
- In the close-up on the planner's side, the same navigation as the Room view (Trackpad or Mouse mode, Space, Hand) applies,
  because items are placed there.

## 7. Part E: Edits that stay put

### E.1 A refresh never undoes an unsaved edit

The screen re-reads the plan every 15 seconds and after each write, and takes the server's copy over what is on screen.
Taken at the wrong moment that moves an item back, or throws away part of a run of arrow presses waiting to be saved.

- While a write is in flight or queued, or a run of nudges is waiting, or a drag, selection box or line is in progress, the
  screen **keeps its own copy** and applies the server's once nothing is pending.
- The 15-second refresh skips a tick during those moments rather than queueing one.
- A write that fails restores the server's copy and shows the error, as it does today.

### E.2 Two people moving the same thing

A move, turn or resize sends the position it started from. If the server's copy of any item has since changed, the whole
write is refused with "Someone changed this plan while you were working. Nothing was changed; the plan is up to date now",
the screen refreshes, and the person repeats the edit. Copies, deletes and stamps are not affected (a copy of an item that has
moved is still a copy).

## 8. Data and server

**One migration**, numbered after the ones already claimed (spec 59 claims `0062`):

- `seating_tables.locked boolean not null default false` and `seating_fixtures.locked boolean not null default false` (A.3).
  If spec 59's `0062` has not shipped, `seating_fixtures.locked` there is the same column; the table's is added with it.
- `seating_fixtures.z integer not null default 0` (A.4): draw order among furniture and décor in a space, ties by creation time.
- `seating_state()` and `restore_seating_state()` redefined to carry the new columns, or undo and History drop them.
- `seating_apply_items(...)`, a function that applies a whole move, copy, delete or stamp inside one transaction after the
  same checks the batch actions make (A.5). The actions call it, so they need no put-back code.
- `moveSeatingItems` takes each item's starting position and refuses the whole write when any differs (E.2).

**Pure, tested (`src/lib/seating/`):** `focusOrder(bodies)` (B.1), `describeChange(...)` (the live-region text), `resizeBody`
and its clamps (C.1), `turnAbout(bodies, centre, deg)` (C.2), `buildingGuides(moving, drawing, threshold)` (C.3), the rule that
decides when the screen may take the server's copy (E.1), and the view-only zoom and pan for D.1 (a pared-down use of
`canvas.ts`).

## 9. Open questions

Each has a recommendation; nothing is built until the answers are in.

1. **Favourites scope (A.1).** *Recommended: per event's plan, as stored, with the Library saying so.* Or one row for the
   whole wedding, which needs a wedding-level setting and means dishes, which belong to an event's menu, can't be in it.
2. **Alt (A.2).** *Recommended: before the drag copies, during the drag turns snapping off.* Or Alt always copies and snapping
   is turned off with another key (⌘/Ctrl), which takes a key away from nothing but changes today's habit.
3. **Lock item on tables as well as furniture (A.3).** *Recommended: both.* Or furniture only, as spec 59's data section lists.
4. **Order among furniture and décor (A.4).** *Recommended: a stored order for furniture and décor only; tables always above.*
   Or no order at all (Bring to front and Send to back are dropped from spec 59), or one order that includes tables.
5. **A database function for batch writes (A.5).** *Recommended: yes, in the same migration.* Or keep check-then-write with a
   put-back, which has never run against a database.
6. **Keyboard model (B.1).** *Recommended: Tab through items in reading order, Enter opens, Shift+Enter or Space picks.* Or
   arrow keys move focus between items and nudging needs a modifier, which suits screen readers but changes today's arrows.
7. **Touch (B.2).** *Recommended: a Select several switch, long-press for the menu, a Line switch.* Or leave tablets as
   view-and-seat only (no moving furniture below a laptop), which removes the gap by removing the ability.
8. **Resize by dragging (C.1).** *Recommended: fixtures and explicitly sized tables.* Or fixtures only, or leave sizes to the
   number fields.
9. **Turn a formation (C.2).** *Recommended: yes, through the handle and a menu entry.* Or leave R (each about its own centre)
   as the only turn.
10. **Snap to the building (C.3).** *Recommended: yes, walls, areas, doors, windows and markers, in their own colour.* Or tables
    and furniture only, as today.
11. **Shared plan, day-link plan and close-up (D.1).** *Recommended: pinch and Ctrl/⌘+scroll zoom, plain scroll scrolls the
    page, drag pans when zoomed.* Or the wheel always zooms on these pages, which traps a vendor on a page with content below.
12. **Two people moving the same thing (E.2).** *Recommended: refuse the whole move if the server's copy changed.* Or last write
    wins, as today, and undo is the remedy.
13. **Where focus mode starts (B.3).** *Recommended: 1024 px.* Or 768 px, which puts an iPad in portrait in focus mode with a
    rail and inspector that leave little plan.

## 10. Out of scope

Live co-editing and presence (spec 59 leaves them out too); grouping and ungrouping items; a minimap; 3D; touch drawing of
walls with a finger or pencil beyond tap and drag as today; changes to the phone view; the exports' contents (spec 59 Part E).

## 11. Build order

1. **E.1** (steady edits): no migration, and the one gap that can lose a person's work.
2. **B.1 and B.2** (keyboard and touch): no migration.
3. **C.1 to C.3** (resize, turn a formation, snap to the building): no migration.
4. **D.1** (view-only zoom and pan on the shared plan and close-up): no migration. Before spec 59 Part D, which places items
   in the close-up.
5. **A.1 to A.5 and E.2** (decisions, locks, order, the function): the migration. Folded into spec 59's `0062` if that has not
   shipped.

Each step is usable on its own.

## 12. Verification

Typecheck, unit tests for the §8 pure functions, the SQL suite for the migration (the new columns, `seating_state` round-trip,
`seating_apply_items` refusing a stale layout, a locked room and a foreign item, all or nothing), and the build. Then, and
saying which were run:

- **Real input.** A MacBook trackpad in Safari and in Chrome (pinch, two-finger scroll, Safari's gesture events, both
  navigation modes) and a plain mouse wheel; an iPad in landscape (Select several, long-press, Line, focus mode, no Esc or
  Space needed); a screen reader through Tab, Enter and the live region.
- **Real server actions.** Move, copy, delete, stamp and Favourites against a real database: a stale layout, a locked room, a
  foreign item and a failure partway, and undo after deleting a table with guests seated.
- **Scale.** The Room view with 100 tables and 800 chairs on a laptop with the CPU slowed 4×: a 50-table selection drags
  without dropped frames, and a refresh during an edit moves nothing back.
- **Edges.** Browser zoom at 150% and 200% and a 1024 × 600 window: the top bar, rail and inspector stay usable.

## 13. Risks

- **Space** both picks (alone) and pans (held with a drag). A short press with no drag picks; a drag pans. The two must be
  tested together.
- **Handles crowd small items.** A 30 cm lantern at fit zoom has resize and turn handles on top of each other. Handles appear
  at a minimum screen size and otherwise the width and depth fields are the way.
- **A Select several switch left on** makes a drag draw a box when the person meant to pan. The toolbar shows it as on and
  Esc, or tapping it, turns it off.
- **Holding the server's copy** too long hides a real change. The hold ends when nothing is pending, or after 10 seconds, with
  the error shown if a write has not come back.
- **Refusing a stale move** annoys two people working in the same corner. The message says what happened and the refresh
  means repeating one edit, not many.
