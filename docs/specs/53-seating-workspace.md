# Feature spec: A seating plan that's quicker to work in

**Status: answered, not built.** Asked for after research into the leading
seating tools (2026-11-23). No auto-seating; undo and version history in;
every other pattern in §3 in. Mockups: the "Shot list & seating mockups"
canvas, rows 3 and 4 (the auto-seat board is marked "Not doing"). Every
question is answered (§10). Nothing is built until the planner says to build
it (see `docs/specs/README.md`).

**Depends on:** spec 33 (the seating plan this improves), spec 32 (audit
log), spec 45 (no-drag), spec 46 (keyboard shortcuts), spec 51 (seating on
or off per event), spec 52 (vendor notes), spec 54 (day links, which Part I
plugs into as a module).

## 1. What was asked

1. Make seating more dynamic and easier to use.
2. Learn from the best existing tools.
3. No auto-seating.
4. Undo and version history.
5. Everything else the research found.

## 2. Story

> **As the couple**, **I want** to get from an empty room to a full plan
> quickly, fix mistakes with one key, and find anyone in a second, **so
> that** seating takes an evening, not a weekend.

## 3. What the leading tools do (conclusions only)

Read from Joy's, Aisle Planner's, PerfectTablePlan's and zkipster's own help
pages. They were not tried hands-on.

| Pattern | Seen in | Part |
| --- | --- | --- |
| Lay out the room from a template (guest count, table shape, where the couple sits, room elements) | Joy | A |
| Add several tables at once; duplicate a table; giving a table a number already in use swaps the two | PerfectTablePlan, zkipster, Joy | B |
| Undo several steps with Cmd+Z; a version history you can restore from | Joy, PerfectTablePlan | C |
| Choose an empty seat, then search for who goes there | Joy | D |
| Select several guests, then place them all | zkipster, PerfectTablePlan | D |
| Tap a guest's name to zoom to their seat | zkipster | E |
| Show names, seat numbers and meals on the plan, with a legend | Aisle Planner | F |
| Flag highchairs and wheelchair places (no chair needed) | Aisle Planner | F |
| Colour chairs by how well each guest's seat suits them | PerfectTablePlan | G |
| Check "nobody unseated" before sending the chart | Joy | H |
| On the day: check-in ticks on seats, blocked seats, changes synced across devices, an activity log | zkipster | I |

Rejected: auto-seating, and with it locking guests (it only exists to stop
auto-seat moving people) and "who fits this seat" ranking (it is auto-seating
one seat at a time).

## 4. Part A — Set up the room

Offered when an event's plan has no tables, as the first screen, with "Start
blank" beside it.

- **How many to seat:** "Said yes + not answered" or "Said yes only", with
  both counts from the event's RSVPs.
- **Tables:** round of 8, round of 10, long of 12, or round and long.
- **Where the couple sits:** top table (8, couple and wedding party),
  sweetheart table (2), or with guests.
- **In the room:** dance floor, band/DJ, bar, buffet, cake table, photo
  booth. Each becomes a fixture (spec 33 Part C).
- The preview redraws as each choice changes and states "12 tables · 128
  seats for 120 people · 8 spare chairs".
- **Use this layout** creates every table and fixture in one server action
  (`applySeatingTemplate`), numbered from the top table outwards, in a grid
  that fits the room size. It is one undo step (Part C).

The layout maths is a pure function, `src/lib/seating/template.ts`.

## 5. Part B — Tables in bulk

- **"+ Tables…"** asks for how many, shape and seats ("6 rounds of 10"),
  and places them in free space near the centre of the view.
- **Duplicate** on a table's menu copies its shape, size and seats, not its
  guests.
- **Renumbering:** a table's number is its label when that label is a number.
  Typing a number another table already has swaps the two labels.

## 6. Part C — Undo, redo and version history

### C.1 Undo and redo

- **Cmd+Z / Ctrl+Z** undoes, **Shift+Cmd+Z / Ctrl+Y** redoes, registered in
  spec 46's shortcut system. Undo and Redo buttons sit in the toolbar, with
  the last action named beside them ("Seated the Parata whānau at Table 3").
- Every change on the seating screen is undoable: seating, unseating, moving
  and swapping guests and chairs; adding, editing, moving, rotating,
  duplicating and deleting tables and fixtures; applying a template; adding
  and removing rules; the room size and calibration.
- An undo runs the inverse action through the same server actions. Deleting a
  table keeps its row and its seat assignments in the undo entry, so undo
  recreates both.
- The stack belongs to the open page and holds the last 100 steps. It is
  cleared on reload. If a step can no longer be undone because someone else
  changed the same guest or table since, the undo is refused with "Mere moved
  them since — not undone", and the step is dropped.

### C.2 Version history

- The plan keeps **automatic versions**: the first change after 30 minutes
  with no changes takes an automatic snapshot of the plan as it was before
  that change (`take_seating_snapshot(..., automatic => true)`, spec 33 Part
  E). Restoring a version also takes one, as today.
- **History** (a clock button) lists versions newest first, grouped by day:
  automatic ones as "Before Tuesday 7:40pm's changes · by Mere", named ones
  by name. Restore asks first, then replaces the plan for everyone.
- The newest 30 automatic versions are kept; older automatic ones are
  deleted when a new one is taken. Named versions are kept until deleted.
- Named "saved copies" stay, inside History, as "Save this version…".

## 7. Parts D–H — Working in the plan

### D. Seating people

The plan keeps its two views: **Tables** (cards, fastest on a phone) and
**Room** (the floor plan). Everything below works in both.

- **Seat first:** tap or click an empty chair (on the plan or in the table
  panel) to get a search of unseated guests for this event. Pick one to seat
  them there. Households show together, with "Seat all 3" and "Just Ana".
- **Several at once:** guests in the panel have checkboxes. Shift-click
  selects a range. "Seat 5 at…" then takes a table. Whoever doesn't fit
  stays selected, with "2 didn't fit — Table 3 is full".
- **On the plan:** chairs on the Room view take a guest directly (drag, or
  tap to place) without opening the table panel. A taken chair swaps.
- Dropping a guest on the background, or "Unseat" in the table panel, takes
  them off.

### E. Finding people

- The search box finds **seated** guests too, showing their table. Choosing
  one scrolls and zooms the Room view to their chair and highlights it, or
  scrolls the Tables view to their table.
- A filter that hides anyone says how many and offers "Show all", including
  seated guests hidden by the filter.

### F. What the plan shows

- A **Show** menu: guest names on chairs, seat numbers, meal colours. Each
  setting is remembered per device and carried into the floor-plan print.
- Meal colours come from the RSVP question chosen as "meal" (as colour-by
  does today), with a legend on the plan and in print.
- **Considerations:** guests gain two optional flags, `needs_highchair` and
  `uses_wheelchair`. A wheelchair place shows as a gap with no chair and
  doesn't count against the table's chairs. A highchair shows as a small
  marker. Both appear on the table panel, the "By table" print and the
  caterer numbers.

### G. Colour by fit

A new **Colour by: Fit** option. Each seated guest is:

- **green:** knows someone at the table (same household, a shared tag, or a
  "keep together" or "near" rule) and breaks no rule;
- **amber:** knows nobody at the table;
- **red:** part of a warning (spec 33 Part B).

The legend counts each. It is a pure function in `src/lib/seating/fit.ts`.

### H. Before printing

"Print & share" shows "4 people aren't seated yet — see who" above the print
options when anyone invited to the event is unseated.

## 8. Part I — On the day

Part I is the **Seating module** of a day link (spec 54): on by default for
vendors in the Venue or Catering category, and switched on by the couple for
ushers. The link, its token, expiry, polling and offline queue are spec 54's.
The module adds a Seating tab:

- **Find a seat:** type two letters to search, and get each match's table,
  seat, tablemates and their vendor note (spec 52 §4.3).
- **Arrived:** a tap marks a guest here. Arrived guests show a tick on their
  chair on the couple's plan. The header counts "86 of 112 here".
- **Move:** move a guest to a spare chair. The link lists spare chairs per
  table.
- **Walk-ins:** a public link never creates a guest. Staff seat a walk-in by
  taking a spare chair as a reserved seat with a note ("+1 for Tom Ruru"),
  the way spec 33 reserves chairs for people who aren't guest records.
- **Blocked chairs:** the couple can block a chair on the plan (a broken
  chair, a pillar). Blocked chairs show a cross and are never offered as
  spare.
- **Activity:** the couple's History shows day-of moves and arrivals, from
  the audit log, with who made them (the link's label).
- **Live:** the couple's plan polls every 15 seconds while open, like the
  day link.
- **The module's writes:** `markArrived`, `unmarkArrived`, `moveGuestOnTheDay`
  and `seatWalkIn` (a reserved seat with a note), and nothing else.

## 9. Data

Migration `0052_seating_workspace.sql` (after specs 51, 54 and 52):

- `guests.needs_highchair boolean not null default false`,
  `guests.uses_wheelchair boolean not null default false`.
- `seating_chairs_blocked (wedding_id, table_id, seat_index, primary key
  (table_id, seat_index))`.
- `seating_checkins (wedding_id, event_id, guest_id, arrived_at, by_label,
  primary key (event_id, guest_id))`.
- A pruning step in `take_seating_snapshot` for automatic snapshots beyond
  the newest 30. That function is replaced in full in the new migration.
- RLS and audit triggers on the new tables.

## 10. Answered — 2026-11-23

Every question took its recommendation.

1. **Views:** Tables and Room stay as two views (Part D). Rejected: merging
   them into one plan.
2. **Highchair and wheelchair:** guest fields `needs_highchair` and
   `uses_wheelchair` (Part F).
3. **Day-of changes:** venue staff with the link can mark arrivals and move
   guests (Part I).
4. **Walk-ins:** no guest record from a public link; a reserved seat with a
   note (Part I).
5. **Set up the room:** offered only on an empty plan (Part A). Rejected:
   "Add a layout" around existing tables.

## 11. Build order

1. Part C first: undo and redo over the existing actions, then automatic
   versions and History. Everything after this gets undo for free.
2. Part D (seat first, several at once, chairs on the plan) and Part E.
3. Parts A and B (template and bulk tables), each one undo step.
4. Parts F, G and H.
5. Migration `0052` and Part I, the Seating module (needs spec 54).
6. Typecheck, tests, SQL suite, build; an iPad for drag and undo; a phone for
   Part I.
