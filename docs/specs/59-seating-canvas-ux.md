# Feature spec: The seating canvas on a laptop: room to work, clear tools, fast placing

**Status: answered; Parts A, B and C built in session 65 (no migration); Parts D and E, Lock item, Bring to front and Send
to back and the one-transaction batch writes built in session 66 with migration `0062` (written, not yet applied).** See
**Build status** at the end. Every question answered 2026-11-27 (see **Answered**).

**Depends on:** spec 57 (the venue designer: spaces, layouts, library, drawing
tools, table styles, close-up, food service, exports, share link), spec 53
(undo/redo through whole-plan state, multi-select of guests), spec 46 (command
palette and shortcuts), spec 45 (every drag has a click alternative), spec 48
(phone view). All built.

## Answered — 2026-11-27

The planner took every recommendation. In one line each:

Q1 the Room view always opens in focus mode · Q2 Trackpad is the default
navigation mode · Q3 a library click starts Stamp, which stays until Esc · Q4
rules live on table styles, overridable per table · Q5 placed and ruled dishes
drive the platter suggestion · Q6 no minimap · Q7 notes can be addressed to
vendors · Q8 build Parts A–C first (no migration), then D–E (`0062`). Two
follow-ups took the defaults below: "every *N* seats" counts chairs along one
side of a long table (D.2), and multi-select in the room picks tables and items,
while place settings stay drawn from the table's style (A.5).

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
box, and a "keep tool" lock lets one tool place many things. Miro's automatic
mouse-or-trackpad detection is a common source of confusion; an explicit,
easily switched mode is not. Event-diagram tools (Cvent Social Tables, Prismm,
formerly AllSeated, Lovely Seating) add box selection, editing many objects of
one type, align and distribute, snap guides that line tables into rows, layers
and locking, a favourites list, and table design applied to one table or the
whole room; bulk placement is a known gap and none places table items by rule.
This spec takes the canvas model wholesale, matches those features, and adds
rule-based placement on tables.

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

- **Pinch**, or **Ctrl/⌘+scroll**, zooms about the cursor in proportion to the
  gesture (no fixed step per event, so a trackpad doesn't race and a mouse
  notch is about 10%).
- **Space+drag**, **middle-button drag** and the Hand tool pan from any tool.
- **Navigation mode**, per device, one of two, never detected automatically:
  - **Trackpad** (default): two-finger scroll or the wheel pans; Shift+scroll
    pans sideways.
  - **Mouse:** the wheel zooms about the cursor; Shift+wheel pans sideways and
    Ctrl/⌘+wheel pans up and down.
  It is switched in Settings, from right-clicking empty canvas ("Navigation:
  Trackpad / Mouse"), and from the zoom box menu. The first time a person
  scrolls on the plan, the hint line says which mode is on and how to switch.
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
- **Layers:** Venue (walls, doors, windows, areas, the drawing), Tables,
  Room furniture, Flowers & décor, Notes. Each can be shown or hidden (the
  existing Show menu) and **locked**: a locked layer is drawn but can't be
  clicked, box-selected or moved. The Venue layer is locked by default and
  unlocks while the Venue panel is open or a drawing tool is active, so a
  selection box over the room picks furniture, not the building. Layer locks
  are per device, separate from Lock room (spec 57 Part D), which binds
  everyone.
- **What can be selected** in the room: tables (with their chairs), room
  furniture, décor, table items (Part D) and notes. Place settings (plates,
  glasses, cutlery) are drawn from the table's style (spec 57 C.1) and are
  changed there or by a per-table change, not dragged one by one.
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
- **Snap guides:** while dragging, the moving item (or the selection's
  outline) snaps to the centres and edges of nearby tables and items and to
  equal spacing between them, and a thin line shows what it lined up with, so
  tables fall into rows and even gaps by eye. Guides take priority over the
  grid; Alt while dragging turns all snapping off. A spacing guide shows the
  gap in cm and is coloured by the plan's walkway thresholds (spec 57 Part I).
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
décor (Part D). On empty canvas: Paste here, Add a note here, Fit, Navigation: Trackpad / Mouse, Lock or unlock a layer.

## 6. Part C — Placing many things fast

- Choosing a library tile (or a décor item, dish or the couple's own item)
  starts **Stamp** with it: each click places one, and the tool stays until
  Esc, V, or another tool. Every placed item saves at once (each click is its
  own undo step).
- Dragging a tile onto the canvas still places one and returns to Select.
- **Favourites:** a star on any library tile, décor item, dish or the couple's
  own item pins it to a Favourites row at the top of the Library, in the
  order starred (drag to reorder). Favourites are wedding-wide, so every
  collaborator sees the same row.
- **Recent:** the last six items stamped sit under Favourites.
- While Stamp is active, keys 1–9 pick the first nine of Favourites then
  Recent, so switching from candles to lanterns is one key.
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

- **Counting seats:** on a long or banquet table with chairs on both sides,
  *N* counts chairs along one side, and each position serves the chairs on both
  sides level with it (every 3 seats feeds about six people). On a table seated
  on one side only, and on a round or oval, *N* counts chairs in order around
  it. The inspector shows how many guests each position serves.
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
- Favourites: an ordered list of item references in the plan settings
  (spec 57 Part I), so no new table. Navigation mode and layer locks are per
  device (browser storage), never stored.
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
`boxHits(items, box, mode)`, `snapGuides(moving, others, threshold)` (edge,
centre and equal-spacing matches), wheel/pinch delta to zoom factor.

## 10. Out of scope

3D views and a large 3D object library; live co-editing; a minimap (Fit and Shift+2 cover big venues); touch and phone changes beyond keeping
today's pinch-to-zoom and tap-to-seat.

## 11. Open questions

None.

## 12. Build order

1. Navigation and selection model (A.3–A.6, Part B): navigation modes, pinch,
   Space, Hand, selection box, layers and their locks, multi-select moves, snap
   guides and the batch actions. No migration.
2. Focus mode, rail and inspector (A.1, A.2).
3. Stamp, favourites, recent, stamp along a line, repeat (Part C).
4. Migration `0062`; table items and rules in the close-up and the room (Part D).
5. Notes and the export changes (Part E).

Each step is usable on its own.

## 13. Verification

Typecheck, unit tests for the §9 pure functions, the SQL suite for `0062` (and
`seating_state` round-tripping the new columns), the build. Navigation must be
tried in a real browser: headless Chromium for wheel and pointer events, and a
person on a MacBook trackpad in Safari and Chrome, and on a plain mouse, for
pinch, two-finger scroll and both navigation modes, which headless testing
cannot reproduce. Snap guides must stay smooth dragging a 20-table selection in
a room of 40 tables. Say which were run.

## 14. Risks

- **Changing what a drag does** retrains anyone who has learnt today's
  background-drag-pans. The first-visit tips and the hint line carry it.
- **Rule positions on odd shapes** (serpentine, U runs): the pure function must
  cover every shape spec 57 draws, tested per shape.
- **Batch writes on a locked room or a stale layout** must refuse as a whole,
  never move half a selection.

## Build status

Built in session 65 on branch `claude/awesome-mendel-bdg1ak`: **build-order steps 1 to 3 (Parts A, B and C), which need no
migration.** Steps 4 and 5 (Part D table items and rules, Part E notes, and migration `0062`) are **not built**; the planner's
Q8 order puts them after these, and a migration is a confirm-first step in `CLAUDE.md`.

**Built.**

- **A.1 Focus mode:** the Room view opens full-window on 1024 px and wider (a fixed overlay over the app shell, body scroll
  locked); 44 px top bar with ← Seating, the event, the layout and room (as dropdowns holding the existing layout and space
  controls, not tabs in the bar), undo and redo, "Saving… / saved", Lock room, Share, Export and Print; Esc with nothing
  picked and no tool leaves it; "Focus on the plan" goes back in.
- **A.2 Panels:** the 48 px rail opens Guests, Library, Venue, Styles, Food, Rules, History and Settings in a 320 px panel,
  pinned beside the plan or floating over it; the inspector docks on the right when something is picked (one table: Seats,
  Style, Notes; one fixture; several things); `\` and ⌘/Ctrl+`.` hide the rail, inspector and tools; open panel, pin and hidden
  are remembered per device; the legend is a "Key" chip.
- **A.3 to A.6:** the Select (V), Hand (H) and drawing tools on a floating bar with a zoom box (Fit, Selection, 50, 100, 200
  and the navigation mode); pinch and Ctrl/⌘+scroll zoom in proportion (a mouse notch is 10%), Trackpad (default) and Mouse
  modes per device, switched in Settings, the zoom box and the right-click menu; Space, middle-button and Hand pan; 10% to 800%;
  `+ − 0`, Shift+1 and Shift+2; click, Shift-click, selection box (Alt: only what it holds), ⌘/Ctrl+A, select similar; layers
  (Venue, Tables, Room furniture, Flowers & décor) shown, hidden and locked per device, the venue locked until the Venue panel
  or a drawing tool is in use; one move, copy, paste, align, space, grid, turn or delete of a selection is one write and one undo
  step; arrow nudges (5 and 25 cm) and R are debounced into one write; Alt before dragging copies; snap guides (edges,
  centres, equal gaps with the gap in cm coloured by the walkway thresholds), Alt during a drag turns snapping off; cursors,
  hover outline, the hint line, the `?` sheet, the three first-visit tips; the designer's commands in ⌘K ("On the plan",
  offered only while the Room view is on screen).
- **Part B right-click:** Duplicate, Copy, Paste, Delete, Turn 90°, Select similar, Align and space, Open close-up, Apply
  style; on empty floor Paste here, Fit, Navigation, Lock or unlock a layer.
- **Part C:** a library click starts Stamp, which stays until Esc, V or another tool (a drop still places one and returns to
  Select); `S`; Favourites (starred in the Library, kept in the plan's settings, reordered by drag or by ‹ ›); Recent (last six,
  per device); keys 1 to 9; Shift+drag stamps along a line, every N cm (typed under the toolbar; default the width + 20), as one
  write and one undo step; Repeat in the inspector.
- **Server actions** (`src/server/actions/seating-items.ts`): `moveSeatingItems`, `duplicateSeatingItems`,
  `deleteSeatingItems`, `createSeatingFixtures`; `setSeatingFavourites` in `seating-workspace.ts`.
  **Pure, tested** (`src/lib/seating/canvas.ts`, `stamp.ts`, `designer-commands.ts`): wheel and pinch to zoom, `boxHits`,
  align, distribute, grid, `snapGuides`, select similar, line and repeat stops, favourites and recent.

**Not built, or built differently.**

- **Lock item** (A.5, Part B) needs `seating_fixtures.locked`, so it waits for `0062`. **Bring to front / Send to back**
  (Part B) has no column in §9 to keep an order in, so it is not built. **Add a note here** and the Note tool wait for Part E;
  **Add table décor** and table items for Part D.
- **"One transaction"** (§9): PostgREST has no multi-statement transaction. Each batch action checks the whole request first
  (this layout, not locked, every item in it) and refuses it whole; after that a failed later statement puts the earlier ones
  back (moves restore the positions they read, a paste deletes the copies it made, a delete re-creates the fixtures it took).
  A true single transaction would be an RPC, which could join `0062`.
- **Alt** means two things in the spec (A.5 copy, snap guides). Alt held **before** the drag starts copies; Alt pressed
  **during** a drag turns snapping off.
- **Favourites** are in the **event's plan settings** (the spec's "plan settings"), shared by everyone on the wedding, so a
  wedding with two events that seat has two sets. Dishes can't be starred until Part D makes them placeable.
- **Snap guides** use each table's body, not its chairs. The Stamp button sits after Measure on the toolbar.

**Verified in session 65.** Typecheck, unit tests (1897: 69 new for `canvas`, `stamp` and the palette's plan commands) and
`npm run build`. The SQL suite was **not** run (no migration). In **headless Chromium** (1440 px, the real `RoomView` and
`SeatingScreen` bundled with the server actions stubbed and sample data; touch through the DevTools protocol): wheel and
Ctrl+wheel in both modes (exactly 10.0% a notch, the page never moves, the point under the cursor stays put), the 10% and 800%
limits, box select through a whole-room area, one write for a 3-table and a 33-table drag, Space, Hand and middle pan, arrow,
R, ⌘D, ⌘C/⌘V, Alt-drag, Delete, ⌘A, select similar, align and grid, both right-click menus, the layer locks and the venue lock,
guides drawn and cleared, Alt during a drag, a 33-of-40-table drag holding 60 fps (software-rendered), two-finger pinch,
one-finger pan and tap by touch, focus mode (window size, 44 and 48 px, pin, overlay, `\`, the inspector, Esc and
← Seating), Stamp, favourites, 1 to 9, line stamping and Repeat.
**Not verified:** any server action against a database (all stubbed; `moveSeatingItems`, `duplicateSeatingItems`,
`deleteSeatingItems`, `createSeatingFixtures` and `setSeatingFavourites` are typechecked only, and the compensation paths
have never run); **a real trackpad or mouse** (pinch, two-finger scroll, a wheel's real deltas) and **Safari's gesture
events**, which headless Chromium can't produce; a real iPad; the shell's own `?` sheet not also opening beside the plan's.

### Session 66: what was built after that

Everything in "Not built" above except where listed under "Still not built" here. Migration **`0062_seating_canvas_round_two.sql`**
(written; **not applied to any database**), built with spec 60's Part A (see that spec's Build status for its rest).

- **Lock item, Bring to front, Send to back** (A.5, Part B): `seating_tables.locked`, `seating_fixtures.locked`, `seating_fixtures.z`.
  Right-click or the inspector's Lock item box; a padlock on a held item when hovered or picked; held items are skipped by the box,
  Select all and Select similar and can't be dragged, nudged, turned, resized, aligned or deleted (the batch function and the
  single-item actions refuse; **a direct SQL update still can**, there is no trigger). Furniture and décor draw in `z` order, ties by
  creation time, in the room, the print pack, the shared plan and every export; tables always draw above both.
- **One transaction** (§9): `seating_apply_items()` does a whole move, resize, copy, delete, stamp (fixtures and tables), lock,
  reorder or items write, replacing the check-then-write with a put-back. Stamping a row of tables is now atomic too.
- **Part D, table items** (D.1): `seating_tables.table_items` (positions as fractions of the table's length and width, so a resize
  keeps them). The **Décor** tab on the table inspector is the close-up: a palette (arrangement, candles, bud vase, lantern,
  sign, each menu dish, the couple's own items), click the tabletop to place (the tool stays in hand), drag, Alt-drag to copy,
  Delete, arrows; positions snap to the centre line, the ends and the points opposite each chair (Alt turns it off); zoom and pan
  follow the Room view's navigation. In the room, items are drawn to scale on each table from **100%** zoom. Print-pack close-ups
  and the florist and hire exports show them.
- **Part D, rules** (D.2): `seating_table_styles.item_rules` and `style_changes.item_rules` (a table's own list replaces its style's).
  Every N seats, N per table, at each end, at one end (head or foot), in the centre, at each seat, for every shape (`rulePositions`,
  tested per shape); on a long or banquet table N counts chairs along one side and each place serves both sides, on one-sided tables
  and rounds N counts chairs in order. The style editor has the rules; a table's Décor tab shows the places each makes and how many
  guests each serves, and **Make it by hand** turns them into ordinary items and gives the table an empty list of its own.
- **Part D, applying to many** (D.3): **Copy** and **Paste table décor** (right-click, or the Décor tab) keep relative places; one
  transaction for many tables. Apply style (already there) is how rules reach many tables.
- **Part E, notes**: the **Note** tool (N, or right-click **Add a note here**); a note on a table keeps an offset and moves with it;
  for everyone or one or more vendors, the pin names them; drawn on the canvas, the Show menu's Notes layer is shown, hidden and
  lockable; numbered on the plan with the text in a list beside it in the shared plan and every export; a print page takes
  `?vendor=<id>` for one supplier's. Stored in the space's drawing (`notes`), so no column.

**Still not built, or built differently.**

- **Dishes and platters** (D.2): the number a rule places does **not** yet become the platter suggestion for that dish and table, and
  there is no "Check platters" flag when a typed count differs. Placed and ruled items are **not** yet counted into the florist and
  hire totals as suggestions (`computeItems` is untouched).
- **Add to these tables** (D.3), **box selection** in the close-up and **Stamp from the Library** into the close-up are not built:
  the close-up has its own palette, and items are picked by click and Shift-click.
- **The Library's Favourites row for dishes**: dishes are placeable now, but the Library doesn't star them.
- **Per-vendor exports:** the four exports are by role, not by vendor, so a note shows in all of them with who it is for; one
  supplier's view is `?vendor=` on the print address, with no picker for it in the Export dialog.
- A note whose table was deleted is hidden (kept in the drawing, drawn nowhere). A note is held still by the room lock (it is in
  the drawing); table items too (`locked` and `table_items` are in the lock's room part).
- Banquet runs, ceremony rows, half-moons and serpentines aren't resized by dragging (see spec 60).

