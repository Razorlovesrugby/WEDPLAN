# Feature spec: The venue designer: draw the room, style the tables, seat the guests

**Status: proposed, not built.** Every question in §11 has a recommendation and
no answer yet. Nothing is built until the planner says to build it (see
`docs/specs/README.md`).

**Mockups:** the private claude.ai design canvas "Venue designer mockups"
(<https://claude.ai/artifact/9wUV92RjgVdvH4BHQcbpUk>), four boards: (1) the
room designer, (2) table style, (3) drawing the venue, (4) the caterer export.
The boards use sample data; the numbers on them are illustrative.

**Depends on:** spec 33 (the seating plan, its Room view, fixtures, venue image
and calibration, print pack), spec 53 (undo/redo through whole-plan state,
versions, Show menu, Colour by), spec 51 (seating on or off per event), spec 8
(vendors, for who supplies a table item), spec 32 (audit triggers), spec 45
(no-drag alternatives), spec 46 (shortcuts). All built.

## 1. What was asked

1. Make the seating plan far more visual.
2. Draw out the venue itself and plan the space, not only the seating.
3. Show where plates and flowers go.
4. Manage planning and seating in one place.
5. The look and flow of the floor-plan tool the planner shared, which puts
   the room, the furniture and the guest list on one canvas.

## 2. Story

> **As the couple or their planner**, **I want** to draw the real room, dress it
> and its tables, and seat everyone on the same picture, **so that** the venue,
> the florist, the caterer and we all work from one plan that is right to the
> centimetre and to the guest.

## 3. What the leading tools do (conclusion only)

The best floor-plan tools put three things on one canvas: a to-scale drawing of
the venue (uploaded and calibrated, or drawn), a library of furniture placed on
it, and the RSVP-linked guest list dragged onto chairs coloured by meal. Their
strongest output is a caterer PDF that starts with that coloured floor plan.
None of them lays out a table's place settings or totals the florist's and hire
company's quantities; this spec does both (Part C).

## 4. The whole thing, in one paragraph

The seating screen's Room view becomes the **venue designer**: one canvas with a
tool bar (select, walls, area, text, measure, undo, redo), a left panel with
three tabs (**Venue**, **Library**, **Guests**), and a right panel for whatever
is selected. Every chair shows who sits there, coloured by the chosen meal
question, with a dot for a dietary note and a dashed outline for someone who
has since declined. The room can be traced over the venue's own drawing or
drawn from nothing, with doors, windows and labelled areas. Rooms, tables and
décor (arches, garlands, aisle flowers, candles, plants, lounges) are placed
from a library, all to scale. A **table style** says what is on every place and
in the middle of the table; tables share a style, a close-up shows it, and the
plan adds up how many centrepieces, candles, plates and glasses it needs. A
**caterer export** opens with the coloured floor plan. The room can be locked
when it is final, while seating stays open.

## 5. Part A — One visual canvas

The Tables view (spec 33 §A) stays as it is. The Room view becomes this layout,
board 1. Below tablet width the Room view keeps spec 33 §C.4's behaviour; the
panels become sheets.

### A.1 Layout

- **Top bar:** back to Seating; the event's name, date and venue; the tool bar
  (Select, Walls, Area, Text, Measure, then Undo and Redo from spec 53); Saved
  state; **Lock room** (Part D); Share; **Export** (Part E).
- **Plan tabs:** one tab per event with seating on (spec 51), in event order, so
  the ceremony and the reception are a click apart; on the right, coming /
  seated / declined-in-a-seat counts.
- **Left panel tabs:** Venue (Part B), Library (A.3), Guests (the existing tray:
  unseated people, search, select several, filters, from spec 33 §A.2 and spec
  53 §D).
- **Right panel:** the selection. A table: its seats in order, each with chair
  number, name, meal answer, dietary note, and an empty chair's "Click to seat
  someone" (spec 53's seat-first search); tabs Seats, Style, Notes. A fixture or
  décor item: its name, size, rotation, label. Nothing selected: the plan's
  summary and unseated people.
- **Canvas:** the dot grid, the room, a **Show** bar (A.2), a legend of the
  colours in use with counts, zoom − / % / + and Fit room. A selected table gets
  a small floating bar: its name, its style, Rotate, Duplicate.

### A.2 What the canvas shows

- **Chairs** are rounded tags, the size of a real chair at the room's scale,
  each with the guest's initials; at 150% zoom and above, the first name. The
  tag's colour is the answer to the **Colour chairs by** question: any RSVP
  question spec 33 Q18 allows (main course, starter, dessert…), or Fit from spec
  53 §G. Empty chairs are white with a dashed outline.
- **Dietary:** a red dot on the chair when the guest's `dietary` is not empty.
- **Declined in a seat:** a guest whose reply for this event is now No, still in
  a chair, has a dashed orange outline, and the right panel shows "*Name* can't
  come any more. Free seat *N*?" with **Free the seat** and **Keep for now**.
  The seat is never freed on its own. Keep for now hides the card for that
  guest until their reply changes again.
- **Show** toggles, remembered per device as spec 53's Show menu is: Venue
  (walls, doors, windows, the uploaded drawing), Furniture, Flowers & décor,
  Names, Walkway guides (spec 33's clearance rings). Hiding a layer hides it on
  screen only; exports have their own choices (Part E).
- The **legend** lists each colour in use with its answer and count, then
  Declined and Dietary.
- Spec 53's remaining gaps close here: Show settings, meal colours and blocked
  chairs are drawn in the Room view and the floor-plan print, not only the table
  drawer.

### A.3 Library

Three groups, each a grid of to-scale tiles; drag one onto the room, or click it
then click the spot (spec 45: never drag-only). Search filters all groups.

| Group | Items | Stored as |
| --- | --- | --- |
| Tables | Round, Long, Square, **Sweetheart** (new shape, two to four seats on one side), **Ceremony rows** (a block of chairs in rows with an aisle), Cocktail (high table, no seats by default) | `seating_tables` |
| Room | Dance floor, Stage, Bar, Buffet, DJ, Band, Cake, Gifts, Photo booth, **Lounge**, **Kids' area** | `seating_fixtures` |
| Flowers & décor | **Floral arch**, **Garland**, **Aisle flowers**, **Candles**, **Plant**, **Sign**, **Lantern**, **Drape** | `seating_fixtures` |

Bold names are new. Each has a default size (an arch 200 × 60 cm, a plant
60 cm round, aisle flowers 40 × 40 cm…) set in `src/lib/seating/geometry.ts`
beside the existing defaults, a drawing (a simple top-down glyph, not a
picture), and the same move, rotate, resize and label as spec 33's fixtures.

**Ceremony rows** is one table record with shape `rows`: capacity, chairs per
row and an aisle width, drawn as rows either side of the aisle and seated like
any table, chairs numbered row by row from the front ("Row 2, seat 3").

## 6. Part B — Drawing the venue

Board 3. The Venue tab of the left panel and the Walls, Area, Text and Measure
tools.

### B.1 The venue's drawing

Spec 33 §C.3's image upload, plus:

- **PDF:** a PDF is accepted; the person picks a page, which is rasterised in the
  browser at 150 dpi (longest side ≤ 6000 px) and stored as a PNG the way spec 33
  stores images. The PDF itself is not kept.
- **Fade:** a slider for the drawing's opacity, stored on the plan.
- **Scale:** spec 33's two-point calibration, labelled in plain words ("Set from
  the north wall, 24.0 m" with Redo), and a units choice, metres or feet and
  inches, which only changes how lengths are shown; storage stays centimetres.
- First use walks through four steps, shown as a strip on the canvas: Upload the
  venue's drawing, Set the scale, Trace the walls (optional), Doors and windows.
  Each can be skipped; a plan with no drawing and no walls is a plain rectangle of `room_width_cm` × `room_depth_cm`.

### B.2 Walls

- The **Walls** tool draws a chain of straight walls: click to add a corner,
  Shift keeps the wall at 0/45/90°, clicking the first corner closes the room,
  double-click or Enter ends an open chain, Esc stops. The wall being drawn
  shows its length and angle.
- Corners snap to the 25 cm grid (spec 33 §C.1's toggle) and to existing
  corners within 20 cm.
- A selected wall can be moved, have a corner dragged, be split, or have its
  thickness set (default 20 cm). Delete removes it.
- Without drawn walls the room is the rectangle; with them, the walls are the
  room, and `room_width_cm` / `room_depth_cm` become the walls' bounding box.

### B.3 Doors, windows and other wall parts

From the Venue tab: Door, Double door, Window, Opening, Column, Stairs, Power
point, Fire exit, Toilets. Doors, double doors, windows and openings snap onto a
wall and slide along it; a door has a width (default 90 cm, double 180 cm), a
side it opens to and a hinge end. Columns, stairs, power points, fire exits and
toilets are free-standing markers.

### B.4 Areas, text and measuring

- **Area:** draw a rectangle or a polygon, then name it ("Terrace", "Photo
  corner") and pick a tint; its size is shown. An area marked **outdoor** is
  drawn hatched.
- **Text:** a label anywhere, 12–48 px at 100% zoom.
- **Measure:** click two points to see the distance; holding Shift keeps the line
  straight. A measurement can be **kept** as a dimension line on the plan, or is
  gone at the next click.
- **Walkway guides** (spec 33's clearance rings) stay a toggle; the Measure
  tool shows a green, amber or red distance when it starts and ends on two
  tables' edges (≥ 120, 90–119, < 90 cm).

## 7. Part C — Table styles: place settings and flowers

Board 2.

### C.1 What a style is

A named, wedding-wide description of what is on a table:

- **Each place:** charger, dinner plate, side plate, napkin (with a colour or
  fold note), cutlery (number of pieces), glasses (number), name card, menu
  card. Each is on or off and can carry a short note.
- **Centre of the table:** arrangement (with a note, e.g. "low garden"),
  candles (a count), tablecloth (with a note), runner (long tables), and up to
  five free items the couple names ("bud vases × 3").
- Each item may name the **vendor** who supplies it (spec 8).

A table has at most one style. Tables share styles, so changing the style
changes every table using it. A table with no style has no centre glyph or place settings.

### C.2 Close-up

Opening a table's Style tab, or double-clicking a table, shows board 2: the
table, top down and to scale, with the cloth, every place setting drawn from the
style at each chair (cutlery, glasses and side plate on the correct sides), the
centre items, and each guest's name tag outside their chair, coloured by meal.
Previous and next table buttons step through the plan. The left panel edits the
style; the right panel shows the totals (C.3).

In the room, a table with a style shows a small top-down glyph of its centre
(a flower cluster for an arrangement, dots for candles); place settings are
drawn only in the close-up.

### C.3 What it adds up to

For the plan, per style item: how many per table and the total across every
table using a style, with the vendor's name. Places count chairs, not guests, so
an empty chair still gets a setting. Head-table and room décor (garlands, arches,
aisle flowers) are listed underneath from the fixtures. The list can be copied,
downloaded as CSV (a `seating-styles` kind on `/api/export/[kind]`), and printed
as part of the export (Part E).

`src/lib/seating/styles.ts` (pure, tested) computes this from the plan's tables
and styles.

## 8. Part D — Locking the room

- **Lock room** stops walls, doors, areas, tables, fixtures and décor moving,
  resizing or being deleted, and hides the drawing tools. Seating people,
  freeing seats and changing table styles still work.
- Any collaborator can lock or unlock; the plan shows who locked it and when.
- Locked is enforced in the server actions as well as the screen: a move to a
  locked plan returns "The room is locked. Unlock it to move things."

## 9. Part E — The caterer export

Board 4. A new `caterer` view in spec 33 §G's print pack, opened from Export,
with these choices: colour by (a meal question), paper (A4 or A3, landscape),
and whether to include table styles.

1. **Page 1:** the floor plan with every chair numbered and coloured by the
   chosen question, dietary chairs outlined red; beside it the key with counts,
   the dietary list by seat ("4.2 Shellfish (severe), James Ngata"), and
   totals (guests, tables, highchairs).
2. **Kitchen summary:** counts per course and answer, every dietary note with
   table and seat.
3. **Guests A to Z** with table and seat, for place and escort cards.
4. **One page per table:** a zoomed drawing of the table with numbered chairs,
   then the seat list in order with answers and dietary notes.
5. **If chosen, table styles:** each style's close-up and the C.3 totals.

The existing `floor` view gains the same colouring and walls. Export → Image
downloads the canvas as a PNG at 1×, 2× or 4×.

## 10. Data — migrations `0055` and `0056`

Next free numbers at the time of writing; the build takes whatever is next.

**`0055_venue_designer_enums.sql`** (enum values must commit before the next file
uses them; see spec 6.1's `55P04` fix):

- `seating_table_shape` gains `sweetheart`, `rows`.
- `seating_fixture_kind` gains `lounge`, `kids_area`, `floral_arch`, `garland`,
  `aisle_flowers`, `candles`, `plant`, `sign`, `lantern`, `drape`.

**`0056_venue_designer.sql`:**

- `seating_plans` gains:
  - `drawing jsonb not null default '{}'`: walls, openings, markers, areas,
    labels and kept dimensions, all in room centimetres. Its shape is checked by
    `src/lib/seating/drawing.ts` (pure, tested) before every write, and by a
    `jsonb_typeof = 'object'` check and a 256 KB size check in the database.
  - `background_opacity smallint not null default 45 check (between 10 and 100)`.
  - `units text not null default 'metric' check (in ('metric','imperial'))`.
  - `colour_by_question_id uuid null`, the plan's Colour chairs by choice
    (replacing spec 53's per-device choice, so exports and every
    collaborator agree).
  - `room_locked_at timestamptz`, `room_locked_by uuid` (a collaborator).
- `seating_tables` gains `rows_count`, `aisle_cm` (for `rows`, both null
  otherwise, checked), and `style_id uuid null` →
  `seating_table_styles (id, wedding_id)` on delete set null.
- **`seating_table_styles`** (new): `id`, `wedding_id`, `name` (1–60, unique per
  wedding), `place jsonb`, `centre jsonb` (shapes checked by
  `src/lib/seating/styles.ts`), `colour text`, timestamps; `unique (id,
  wedding_id)`; RLS by `is_collaborator(wedding_id)`; audit trigger.
- `seat_assignments` gains `decline_kept_at timestamptz` (Keep for now), cleared
  by the app when that guest's reply for the event changes.
- `seating_state()` returns `version: 2` and includes `drawing`, the plan's new
  columns, `style_id`, `rows_count`, `aisle_cm` and `decline_kept_at`;
  `restore_seating_state()` accepts versions 1 and 2, so older History entries
  still restore. Table styles are wedding-wide and are not part of a plan's
  state; undoing a style change goes through its own undo entry that restores
  the style row.
- No guest data is deleted by any of this. Styles are soft-deleted
  (`deleted_at`) like guest data, so a style in an old version still resolves.

SQL suite: tenancy for the new table, the enum values, the `rows` checks, the
size check, `restore_seating_state` round-tripping a v1 and a v2 payload, the
lock (a move refused by the action is tested in unit tests; the database does
not enforce the lock).

## 11. Open questions (each has a recommendation)

1. **Several layouts for one event** (try round tables against long tables, then
   pick one). **Recommendation: not now.** Plan tabs show each seating event, and
   spec 53's History already saves and restores whole versions. A second live
   layout per event touches every seating table's key and is a spec of its own.
2. **Table styles: per wedding or per event?** **Recommendation: per wedding,**
   so the reception and a rehearsal dinner can share one.
3. **Do style totals write to the budget?** **Recommendation: no, show and
   export only.** Copy and CSV now; a link to budget quantities (spec 6.1's
   manual quantity) can follow once the counts are trusted.
4. **PDF upload:** add a PDF renderer (`pdfjs-dist`, client-side only) for it?
   **Recommendation: yes;** venues send PDFs far more often than images.
5. **Names on chairs:** initials at 100%, first names from 150%? **Recommendation:
   yes;** full names are in the right panel and on hover.
6. **Declined guest in a seat:** ask to free the seat, never free it
   automatically? **Recommendation: ask.**
7. **Who can unlock the room?** **Recommendation: any collaborator,** with who
   and when shown.
8. **Phones:** drawing walls and areas on a phone? **Recommendation: no.** Phones
   view the room, seat people and free seats; drawing and décor are tablet and
   desktop.
9. **Colour chairs by: per plan or per device?** **Recommendation: per plan**
   (§10), so the export and every collaborator see the same colours.
10. **Guests see any of this?** **Recommendation: no.** Spec 33 Part F's "your
    table" on the site is unchanged; décor and walls are never shown to guests.

Rejected: live co-editing with presence and watch mode (a large real-time
build for a plan two to three people edit); floor-plan templates shared across
weddings (WEDPLAN serves one couple's wedding at a time); 3D views; auto-seating
(spec 53 rejected it).

## 12. Build order (each step committed separately)

1. `0055`, `0056`, SQL suite additions; `drawing.ts`, `styles.ts` and the
   geometry defaults, with unit tests.
2. **Part A:** the canvas layout, chairs with names and colours, dietary and
   declined markers, Show bar, legend, plan tabs, the Library with the new
   items, Ceremony rows and Sweetheart.
3. **Part B:** PDF upload, fade, units, the four-step strip, Walls, wall parts,
   Area, Text, Measure.
4. **Part C:** table styles, the close-up, totals and CSV.
5. **Part D:** lock.
6. **Part E:** the caterer view, the floor view's colours and walls, PNG export.

## 13. Verification, honestly

What a build must say it ran: typecheck, unit tests (`drawing.ts`, `styles.ts`,
geometry for the new shapes, the v1/v2 state shapes), the SQL suite, `npm run
build`, and the Room view, close-up and caterer print rendered in headless
Chromium with sample data at 1440 px and 1024 px. A real iPad (pointer drawing,
pinch) and live Supabase are separate and must be named if not done.

## 14. Risks

- **Canvas performance:** 200 guests with initials, décor and walls is a few
  thousand SVG nodes. Chairs render as one `<g>` per table, and names drop to
  dots below 60% zoom.
- **Undo payload size:** `drawing` rides in every undo step. The 256 KB check
  bounds it; a traced room is typically under 10 KB.
- **Fixture enum growth:** décor kinds are enum values, and each new one needs a
  migration. Acceptable at ten; if the couple wants free décor items, a later
  spec adds an `other` with a label (already exists) and a glyph choice.
