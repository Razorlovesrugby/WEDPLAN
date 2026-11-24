# Feature spec: The venue designer: draw the room, style the tables, seat the guests

**Status: answered, partly built** (see **Build status** at the end). Every
question answered 2026-11-24 (40, 8 follow-ups and 3 last ones; see
**Answered**).

**Mockups:** the private claude.ai design canvas "Venue designer mockups"
(<https://claude.ai/artifact/9wUV92RjgVdvH4BHQcbpUk>), five boards: (1) the
room designer, (2) table style, (3) drawing the venue, (4) the caterer export,
(5) a family-style table. The boards use sample data and predate the answers:
they show one space per event, no space or layout tabs, and a units choice that
is now metric only.

**Depends on:** spec 33 (the seating plan, Room view, fixtures, venue image and
calibration, print pack, "your table" on the site), spec 53 (undo/redo through
whole-plan state, versions, Show menu, Colour by, the day-link Seating module),
spec 51 (seating on or off per event), spec 55 (the master reads seating),
spec 6.1 (manual budget quantities), spec 8 (vendors), spec 39 (planner
access), spec 32 (audit triggers), spec 45 (no-drag alternatives), spec 46
(shortcuts). All built.

## Answered — 2026-11-24

Every question was put one at a time and answered by the planner. In one line
each, by the old numbering:

Q1 replaces the Room view · Q2 **several spaces per event**, a guest holds one
seat per event across them · Q3 **alternative layouts in this spec**, copied
with their seating · Q4 ceremony seated per guest · Q5 phones view and seat
only · Q6 guests see nothing new · Q7 initials, names on zoom · Q8 colour-by is
the plan's · Q9 **structured dietary needs**, a standard tag list plus Other,
each an allergy or a preference · Q10 ask before freeing a declined guest's
seat · Q11 no-reply guests look like everyone else · Q12 unnamed plus-ones
seated by hand · Q13 a kids' table style and kids' meals · Q14 adds banquet
runs, U and T, oval, half-moon, serpentine · Q15 the couple can add their own
décor items · Q16 room décor carries quantity and supplier · Q17 the first
screen offers upload-and-trace, upload only, and draw from scratch equally ·
Q18 PDF accepted · Q19 metric only · Q20 curved walls · Q21 marquee templates
(the couple enters the marquee), ground features, outdoor areas · Q22 every
place drawn · Q23 styles are wedding-wide · Q24 per-table changes on top of a
style · Q25 the app suggests a count and the couple types the final number ·
Q26 quantities only, no prices · Q27 totals link to budget lines and vendors ·
Q28 any collaborator locks and unlocks · Q29 the lock freezes the room only ·
Q30 exports for the caterer, venue, florist and hire company · Q31 a view-only
link showing everything, optional passcode and expiry · Q32 A4 and A3, portrait
and landscape, PNG, and a large entrance board · Q33 service style per event ·
Q34 and per course · Q35 the couple chooses per child, default a plated kids'
meal · Q36 RSVP questions stay as the couple sets them · Q37 nobody has their
own plate by default · Q38 no dish-against-allergy warnings · Q39 "serves" set
per dish from the caterer · Q40 the shared menu lives on the event's plan ·
thresholds (walkways, table room, décor sizes) editable per plan · long tables
get two of each dish from a length the couple sets · a linked budget line
follows the final number automatically · existing free-text dietary notes stay
as they are · the share link always shows dietary needs.

Rejected: live co-editing with presence; floor-plan templates shared across
weddings; 3D views; auto-seating (spec 53); prices on style items.

## 1. What was asked

1. Make the seating plan far more visual.
2. Draw the venue itself and plan the space, not only the seating.
3. Show where plates and flowers go.
4. Manage planning and seating in one place.
5. The look and flow of the floor-plan tool the planner shared: the room, the
   furniture and the guest list on one canvas.
6. Family-style service: shared dishes per table, not a plate or meal choice per
   person.

## 2. Story

> **As the couple or their planner**, **I want** to draw the real rooms, dress
> them and their tables, decide how food is served, and seat everyone on the
> same picture, **so that** the venue, florist, hire company, caterer and we all
> work from one plan that is right to the centimetre and to the guest.

## 3. What the leading tools do (conclusion only)

The best floor-plan tools put a to-scale venue drawing, a furniture library and
the RSVP-linked guest list on one canvas, with chairs coloured by meal, and
their strongest output is a caterer PDF led by that coloured plan. None lays
out place settings or totals the florist's and hire company's quantities, and
none handles shared service; this spec does all three.

## 4. Words used here

- **Event:** as today (spec 51). Seating is on or off per event.
- **Layout:** one complete arrangement of an event: its spaces, furniture and
  seating. Each event with seating has exactly one **live** layout and any
  number of **draft** layouts. Everything outside the designer (the site's
  "your table", day links, the master, exports, share links) reads only the
  live layout.
- **Space:** one room or area within a layout ("Grand Room", "Terrace"), with
  its own venue drawing, walls and furniture. A layout has one or more spaces.
- **Table style:** what is on a table's places and in its centre. Wedding-wide.
- **Service style:** how a course is served: plated, shared (family style),
  buffet, or roaming (canapés).

## 5. Part A — One visual canvas

The seating screen keeps its Tables view (spec 33 §A). Its Room view becomes
this designer (board 1). Below tablet width the designer views the room and
seats people only: no drawing, no furniture or décor changes; panels become
sheets.

### A.1 Layout of the screen

- **Top bar:** back to Seating; the event's name, date and venue; the tool bar
  (Select, Walls, Curved wall, Area, Text, Measure, Undo, Redo); saved state;
  **Lock room** (Part D); **Share** (Part E.3); **Export** (Part E).
- **Event tabs:** one per event with seating on, in event order.
- **Layout switcher:** under the event tabs, the live layout and its drafts
  (Part G); "Try a layout" makes a draft.
- **Space tabs:** the spaces of the shown layout, in order, with "+ Space"; on
  the right, coming / seated / declined-in-a-seat counts for the whole event.
- **Left panel tabs:** Venue (Part B), Library (A.3), Guests (the tray: unseated
  people across the event's spaces, search, select several, filters; spec 33
  §A.2, spec 53 §D).
- **Right panel:** the selection. A table: seats in order, each with chair
  number, name, the colour-by answer, dietary tags, and an empty chair's "Click
  to seat someone"; tabs Seats, Style, Notes. Furniture or décor: name, size,
  rotation, label, and for décor its quantity and supplier (A.3). Nothing
  selected: the space's summary and unseated people.
- **Canvas:** dot grid, the space, a **Show** bar (A.2), a legend, zoom − / % /
  + and Fit. A selected table gets a floating bar: name, style, Rotate,
  Duplicate.

### A.2 What the canvas shows

- **Chairs** are rounded tags the size of a real chair at the space's scale,
  showing initials at 100% zoom and first names from 150%; full names are in the
  right panel and on hover. A chair's colour is the plan's **Colour chairs by**
  choice, one setting per event plan shared by every collaborator and the
  exports: any RSVP question spec 33 Q18 allows, Fit (spec 53 §G), or Dietary
  needs. Empty chairs are white with a dashed outline.
- **Dietary marks:** a red dot for a guest with any allergy (Part H), a grey dot
  for preferences only.
- **Declined in a seat:** a guest whose reply for the event is now No, still in
  a chair, has a dashed orange outline, and the right panel asks "*Name* can't
  come any more. Free seat *N*?" with **Free the seat** and **Keep for now**.
  The seat is never freed without that click. Keep for now hides the card for
  that guest until their reply changes again.
- Guests who haven't replied are drawn like everyone else.
- **Plus-ones** are guest records (`is_plus_one`); an unnamed one appears in the
  tray as "*Host*'s +1" and is seated by hand like anyone else.
- **Children** show spec 53's highchair marker where set; nothing else on the
  chair.
- **Show** toggles, remembered per device: Venue (walls, doors, windows, the
  uploaded drawing), Furniture, Flowers & décor, Names, Walkway guides. Exports
  have their own choices.
- **Legend:** each colour in use with its label and count, then Declined, and
  the dietary dots.
- Spec 53's gaps close here: Show settings, colour-by and blocked chairs are
  drawn in the designer and the floor-plan prints.

### A.3 Library

Three groups of to-scale tiles; drag one onto the space, or click it then click
the spot (spec 45). Search filters all groups.

| Group | Items |
| --- | --- |
| Tables | Round, Long, Square, Oval, Half-moon, Serpentine, **Banquet run** (long pieces joined straight, or into a U or T), Sweetheart (two to four seats on one side), Ceremony rows (rows with an aisle), Cocktail (high table, no seats by default) |
| Room | Dance floor, Stage, Bar, Buffet, DJ, Band, Cake, Gifts, Photo booth, Lounge, Kids' area |
| Flowers & décor | Floral arch, Garland, Aisle flowers, Candles, Plant, Sign, Lantern, Drape, and the couple's own items (below) |
| Outdoors | Marquee (from the couple's marquee templates, B.5), Tree, Path, Pool, Garden bed, Slope |

- **Default sizes** come from `src/lib/seating/geometry.ts` and can be changed
  per plan in the plan's settings (Part I); any placed item can be resized.
- **Banquet run:** one table made of straight pieces (each a length and an
  angle at the joint: straight, or 90° for a U or T); seated as one table,
  chairs numbered continuously along it.
- **Ceremony rows:** one table record: capacity, chairs per row and an aisle
  width; drawn as rows either side of the aisle; chairs numbered by row from
  the front ("Row 2, seat 3") and seated per guest.
- **Couple's own décor:** "+ Add item" with a name, a shape (rectangle or
  round), a default size, a colour, and optionally a supplier; saved
  wedding-wide and shown in the library like the built-in items.
- **Every décor item placed** has a **quantity** (default 1: "aisle flowers ×
  12" can be one placed item) and an optional **supplier** (a vendor, spec 8).
  These feed the florist and hire totals (C.3).

## 6. Part B — Drawing the venue

Board 3. The Venue tab and the Walls, Curved wall, Area, Text and Measure tools.
Every length is shown in metres and centimetres; storage is centimetres.

### B.1 Starting a space

An empty space offers three equal choices: **Upload the venue's plan and trace
it**, **Use the venue's plan as it is**, **Draw from measurements**. Each leads
into the steps it needs (upload, set scale, trace walls, doors and windows),
shown as a strip on the canvas; any step can be skipped. A space with no drawing
and no walls is a rectangle of its width and depth.

### B.2 The venue's drawing

Spec 33 §C.3's image upload, per space, plus:

- **PDF:** a PDF is accepted; the person picks a page, rendered in the browser
  (`pdfjs-dist`, client-side only) at 150 dpi, longest side ≤ 6000 px, stored as
  a PNG the way spec 33 stores images. The PDF itself is not kept.
- **Fade:** an opacity slider, stored on the space.
- **Scale:** spec 33's two-point calibration, shown in words ("Set from the north
  wall, 24.0 m") with Redo.

### B.3 Walls

- **Walls** draws a chain of straight walls: click to add a corner, Shift keeps
  0/45/90°, clicking the first corner closes the room, double-click or Enter
  ends an open chain, Esc stops. The wall being drawn shows its length and
  angle.
- **Curved wall** draws an arc: click the start, the end, then drag the bulge;
  its length and radius are shown. A straight wall can be bent into an arc
  later, and an arc straightened.
- Corners snap to the grid (spec 33 §C.1's toggle) and to existing corners
  within 20 cm.
- A selected wall can be moved, have a corner dragged, be split, or have its
  thickness set (default 20 cm). Delete removes it.
- With walls drawn, the space's width and depth become the walls' bounding box.

### B.4 Wall parts and markers

From the Venue tab: Door, Double door, Window, Opening (these snap onto a wall,
straight or curved, and slide along it; a door has a width, default 90 cm,
double 180 cm, an opening side and a hinge end), and Column, Stairs, Power
point, Fire exit, Toilets (free-standing markers).

### B.5 Marquees and outdoor spaces

- **Marquee templates** are entered by the couple: a name, width, length, pole
  spacing along the sides and down the middle (if any), and whether the ends
  are square or rounded. Saved wedding-wide, reused across spaces. A placed
  marquee draws its outline, poles and (for rounded ends) curved ends; it can be
  the space's walls.
- **Ground features** (tree, path, pool, garden bed, slope with a direction
  arrow) are library items (A.3).
- **Areas** (B.6) can be marked outdoor and are drawn hatched.

### B.6 Areas, text and measuring

- **Area:** a rectangle or polygon with a name and a tint; its size is shown.
- **Text:** a label anywhere, 12–48 px at 100% zoom.
- **Measure:** two clicks show a distance; Shift keeps it straight. A
  measurement can be **kept** as a dimension line, or is gone at the next click.
  Measured between two tables' edges it is coloured by the plan's walkway
  thresholds (Part I).
- **Walkway guides** (spec 33's clearance rings) use the same thresholds.

## 7. Part C — Table styles: place settings and flowers

Board 2.

### C.1 What a style is

A named, wedding-wide description of what is on a table:

- **Each place:** charger, dinner plate, side plate, napkin (colour or fold
  note), cutlery (number of pieces), glasses (number), name card, menu card;
  each on or off with a short note.
- **Centre:** arrangement (note), candles (count), tablecloth (note), runner
  (long and banquet tables), and up to five items the couple names.
- Each item may name its **supplier** (a vendor) and a **budget line** (C.4).

A table has at most one style. Tables share styles: changing a style changes
every table using it. A **per-table change** adds, removes or alters items on
one table on top of its style; the table shows "Changed from *style*", with
"Reset to style". A starter style named **Kids** (plastic cups, no charger, an
activity pack as a named item) is offered when the first child is seated; it is
an ordinary style the couple can edit or delete.

### C.2 Close-up

Opening a table's Style tab, or double-clicking it, shows board 2: the table top
down and to scale, the cloth, every place drawn from its style and any
per-table change (cutlery, glasses and side plate on the correct sides), the
centre items (or the shared dishes, F.4), and each guest's name tag outside
their chair. Previous and next step through the space's tables. The left panel
edits the style (or this table's changes); the right panel shows totals (C.3).

In the room, a styled table shows a small glyph of its centre; places are drawn
only in the close-up.

### C.3 What it adds up to

For the live layout, one list per supplier and one overall, each row an item:

- **Suggested:** the app's count, shown two ways: by chairs (every chair gets
  a setting) and by seated guests.
- **Final:** the number the couple types. Until typed it is empty and the row
  says "Not set". A final number stays when seating changes; the row is flagged
  "Seating changed since you set this" when either suggestion moves.

Table items (from styles and per-table changes), room décor (A.3, with its
quantities), and serving utensils for shared courses (two per platter, F.3) are
all listed. Copy, CSV (a `seating-items` kind on `/api/export/[kind]`), and the
florist and hire exports (E.2) use the final numbers, falling back to "Not set".

`src/lib/seating/items.ts` (pure, tested) computes the suggestions.

### C.4 Budget lines and vendors

- An item with a supplier appears on that vendor's page (spec 8) as "From the
  seating plan: *item*, *final number*".
- An item can be linked to a budget line with a manual quantity (spec 6.1). How
  Whenever the item's final number changes, the line's quantity changes to
  match, recorded in the line's history (spec 32). Clearing the final number
  leaves the line's quantity as it was. Unlinking stops it following.

## 8. Part D — Locking the room

- **Lock room** freezes the shown layout's spaces: walls, drawing, areas,
  furniture and décor can't be moved, resized, added or deleted, and the
  drawing tools hide. Seating, freeing seats, table styles and final counts
  still work.
- Any collaborator can lock or unlock; the plan shows who locked it and when.
- The server actions enforce it: a move on a locked layout returns "The room is
  locked. Unlock it to move things."

## 9. Part E — Exports and sharing

Export opens a dialog: which **export**, paper (**A4 or A3**, **portrait or
landscape**), and which space(s). Every export is a server-rendered print view
in spec 33 §G's print pack. Export → Image downloads the shown space as a PNG at
1×, 2× or 4×.

### E.1 Caterer (board 4)

Colour by is the plan's choice.

1. **Floor plan** per space: every chair numbered and coloured; allergy chairs
   outlined red; the key with counts; dietary needs by seat ("4.2 Shellfish,
   allergy, James Ngata"); totals (guests, tables, highchairs).
2. **Kitchen summary:** per course, as Part F serves it: plated counts per
   answer; shared platters per dish per table; buffet and roaming head counts;
   own plates and kids' meals by table; every dietary need with table and seat.
3. **Guests A to Z** with space, table and seat.
4. **One page per table:** the table drawn with numbered chairs, platters and
   own plates marked; then seats in order with answers and dietary needs.

### E.2 Venue, florist, hire

- **Venue:** each space with walls, doors, windows, markers, areas, furniture
  and décor, kept dimensions and a scale bar; table labels and chair counts; no
  guest names, meals or dietary needs.
- **Florist:** each space with décor and table centres marked and numbered;
  then the florist's item list (C.3, final numbers) with where each goes ("Table
  4 centre", "Arch, entrance").
- **Hire:** each space with furniture marked; then furniture counts by type and
  size, and the hire supplier's tableware list (C.3).

### E.3 Share link

**Share** creates a view-only link to the event's live layout. Whoever has it
sees everything the designer shows (every space, names, colour-by answers,
dietary needs and allergies, always) and can open any of the exports, but
changes nothing. The Share dialog says so: "Anyone with this link sees guests'
names and dietary needs." The privacy notice (`/privacy`) gains a line that a
couple may share guests' names and dietary needs with their suppliers by
link. Options:
a passcode (4–12 characters) and an expiry date. Links can be listed, copied and
revoked. The page is `/p/[token]`, has no account, reads through a security
definer function that checks the token, passcode and expiry, and is marked
`noindex`. It shows the live layout as it is when opened.

### E.4 Entrance board

Spec 33's `names` view gains **A2, A1 and A0**, portrait or landscape, in the
site's fonts and colours, listing guests A to Z with their table, grouped by
space when the event has more than one.

## 10. Part F — How food is served

Board 5.

### F.1 Service style per event and per course

Each event plan has a **default service style**: plated, shared (family style),
buffet, or roaming. Each **course** in the event's menu (F.2) takes the default
or its own style, so "canapés roaming, mains shared, dessert plated" is one
event.

| Course style | What a guest chooses | Middle of the table | Kitchen summary |
| --- | --- | --- | --- |
| Plated | A meal answer, if the couple asks one on the RSVP (spec 33 Q18) | The table style's centre | Counts per answer |
| Shared | Nothing | Shared dishes; the style's centre around them | Platters per dish per table |
| Buffet | Nothing | The table style's centre | Head count per table |
| Roaming | Nothing | — | Head count for the event |

RSVP questions are never changed by a service style; the couple keeps or
removes meal questions themselves. Changing a style never deletes RSVP answers
or menu dishes.

### F.2 The menu

Each event plan holds its menu: courses (named by the couple, ordered), each
with a service style (F.1) and dishes. A dish has a name, optional dietary tags
from Part H's list (for display only; nothing is checked against guests), a
vessel (platter, bowl or board) for the drawing, and for shared courses
**serves**: how many people one vessel feeds, entered per dish from the
caterer's numbers, required before platters are counted. Up to 12 courses and
40 dishes.

### F.3 Platters per table

For each shared dish and table: **platters = ceiling(sharing guests ÷ serves)**,
where sharing guests are the table's seated guests without their own plate (F.5).
If the couple sets a **long-table length** in the plan's settings (Part I), long
and banquet tables at least that long get at least two of each dish; unset,
no minimum applies. Any table's count for a dish can be typed by hand; a typed
count stays until that table's sharing guests change, when it is cleared and
the table is flagged "Check platters". Totals per dish. Serving utensils: two per
platter, into C.3. Computed in `src/lib/seating/service.ts`, pure and tested.

### F.4 On the table

A shared course draws its dishes down the middle of each table in the close-up
and as small glyphs in the room. Using the plan's thresholds (Part I), a table
too narrow for shared dishes is flagged "Tight for shared dishes", and a style
centre marked tall is flagged "Tall centrepieces get in the way of passing
dishes". Flags never block.

### F.5 Own plates and kids' meals

- At a shared course, **nobody has their own plate by default**. The couple ticks
  **Own plate** on a seat; the guest is left out of that course's platters and
  listed with their dietary needs in the kitchen summary.
- **Children** (`age_band` child or infant) default to a **plated kids' meal** at
  every shared, buffet or roaming course; the couple can switch any child to
  sharing per course. Kids' meals are counted separately from own plates.
- In the close-up an own plate has an orange ring and a kids' meal a purple
  ring; the right panel lists both.

## 11. Part G — Layouts: trying alternatives

- **Try a layout** copies the shown layout (spaces, drawings, walls, furniture,
  décor, table styles' assignments and per-table changes, and seating) into a
  new **draft** with a name ("Long tables"). Drafts are edited exactly like the
  live layout.
- Seating in a draft is the draft's own: moving a guest in a draft never moves
  them in the live layout. A guest holds at most one seat per layout (across
  its spaces).
- **Make this the live layout** (with a confirm) swaps it in, in one
  transaction: the former live layout becomes a draft named "*name* (before
  *date*)", so the swap can be reversed the same way.
- Guests who joined or declined since the draft was copied: on swap, the app
  lists anyone coming who has no seat in the draft and anyone seated in it who
  has since declined, before confirming.
- Drafts can be renamed and deleted (a deleted draft goes to History for 30
  days). The live layout can't be deleted.
- Undo and History (spec 53) work per layout.

## 12. Part H — Dietary needs, structured

The guest record gains structured dietary needs; `guests.dietary` stays as the
free-text detail beside them.

- **Tags:** vegetarian, vegan, gluten free, dairy free, nut, peanut, shellfish,
  fish, egg, soy, sesame, halal, kosher, and **Other** (a short text). Each tag a
  guest has is marked **allergy** or **preference**.
- Edited on the guest, in the guest table (spec 47), and in the seating right
  panel. On the RSVP form the dietary question becomes the tag list with the
  allergy/preference choice and the existing free-text box; what the RSVP
  asks otherwise is unchanged.
- Shown as the dots in A.2, in the exports, and in the day-link Seating module
  (spec 53 Part I).
- Existing free-text notes are left exactly as they are, untagged, until
  someone edits that guest's dietary needs. Nothing reads the text into tags.

## 13. Part I — Plan settings

One settings sheet per event plan. Each value starts from the default shown and
can be changed per plan:

| Setting | Starts at |
| --- | --- |
| Walkway: comfortable / tight / too tight | ≥ 120 cm / 90–119 cm / < 90 cm |
| Tight for shared dishes | long or banquet narrower than 80 cm; round under 150 cm across |
| Tall centrepiece | over 30 cm |
| Long-table length for two of each dish | not set (no minimum) |
| Default sizes of library items | the `geometry.ts` defaults |

## 14. Open questions

None.

## 15. Data — migrations `0055` to `0058`

Next free numbers at the time of writing; the build takes whatever is next.
**Live data:** every event with a seating plan today has tables, fixtures and
seats. Migration `0056` must move them into a layout and space without losing
any, and is tested against a database seeded with spec 33/53 data before it is
applied.

**`0055_venue_designer_enums.sql`** (enum values commit before use; spec 6.1's
`55P04` fix):

- `seating_table_shape` gains `sweetheart`, `rows`, `oval`, `half_moon`,
  `serpentine`, `banquet`.
- `seating_fixture_kind` gains `lounge`, `kids_area`, `floral_arch`, `garland`,
  `aisle_flowers`, `candles`, `plant`, `sign`, `lantern`, `drape`, `marquee`,
  `tree`, `path`, `pool`, `garden_bed`, `slope`, `custom`.

**`0056_seating_layouts_and_spaces.sql`:**

- **`seating_layouts`**: `id`, `wedding_id`, `event_id`, `name`, `is_live`,
  `locked_at`, `locked_by`, `deleted_at`, timestamps; a partial unique index so
  each event has exactly one live, undeleted layout.
- **`seating_spaces`**: `id`, `wedding_id`, `layout_id`, `name`, `sort_order`,
  and the room columns moving off `seating_plans`: width, depth, background
  path and size, `calibrated`; plus `background_opacity`, `drawing jsonb`
  (walls, arcs, openings, markers, areas, labels, kept dimensions; checked by
  `src/lib/seating/drawing.ts` and a 256 KB size check).
- `seating_tables` and `seating_fixtures` gain `space_id` and `layout_id` (not
  null after backfill, with composite foreign keys so an item lies in a space
  of its own layout and event); `seat_assignments` gains `layout_id`, kept
  consistent with its table's, and a unique `(guest_id, layout_id)`. The
  `(guest_id, event_id)` primary key stays until drafts exist; the drafts
  migration replaces it.
- **Triggers (as built):** BEFORE INSERT triggers fill `space_id` and
  `layout_id` (the event's live layout and its first space) and a seat's
  `layout_id`, so actions that know only `event_id` work unchanged;
  `seating_live_layout(event)` makes the live layout and its space on demand.
  `seating_plans` stays authoritative for the room size and background, and a
  trigger copies them to the event's first space; the drafts-era migration
  drops it.
- **Backfill:** for each existing `seating_plans` row, one live layout named
  "Main" and one space named after the event, copying the room columns; every
  table, fixture and seat gets those ids. The old room columns on
  `seating_plans` stay, unused, until a later migration drops them after live
  is checked.
- **Still to do in the drafts migration:** every read outside the designer
  filters to the live layout: the site's "your table" (`seating-public.ts`),
  day links (`seating-module.ts`), the master (`day-master.ts`), print and CSV;
  `seating_state()` and `restore_seating_state()` take a layout id. Until then
  an event has one layout, so nothing needs the filter.

**`0057_venue_designer.sql`:**

- `seating_plans` (still one per event) gains the event-level settings:
  `colour_by text` (`parseColourBy`'s form: `side`, `fit`, `dietary`, `tag:<id>`,
  `q:<id>`), `service_style`, `menu jsonb` (F.2, checked by `service.ts`, 64 KB),
  `settings jsonb` (Part I).
- `seating_tables` gains `rows_count`, `aisle_cm` (rows only), `segments jsonb`
  (banquet only), `style_id`, `style_changes jsonb`, `platter_counts jsonb`.
- `seating_fixtures` gains `quantity integer not null default 1`, `vendor_id`,
  `custom_item_id`, `marquee_id`.
- **`seating_table_styles`** (wedding-wide; `place`, `centre`, item suppliers
  and budget links as checked jsonb; soft-deleted), **`seating_custom_items`**
  (the couple's décor), **`seating_marquees`** (templates),
  **`seating_item_counts`** (the final number per layout and item, plus the
  suggestions it was typed against, the supplier and the budget line),
  **`seating_share_links`** (event, token hash, passcode hash, expiry,
  revoked; not audited, because it holds credential hashes). Each has
  `wedding_id`, RLS by `is_collaborator`, and planner access.
- **State version 2:** `seating_state()` adds the spaces (with drawings), the
  plan's colour-by, service style, menu and settings, and every column above;
  `restore_seating_state()` accepts versions 1 and 2, puts spaces back, and drops
  a style, vendor or space that is gone instead of failing.
- `seat_assignments` gains `decline_kept_at`, `own_plate jsonb` (per course id),
  `kids_meal jsonb` (per course id, overriding the child default).

**`0058_guest_dietary_needs.sql`:**

- **`guest_dietary_needs`**: `wedding_id`, `guest_id`, `tag` (checked against
  Part H's list or `other`), `other_text`, `is_allergy`, unique per guest and
  tag; RLS; audit; guest data, so it follows the guest's soft delete.
- The RSVP's write path (spec 49's checked upsert pattern) saves tags; the
  `onConflict` target is tested in the SQL suite.

SQL suite: tenancy for every new table; the backfill against seeded spec 33/53
data (counts before and after match); one live layout per event; one seat per
guest per layout; the swap; v1 and v2 restore; share-link function refusing a
wrong passcode, an expired and a revoked link; the dietary upsert.

## 16. Build order (each step committed separately)

1. `0055`, `0056` with the backfill and every live-layout read; SQL suite. The
   app must behave exactly as before after this step.
2. `0057`, `0058`; `drawing.ts`, `items.ts`, `service.ts`, geometry for the new
   shapes; unit tests.
3. **Part A** canvas, chairs, marks, library (new shapes, décor quantities,
   couple's items), space tabs.
4. **Part B** drawing: upload choices, PDF, walls and curves, wall parts,
   marquees, areas, text, measure.
5. **Part H** structured dietary needs (guest, table, RSVP).
6. **Part C** styles, per-table changes, close-up, items and final numbers,
   vendor and budget links.
7. **Part F** menu, course styles, platters, own plates, kids' meals.
8. **Part G** layouts.
9. **Part D** lock; **Part I** settings.
10. **Part E** exports, entrance board, PNG, share link and its `/privacy` line.

## 17. Verification, honestly

A build says which it ran: typecheck; unit tests (drawing, items, service,
geometry, state v1/v2); the SQL suite including the backfill; `npm run build`;
the designer, close-up, each export and the share page rendered in headless
Chromium with sample data at 1440 px and 1024 px, and the designer at 390 px.
A real iPad, a printer, and the backfill on a copy of live data are separate
and must be named if not done.

## 18. Risks

- **The layout/space move is the largest change to seating since spec 33.** It
  touches every seating read. Step 1 ships alone and must change nothing a
  person can see.
- **Share links expose guest names and dietary needs** outside the app, by
  the couple's choice; revoke and expiry are the controls.
- **Canvas performance** at 200 guests with décor, walls and curves: chairs draw
  as one group per table; names become dots below 60% zoom.
- **Undo payload size:** a layout with several traced spaces; the 256 KB check
  per space bounds it.
- **Scope:** ten build steps. Each step is usable on its own, in the order
  above.

## Build status

Built on branch `claude/visual-seating-plan-gkbppo`, migrations `0055` to
`0058`. Typechecked, unit-tested (1696), SQL-suite tested (990 assertions, 68
of them new), single-transaction migration check passed, and `npm run build`
passes. **Never opened in a browser or run on live; nothing is applied to
live.** The table close-up was rendered for six shapes in headless Chromium;
no other screen was.

### Built

- **Data (§15):** all four migrations, with the backfill tested on legacy
  data (nothing lost, no audit rows, no `updated_at` changes), state version 2
  with version 1 still restoring, and tests for tenancy, the shape rules, the
  restore round trip and the dietary rules.
- **A:** chairs show initials (first names from 150% zoom, bare dots below
  60%), a red dot for a dietary note and a dashed orange outline for a guest
  who can't come; Colour by gains Dietary needs and is the plan's, saved
  through an undoable step; sweetheart, oval, half-moon and serpentine tables
  can be added and drawn as themselves in the room and the table drawer.
- **C:** styles (create, edit, delete, per table or for all), the close-up in
  the table drawer for every shape but ceremony rows, totals by chairs and by
  guests, typed final numbers with the "Seating changed since you set this"
  flag, CSV.
- **Libraries, tested, no screen yet:** `drawing.ts` (B), `service.ts` (F),
  `plan-settings.ts` (I), and geometry for ceremony rows and banquet runs.

### Differences from the spec

- Item totals are by item type across all styles (`place:charger`), with the
  styles' notes listed under each, not one row per style.
- The CSV is built in the browser, not a `seating-items` kind on
  `/api/export/[kind]`; no supplier or budget line is shown yet.
- The shape picker offers eight shapes; ceremony rows and banquet runs need
  their own creation screens.
- Every seat still has its `(guest, event)` key and no read filters by layout,
  because no draft can exist yet.
- Dietary dots use the free-text note; no screen edits the structured tags.

### Not built

| Part | What is missing |
| --- | --- |
| A | Event, layout and space tabs; the Library, Venue and Guests panels and the new right panel; the Show layers; the in-canvas legend; the "Free the seat?" card; unnamed plus-ones' label; ceremony rows, banquet runs, décor and marquee placement, the couple's own décor |
| B | Every drawing tool and screen: the starting choices, PDF upload, fade, walls and curves, doors and windows, marquees, areas, text, measure, kept dimensions |
| C | The per-table changes editor; suppliers and budget-line following; vendor pages; the kids' starter style |
| D | The lock: no action, server check or button (the columns exist) |
| E | The caterer, venue, florist and hire exports; PNG; the share link and its page and `/privacy` line; the entrance board sizes |
| F | The menu editor, service-style switch, platter screen, own-plate and kids' meal controls, room-on-the-table hints, the kitchen summary |
| G | Draft layouts: making, switching, swapping, deleting; the seat key change and layout filtering on every read |
| H | The dietary editor (guest, guest table, seating panel); the RSVP change; dots from tags |
| I | The settings sheet; walkway colours from the thresholds |

### Order for the rest

The drafts migration first (drop the `(guest, event)` seat key, filter every
read to the live layout, drop the room trigger once the room lives on spaces),
then A and B (one canvas, then drawing), F and H, then E and D.
