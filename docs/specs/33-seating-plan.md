# Feature spec: The seating plan

**Status: proposed (2026-10-13) — asked for as a spec. Nothing is built.** No
migration, no code. Per `docs/specs/README.md` and `CLAUDE.md`, nothing beyond
this document is written until the open questions in §10 are answered **and**
the planner says to build it as its own turn.

**Depends on:** V1 (`guests`, `households`, `tags`, `events`, `rsvps`), spec 22
(`v_guest_event_invites` — who is invited to which event, per person), spec 29
(`guest_excluded_from_counts()` — "told us they can't come"), spec 32 (the audit
trigger every new table must carry). All built. **None of `0026`–`0035` is
applied to the live project** as of session 38, and this spec's migration would
stack on `0034`'s view, so it cannot be applied ahead of them.

## 1. What was asked

"Plan and spec out a seating plan function." No further brief, so this spec
starts from what `docs/wedding-platform-spec.md` already says about seating
(its V3, "The day itself") and cuts it down to what this codebase, as it stands,
can carry — then puts every real choice in §10 rather than deciding it here.

## 2. What exists today (read off the repo)

- **No seating anything.** No table, route, query or component. The words
  "seat" and "seats" in the codebase mean *headcount*, not chairs:
  `v_households.seat_count` (adults + children; infants don't occupy a seat —
  `0003_derived_views.sql`), the rank screen's per-seat cost, and spec 14's
  coach seats (`coach_seats`, a per-household count on a bus).
- **The core spec's V3 data sketch** (`docs/wedding-platform-spec.md`, "V3: The
  day itself"): `floor_plans`, `plan_tables`, `plan_elements`,
  `seat_assignments`, `seating_constraints`, `plan_snapshots`; a to-scale SVG
  canvas with an uploaded venue outline; two assignment modes (table and seat);
  an unseated tray of confirmed attendees filterable by tag; a constraints
  engine whose violations are warnings, never errors; named snapshots; **no
  auto-seating** ("a solver is V4 or never"). Amendment 23 there: build the
  canvas in SVG with pointer events, not dnd-kit.
- **Who is coming to what** is already a single answer:
  `v_guest_event_invites` (`invited`, `excluded_from_counts` per guest per
  event) plus `rsvps (guest_id, event_id, status)`. Seating must read those and
  not re-derive invited-ness — spec 22 is the record of what happens when the
  caterer's number is worked out in two places.
- **Data a seating plan wants per guest already exists:** `age_band`
  (adult/child/infant), `side`, `dietary`, `accessibility` (free text), tags,
  household, `plus_one_for`.
- **Per-event screens live under `/events/[id]/…`** — the run sheet is
  `/events/[id]/run-sheet`, with `/run-sheet` redirecting to the first event
  that has one. Seating fits the same shape.
- **dnd-kit is already a dependency** (ranking list, list items, sidebar). It
  handles touch, which matters: the planner has been working from an iPad
  (session 38's follow-up), and HTML5 native drag-and-drop does not work on
  iOS Safari.
- **The standing caveat:** nothing in this app has run against a live Supabase
  project or been opened in a real browser. A seating plan is the most
  interaction-heavy screen proposed so far, so §8 says plainly which parts no
  automated check can vouch for.

## 3. The proposal, in one paragraph

Per event, the planner adds **tables** (a label, a shape, a number of seats),
then drags **guests** from an **unseated tray** onto them. The tray shows the
people coming to that event, grouped by household so a family moves in one
drag, filterable by tag and side. Each table shows its count against capacity
and its warnings; a header shows the whole event's totals. **Nothing blocks** —
over capacity, a declined guest still seated, a child away from their
household, two people who mustn't sit together: all warnings, because the
couple will deliberately override some. A printable sheet and a CSV come out
the other end. A **floor-plan view** (dragging the tables themselves around a
room) and **seat-by-seat** placement are separate, later steps, each its own
question in §10.

## 4. Scope

### 4.1 In (steps 1–4, §7)

1. **Tables per event.** Add, rename, resize (seat count), reorder, delete.
   Shape is recorded (round / long / square / head) and drawn as an icon in
   step 1; it only matters geometrically once the floor plan exists.
2. **Table-level assignment.** A guest sits at one table per event, or is
   unseated. Drag a guest, or a whole household, from the tray to a table;
   drag between tables; drag back to the tray. A tap-to-select / tap-to-place
   fallback for when dragging on a phone is fiddly.
3. **The unseated tray.** Guests for whom `v_guest_event_invites.invited` is
   true for this event and `excluded_from_counts` is false, **not yet seated**,
   grouped by household. A status filter: *Yes only* (default once any RSVP is
   in) / *Yes + no answer yet* (for drafting before RSVPs land). Filter by tag
   and side; search by name.
4. **Warnings, never errors** (§5.3).
5. **Two pair rules:** *keep together* and *keep apart*, between two guests.
6. **Outputs:** a print page (per table: names, dietary, accessibility; plus an
   alphabetical name → table list for the entrance board) and a `seating` CSV
   on the existing export route, which also lands in Settings' "Download
   everything (.zip)".

### 4.2 Later, only if §10 says so

- **Floor plan (step 5).** An SVG canvas where tables (and fixtures — dance
  floor, bar, band, cake, entrance) are positioned and rotated by pointer
  events, per amendment 23. Optionally over an uploaded venue image (§10 Q4).
- **Seat-level assignment (step 6).** Which chair, for place cards and
  speeches. `seat_index` exists in the schema from day one so this is not a
  migration later (§5.1), but the UI is separate.
- **Named snapshots** ("try a layout, revert") — see §10 Q6; spec 32's audit
  log already records every move, so this may not earn its keep.
- **"Find your table" on the public site** — a site block (spec 23 named it as
  deliberately later because no table plan existed). Needs a reveal date and a
  privacy decision (§10 Q8).

### 4.3 Out

- **Auto-seating / a solver.** The core spec's call, kept: V4 or never.
- **Rules beyond the two pair rules** (`must_be_near`, `keep_off_table`,
  `needs_accessible_seat`, `needs_high_chair` from the core spec). §5.3 covers
  the high-chair and accessibility cases from data that already exists,
  without new rule kinds; §10 Q5 asks whether that's enough.
- **Menu choices / meal selection per guest.** Belongs with catering, not here
  (spec 23 said the same).
- **Seating for guests who aren't invited to the event.** The tray is the
  invite list for that event; to seat someone, invite them first.

## 5. Data model — one migration, `0036_seating.sql`

Three tables. Every one carries `wedding_id`, composite foreign keys, a place
in the RLS `tenant_tables` array, and spec 32's `audit_row()` trigger (or
`supabase/tests/18_audit_log.sql` fails, on purpose).

### 5.1 Tables

```sql
create type public.seating_table_shape as enum ('round', 'long', 'square', 'head');

create table public.seating_tables (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  event_id    uuid not null,
  label       text not null check (label <> ''),
  shape       public.seating_table_shape not null default 'round',
  capacity    integer not null check (capacity between 1 and 60),
  sort_order  integer not null default 0,
  notes       text,
  -- Floor plan (step 5). Null until the table is placed; step 1 never writes them.
  pos_x       numeric,
  pos_y       numeric,
  rotation    numeric not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  unique (id, event_id, wedding_id),         -- target of seat_assignments' FK
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);

create table public.seat_assignments (
  wedding_id  uuid not null,
  event_id    uuid not null,
  guest_id    uuid not null,
  table_id    uuid not null,
  seat_index  integer check (seat_index >= 0),  -- null = "at this table", step 6 fills it
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (guest_id, event_id),           -- one place per guest per event
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  -- Three-column FK: the table must belong to the SAME event as the row.
  foreign key (table_id, event_id, wedding_id)
    references public.seating_tables (id, event_id, wedding_id) on delete cascade
);
create unique index seat_assignments_chair_uq
  on public.seat_assignments (table_id, seat_index) where seat_index is not null;

create type public.seating_rule_kind as enum ('together', 'apart');

create table public.seating_rules (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  kind        public.seating_rule_kind not null,
  guest_a     uuid not null,
  guest_b     uuid not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  check (guest_a < guest_b),                  -- one row per pair, whichever order it was entered
  unique (guest_a, guest_b),
  foreign key (guest_a, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  foreign key (guest_b, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
```

**Why these choices:**

- **Event-scoped tables, not a `floor_plans` parent.** The core spec's
  `floor_plans` row exists to hold a background image and a scale; until §10 Q4
  says yes to that, it is a table holding one foreign key. If step 5 wants it,
  it is an additive migration then. Rules are **not** event-scoped: "keep Aunt
  Rose away from Uncle Bill" is true at the dinner and the brunch.
- **The primary key is the "nobody sits in two chairs" constraint**, at table
  level and at seat level, without a trigger.
- **The three-column FK** is what stops a guest being assigned, for the
  reception, to a table that belongs to the ceremony — the database refuses it
  rather than a server action remembering to check.
- **Deleting a table hard-deletes it and its assignments**; those guests reappear
  in the tray. This is planner layout data, not guest data, so the
  "`deleted_at`, never a hard delete" rule doesn't apply — the guest rows are
  untouched, and spec 32's audit log records what was where. §10 Q7 asks
  whether a confirm is enough or an undo is wanted.
- **A soft-deleted guest's assignment row stays** (no destructive writes to
  guest data) but every query joins through `guests.deleted_at is null`, so they
  vanish from tables and counts. Restoring the guest restores their seat.
- **Capacity counts chairs, so infants don't count against it** — the same rule
  as `v_households.seat_count`. They are listed at the table with a high-chair
  marker.

### 5.2 No new view in step 1

One query, `getSeatingPlan(eventId)`, reads tables, assignments, rules and the
event's attendee set (from `v_guest_event_invites` + `rsvps`) and hands them to
a pure function. A view is only worth adding if a second consumer appears —
the CSV export would be the second, and it can call the same query.

### 5.3 Warnings — `src/lib/seating/warnings.ts`, pure and unit-tested

Computed in the app from the loaded plan, never stored:

| Warning | When |
| --- | --- |
| **Over capacity** | Non-infant guests at a table > `capacity`. |
| **Declined, still seated** | Seated guest whose RSVP for this event is `no`, or who is now `excluded_from_counts`, or is no longer invited. Not auto-removed: RSVPs change, and silently emptying a chair the couple placed on purpose is the worse failure. One "Return all declined to the tray" button instead. |
| **Not answered yet** | Seated guest with RSVP `pending`/`maybe` (only shown once the tray is on *Yes only*). Informational. |
| **Child away from household** | A `child` or `infant` seated at a different table from every adult in their household who is seated. |
| **Keep together, apart** | A `together` rule whose two guests are both seated at different tables. |
| **Keep apart, together** | An `apart` rule whose two guests share a table. |
| **Plus-one split** | A guest seated away from the guest they're `plus_one_for`. Same mechanism as an implicit *together* rule. |
| **Needs a look** | A seated guest with non-empty `accessibility` text — a marker on their chip rather than a violation, since free text can't be checked against a table. |

Totals in the header: seated / attending, unseated, empty chairs, and tables
over capacity.

## 6. Screens

### 6.1 `/events/[id]/seating`

- Reached from each event's page beside **Run sheet**, and from `/seating`,
  which redirects to the event with tables (or the only event, or offers a
  picker) — the same pattern as `/run-sheet`.
- **Wide screens:** tray on the left, tables as a grid of cards on the right.
  Each card: label, shape icon, `7 / 10`, its warnings, and its guests as chips
  (name, a dietary dot, a high-chair or accessibility marker, tag colours).
- **Phones / iPad portrait:** tables stacked; the tray is a bottom sheet.
  Tap a guest (or household header) to pick them up, tap a table to put them
  down — dragging stays available but is not the only way.
- **Drag is dnd-kit.** At this step it *is* a list problem — moving chips
  between containers — which is exactly what amendment 23 kept dnd-kit for.
  The SVG pointer-events canvas is for step 5, where it's geometry.
- **Rules** are managed from a guest's chip ("Keep apart from…", "Keep
  together with…") and listed in a collapsible panel under the header.
- **Optimistic moves.** A drag updates the screen at once and the server action
  reconciles; a failure snaps the chip back with a message. Every move is one
  small write, never a whole-plan save.

### 6.2 `/events/[id]/seating/print`

Server-rendered, `@media print` styled, the same approach as
`/invitations/print` and `/vendors/contact-sheet`: **by table** (names,
dietary, accessibility, high chairs; one table per block, page-break-avoided)
and **by name** (alphabetical, surname first, with table label — the entrance
board). Browser print-to-PDF, not server-side PDF generation; the core spec's
warning about Vercel function limits on server PDF renders doesn't arise.

### 6.3 Export

A `seating` kind on `/api/export/[kind]` (event, table, seat, guest, household,
dietary, accessibility), and included in "Download everything (.zip)".

## 7. Build order (each step committed separately)

0. **Migration `0036_seating.sql`** + `supabase/tests/NN_seating.sql`: tenancy
   with a second account, the cross-event FK refusal, one-place-per-guest,
   one-guest-per-chair, the pair ordering check, audit trigger present.
1. **Tables.** `src/server/actions/seating.ts` (`createSeatingTable`,
   `updateSeatingTable`, `reorderSeatingTables`, `deleteSeatingTable`, each
   returning `ActionResult`), `src/server/queries/seating.ts` wrapped in
   `cache()`, the page with tables and no tray yet.
2. **Assignment + tray.** `assignGuests(eventId, tableId | null, guestIds[])` —
   one action for a guest, a household, and "back to tray" — with a server-side
   check that every guest is invited to that event. The tray, filters, search,
   tap-to-place.
3. **Warnings and rules.** `src/lib/seating/warnings.ts` with its tests;
   `addSeatingRule` / `removeSeatingRule`; the header totals; "Return all
   declined to the tray".
4. **Print and export.**
5. *(If Q3 says yes)* **Floor plan** — SVG canvas, table positions and rotation,
   fixtures, optional background image (Q4).
6. *(If Q2 says yes)* **Seat-level** placement and place-card print.

Steps 0–4 are a complete, usable feature. Steps 5 and 6 are each independent of
the other.

## 8. Verification, honestly

- `npm run typecheck`, `npm test` (the warnings function carries the logic
  worth testing: every row of §5.3, infants vs capacity, soft-deleted guests,
  a guest uninvited after being seated), `./scripts/verify-migrations.sh`,
  `npm run build`.
- **What none of those can show:** whether dragging a chip across an iPad
  screen feels right, whether the tray bottom sheet fights page scroll, and
  what the print sheet looks like on paper. Those need the app open on a
  real device against a real project — which, per `docs/HANDOFF.md`, has not
  happened for any feature yet. The build status will say which of these
  were and weren't seen.

## 9. Risks

- **Touch drag is the riskiest UI in the app so far.** Mitigated by
  tap-to-place being a first-class path, not an afterthought.
- **RSVP drift.** The plan is drafted before answers are in and goes stale as
  they arrive. Handled as warnings plus one bulk "return declined" action,
  never as silent removal.
- **Size.** 200 guests × ~20 tables renders fine as plain DOM; no
  virtualisation proposed. If the tray gets slow it's the one list to
  virtualise.
- **Concurrent editing** by both partners: last write wins per guest (each move
  is one row), and the page revalidates on each action. No realtime in step 1.

## 10. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | **Which events get a seating plan?** Any event, or only ones the planner switches it on for (e.g. reception yes, ceremony no)? | **Any event, nothing to switch on** — an event with no tables just shows "Add your first table". Avoids a setting. |
| 2 | **Seat-level placement (which chair)** — wanted at all, and in the first build or later? | **Later (step 6).** Table-level is what the venue and caterer need; the column is there so it costs no migration. |
| 3 | **Floor plan (positioning tables around a room)** — wanted, and when? | **Later (step 5).** A grid of tables answers "who sits where"; the room layout is usually the venue's drawing. Build it if you'll hand the venue our plan rather than theirs. |
| 4 | If Q3 is yes: **upload a venue floor-plan image to draw over**, to scale? | **Image yes, to-scale no** — position over a picture by eye; calibrating a scale is a lot of UI for little gain. |
| 5 | **Rules:** are *keep together* and *keep apart* enough, given high chairs and accessibility are surfaced from existing guest data (§5.3)? Or do you want *keep off this table* / *near the front* / *accessible table* too? | **The two pair rules.** Add more only once a real case comes up. |
| 6 | **Named snapshots** ("Draft A", "Draft B", revert)? | **No.** One live plan; the audit log already records every move. Revisit if you find yourself wanting to try two whole layouts side by side. |
| 7 | **Deleting a table** returns its guests to the tray. Confirm dialog only, or an undo? | **Confirm only**, naming how many guests go back to the tray. |
| 8 | **"Find your table" on the public site** — wanted? If yes: shown only to the household's own link (their own table), or a name search on the shared page, and from what date? | **Not in this build.** If wanted later: household link only, showing their own table, from a date you set — a name search exposes who's coming to anyone with the link. |
| 9 | **The tray's default filter** before any RSVPs are in: *Yes + no answer yet* until the first Yes, then *Yes only*? | **Yes, as described** — drafting early shouldn't need a setting changed. |
| 10 | **Where it lives in the nav:** under each event beside Run sheet (§6.1), or its own top-level "Seating" item? | **Under Events**, with `/seating` as the shortcut — matches the run sheet, and the nav already has ten items. |

## 11. What is deliberately not in scope

Auto-seating; meal selection; seating guests not invited to the event;
realtime co-editing; server-side PDF rendering; place cards before seat-level
exists. See §4.3 for the reasoning on each.
