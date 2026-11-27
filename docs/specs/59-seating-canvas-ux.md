# Feature spec: The seating canvas on a laptop: room to work, clear tools, fast placing

**Status: proposed, not built.** Open questions in §11 need answers before
anything is built.

**Depends on:** spec 57 (the venue designer: spaces, layouts, library, drawing
tools, table styles, close-up, food service, exports, share link), spec 53
(undo/redo through whole-plan state, multi-select of guests), spec 46 (command
palette and shortcuts), spec 45 (every drag has a click alternative), spec 48
(phone view). All built.

## 1. What was asked

The designer has the features; working in it on a laptop is hard.

1. Panning and selecting are the same gesture, so nobody knows whether a drag
   will move the view or move a thing.
2. Zooming on a trackpad zooms the whole web page instead of the plan, or races.
3. The screen is mostly not the plan: a narrow centred page, the app header, a
   left panel few people use, and a stack of panels under the canvas.
4. Placing many things is slow: each flower, candle or dish is pick, click,
   pick again.
5. Several things can't be selected and moved together.
6. There is no way to say *where on a table* things go ("flowers at this end",
   "a shared dish every three seats") and show that to vendors.

## 2. Story

> **As the couple or their planner on a laptop**, **I want** the plan to fill
> the screen, to pan and zoom the way every design tool does, to select many
> things and move them at once, and to drop flowers and dishes with a click per
> spot or a rule per table, **so that** I can lay out the room quickly and send
> each vendor a picture of exactly where their things go.

## 3. What the leading tools do (conclusion only)

Design canvases (Figma, Miro, tldraw, Excalidraw) agree on one model: two-finger
scroll pans, pinch or Ctrl/⌘+scroll zooms smoothly about the cursor, Space+drag
or a Hand tool pans, dragging empty canvas with the Select tool draws a selection
box, and a "keep tool" lock lets one tool place many things. Event-diagram tools
(Cvent Social Tables, Prismm, formerly AllSeated) add table-level design
applied to one table or the whole room, but bulk placement is a known gap. This
spec takes the canvas model wholesale and adds rule-based placement on tables.

## 4. Part A — The plan fills the screen

### A.1 Focus mode

- The Room view opens in **focus mode** on screens 1024 px wide and wider: the
  designer takes the whole browser window. The app header, the page's centred
  width limit and the page scroll are gone; nothing scrolls but the panels.
- A thin **top bar** (44 px) holds: ← Seating (leaves focus mode), the event's
  name, the layout switcher and space tabs, Undo / Redo, saved state, Lock room,
  Share, Export, Print.
- **Esc** with nothing selected and no tool active, or ← Seating, leaves focus
  mode. The browser's own full screen (F11 / ⌃⌘F) works on top and is not
  required.
- The Tables view and the phone view (spec 57 §5, spec 48) are unchanged.

### A.2 Panels

- **Left rail:** a 48 px column of icons, each opening a 320 px panel that
  overlays the canvas edge: **Guests**, **Library**, **Venue**, **Styles**,
  **Food**, **Rules**, **History**, **Settings**. These are today's panels
  (tray, library, venue panel, styles, food, rules, snapshots and day activity,
  settings), moved out of the stack under the canvas. One panel is open at a
  time; clicking its icon again closes it. **Pin** keeps it open beside the
  canvas instead of over it.
- **Right inspector** (spec 57 A.1's right panel): opens when
  something is selected, closes when nothing is. One table: Seats, Style, Notes
  tabs. One fixture or décor item: name, size, rotation, quantity, supplier.
  Several things: the count by kind and what they share (A.5).
- **Hide panels:** `\` (or ⌘/Ctrl+`.`) hides the rail, inspector and toolbar
  so only the plan and zoom controls remain; again to bring them back.
- The open panel, pinned state and hidden state are remembered per device.
- The **legend** collapses to a single "Key" chip; open, it is as today.

### A.3 Toolbar

A floating bar at the bottom centre of the canvas, one tool active at a time:

| Tool | Key | What a drag on empty canvas does |
| --- | --- | --- |
| **Select** (default) | V | Draws a selection box |
| **Hand** | H | Pans |
| **Stamp** (Part C) | S | — (click places) |
| Walls, Curved wall, Area, Text, Measure | W, C, A, T, M | As spec 57 Part B |
| **Note** (Part E) | N | — (click pins a note) |

The drawing tools stay hidden while the room is locked (spec 57 Part D).

### A.4 Navigation

The pointer over the canvas never scrolls or zooms the page.

- **Two-finger scroll** (trackpad) or **mouse wheel** pans. Shift+wheel pans
  sideways.
- **Pinch**, or **Ctrl/⌘+scroll**, zooms about the cursor in proportion to the
  gesture (no fixed step per event, so a trackpad doesn't race and a mouse
  notch is about 10%).
- **Space+drag**, **middle-button drag** and the Hand tool pan from any tool.
- In Settings (per device): **"Mouse wheel zooms"**, off by default, for people
  on a mouse who expect it; Ctrl/⌘ then pans.
- Keys: `+` / `−` zoom, **Shift+1** fit the space, **Shift+2** zoom to the
  selection, **0** zoom to 100%. Double-clicking a table opens its close-up
  (spec 57 C.2), as today.
- Zoom is between 10% and 800%. The zoom box shows the % and opens a menu: Fit,
  Selection, 50%, 100%, 200%.
- Safari's pinch is a gesture event, not a wheel: both are captured on the
  canvas. The page's own browser zoom (⌘+ outside the canvas) still works.

### A.5 Selecting and moving

- **Click** selects one table, fixture, décor item or note. **Shift-click**
  adds or removes. **⌘/Ctrl+A** selects everything movable in the space.
- **Drag on empty canvas** with Select draws a box; everything it touches is
  selected (Alt: only what it fully contains). Shift+box adds to the selection.
- **Walls, doors and the venue drawing** are selected only while the Venue
  panel is open or a drawing tool is active, so a selection box over the room
  picks furniture, not the building.
- **Select similar** (right-click, or ⌘/Ctrl+Shift+A): every item of the
  selection's kind and size in the space (all 180 cm rounds, all candles).
- **Drag** any selected item to move the whole selection; arrow keys nudge it
  5 cm (Shift: 25 cm); **R** turns each item 15° about its own centre.
- **Alt+drag** duplicates and moves the copy. **⌘/Ctrl+D** duplicates in place,
  offset 50 cm. **⌘/Ctrl+C / V** copy and paste, also between spaces of one
  layout. **Delete** removes. Copies of tables are empty of guests.
- **Align and space** (inspector, two or more selected): align left / centre /
  right / top / middle / bottom; space evenly across or down; and **Arrange in
  a grid** with a gap in cm.
- **Lock item** (right-click): an item stays put and is skipped by box
  selection until unlocked. Separate from Lock room.
- Each move, duplicate, paste, align or delete of a selection is **one undo
  step** and **one server write** (§9).
- Moving a table moves its chairs, its table décor and dishes (Part D) and its
  seated guests with it.

### A.6 Telling the modes apart

- The cursor says what will happen: arrow (Select, empty), four-way arrows
  (over a movable item), open hand / closed hand (Hand, Space, panning),
  crosshair (Stamp, drawing tools, Note), not-allowed (an item on a locked room
  or a locked item).
- Hovering an item outlines it before any click.
- A one-line **hint** under the toolbar names the active tool and its keys
  ("Stamp: Candles · click to place · Esc to stop"), replacing today's status
  bar above the canvas.
- **?** opens a shortcut sheet for the designer (and the designer's commands
  join the spec 46 palette).
- The first time someone opens focus mode, three tips appear one after another
  (scroll moves, pinch zooms, drag to select) with Got it; never again on that
  device.

## 5. Part B — Right-click

A context menu on an item or a selection: Duplicate, Copy, Paste, Delete, Turn
90°, Select similar, Align (submenu), Lock item, Add a note here, Bring to
front / Send to back. On a table also: Open close-up, Apply style, Add table
décor (Part D). On empty canvas: Paste here, Add a note here, Fit.

## 6. Part C — Placing many things fast

- Choosing a library tile (or a décor item, dish or the couple's own item)
  starts **Stamp** with it: each click places one, and the tool stays until
  Esc, V, or another tool. Every placed item saves at once (each click is its
  own undo step).
- Dragging a tile onto the canvas still places one and returns to Select.
- **Recent:** the last six items stamped appear at the top of the Library and
  on keys 1–6 while Stamp is active, so switching from candles to lanterns is
  one key.
- **Stamp along a line:** with Stamp active, Shift+drag places the item every
  *N* cm along the drag (N shown and typed in the hint bar; default the item's
  width plus 20 cm). This is aisle flowers down the aisle, lanterns along a
  path.
- **Repeat** (inspector, one item selected): *N* copies at a gap, across or
  down.

## 7. Part D — Things on tables

What a table carries, and where on it, is part of the table and moves with it.

### D.1 Table décor and dishes, placed

- A **table item** is anything sitting on a table: an arrangement, candles, a
  bud vase, a sign, a shared dish (spec 57 F.3) or one of the couple's own
  items. Each has a position on the table top.
- In the **close-up** (spec 57 C.2) the left panel lists the table's items and
  the style's; Stamp works there, clicking on the table top to place; items
  drag, box-select, Alt-drag duplicate and delete as in the room. Positions snap
  to the table's centre line, its ends, and the points opposite each chair.
- In the **room**, a table's items are drawn to scale on its top from 100% zoom
  (a glyph below that, as today). Selecting a table and choosing **Add table
  décor** opens the close-up.

### D.2 Rules: "every three seats"

An item can be placed by a **rule** instead of by hand. A rule is one of:

| Rule | Example |
| --- | --- |
| **Every *N* seats** | A shared dish between every three seats, down the middle |
| ***N* per table, evenly spaced** | Three arrangements down a long table |
| **At each end** / **At one end** (which end chosen) | Flowers at the head end |
| **In the centre** | One arrangement on a round |
| **At each seat** | A bud vase per place |

- On a long or banquet table the positions run along its centre line; on a
  round or oval, around a ring inside the place settings.
- A rule lives on a **table style** (spec 57 C.1), so "Long, family style:
  platter every 3 seats, flowers at each end" applies to every table with that
  style and follows each table's size and chair count. A table can override it
  (spec 57's per-table change, "Changed from *style*").
- **Make it by hand:** on one table, turns its rule positions into ordinary
  placed items to move one by one. It becomes a per-table change.
- For shared dishes, the number a rule places becomes the platter
  **suggestion** for that dish and table (spec 57 F.3); a typed platter count
  still wins and is flagged "Check platters" when it differs from what is
  placed.
- For décor, placed and ruled items count into the florist and hire totals
  (spec 57 C.3) as suggestions; the typed final number still wins.

### D.3 Applying to many tables

- With several tables selected: **Apply style**, and **Add to these tables**
  (an item with a rule, added as a per-table change on each).
- **Copy table décor / Paste table décor** (right-click) copy one table's items
  and rules onto others; positions are kept relative to the table's length.

## 8. Part E — Notes for vendors

- The **Note** tool pins a short note on the plan or on a table ("Flowers
  hang from this beam", "Cake here, power behind"). A note on a table moves with
  it.
- A note can be addressed to **everyone** or to one or more vendors (spec 8)
  and shows the vendor's name on its pin.
- Notes are drawn on the canvas (Show → Notes), in the share link, and in each
  export (spec 57 Part E) for the vendors it names, numbered on the plan with
  the text in a list beside it.
- The florist and hire exports show each styled table's close-up with its
  placed items, so the florist sees "this end" and the caterer sees each dish.

## 9. Data and server

**Migration `0062` (one file):**

- `seating_tables.table_items jsonb not null default '[]'`: placed items, each
  `{ id, kind, ref, along, across, rotation }` with `along` / `across` as
  fractions of the table's length and width (so they survive a resize).
- `seating_table_styles.item_rules jsonb not null default '[]'`: rules, each
  `{ id, kind, ref, rule, n?, end? }`. Per-table overrides go in the existing
  per-table changes.
- Notes are a new element kind in the space drawing (validated by
  `src/lib/seating/drawing.ts`), `{ id, x, y, text, vendor_ids, table_id? }`,
  so they need no table.
- `seating_fixtures.locked boolean not null default false` (A.5 Lock item).
- `seating_state()` / `restore_seating_state()` redefined to carry the new
  columns, or undo and History silently drop them.

**Server actions:**

- `moveSeatingItems(eventId, layoutId, moves[])`: many tables and fixtures in
  one transaction, refused as a whole on a locked room.
- `duplicateSeatingItems(...)`, `deleteSeatingItems(...)`: the same for copies
  and deletes.
- `setTableItems(eventId, tableId, items)` and the style save carrying rules.

**Pure, tested (`src/lib/seating/`):** `rulePositions(table, rule)` (positions
for every shape), `alignItems`, `distributeItems`, `gridItems`,
`boxHits(items, box, mode)`, wheel/pinch delta to zoom factor.

## 10. Out of scope

3D views; live co-editing; snapping guides between items (beyond the grid and
table snaps); a minimap (question 6); touch and phone changes beyond keeping
today's pinch-to-zoom and tap-to-seat.

## 11. Open questions

1. **Focus mode by default?** (a) Room view always opens full-window (recommended),
   (b) a "Focus" button on today's page, (c) both, with the choice remembered.
2. **Plain mouse wheel:** (a) pans, with "Mouse wheel zooms" as a setting
   (recommended: matches Figma and Miro; trackpads are the laptop case), (b)
   zooms, as today, with a setting to pan.
3. **Placing from the library:** (a) a tile click starts Stamp and stays until
   Esc (recommended), (b) one placement then back to Select, with a lock toggle
   to stay.
4. **Rules on styles or per table?** (a) on styles, overridable per table
   (recommended: one change reaches every long table), (b) per table only.
5. **Dishes:** should placed or ruled dishes drive the platter suggestion (D.2,
   recommended), or stay separate from the platter counts?
6. **Minimap** in a corner for big venues and several spaces: (a) no
   (recommended; Fit and Shift+2 cover it), (b) yes.
7. **Notes:** addressed to vendors (Part E, recommended), or plain notes with no
   addressee?
8. **Build order:** Parts A–C first (screen, navigation, selection, Stamp: no
   migration) then D–E (migration `0062`), recommended; or all together.

## 12. Build order (once answered)

1. Navigation and selection model (A.3–A.6, Part B): wheel, pinch, Space, Hand,
   selection box, multi-select moves and the batch actions. No migration.
2. Focus mode, rail and inspector (A.1, A.2).
3. Stamp, recent, stamp along a line, repeat (Part C).
4. Migration `0062`; table items and rules in the close-up and the room (Part D).
5. Notes and the export changes (Part E).

Each step is usable on its own.

## 13. Verification

Typecheck, unit tests for the §9 pure functions, the SQL suite for `0062` (and
`seating_state` round-tripping the new columns), the build. Navigation must be
tried in a real browser: headless Chromium for wheel and pointer events, and a
person on a MacBook trackpad in Safari and Chrome for pinch and two-finger
scroll, which headless testing cannot reproduce. Say which were run.

## 14. Risks

- **Changing what a drag does** retrains anyone who has learnt today's
  background-drag-pans. The first-visit tips and the hint line carry it.
- **Rule positions on odd shapes** (serpentine, U runs): the pure function must
  cover every shape spec 57 draws, tested per shape.
- **Batch writes on a locked room or a stale layout** must refuse as a whole,
  never move half a selection.
