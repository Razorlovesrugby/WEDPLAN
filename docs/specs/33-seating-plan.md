# Feature spec: The seating plan

**Status: proposed, fully scoped (2026-10-13) — nothing is built.** No
migration, no code. Per `docs/specs/README.md` and `CLAUDE.md`, nothing beyond
this document is written until the open questions in §13 are answered **and**
the planner says to build it as its own turn.

**Depends on:** V1 (`guests`, `households`, `tags`, `events`, `rsvps`), spec 9
(the private storage bucket and its signed-URL pattern), spec 22
(`v_guest_event_invites`), spec 23/25/28 (site blocks; every guest page is a
household's own), spec 29 (`guest_excluded_from_counts()`), spec 32 (the audit
trigger every new table must carry). All built. **None of `0026`–`0035` is
applied to the live project** as of session 38, and this spec's migration
reads `0034`'s view, so it cannot be applied ahead of them.

## Revision — 2026-10-13, same day

The first draft (commit on `claude/spec-33-seating-plan`) built a table-level
plan and left five things as "later, if asked": the floor plan, seat-by-seat
placement, more rule kinds, named snapshots, and "find your table" on the
site. The planner's reply was **"Scope out all of this"**, read as: specify
all of it now. So every one of those is now a full part of this spec (Parts
C–F), the old "later" questions are closed below, and §13 holds the smaller
questions that full scoping raised instead.

**This is scope, not build authorization.** The build order (§10) still waits
on §13 and on a separate "build it".

| Old Q | Was | Now |
| --- | --- | --- |
| 2 | Seat-level — later? | **In scope** — Part D. |
| 3 | Floor plan — later? | **In scope** — Part C. |
| 4 | Venue image; to scale? | **In scope**, image plus an *optional* two-point calibration (§C.3). New Q7 asks whether to keep calibration. |
| 5 | Only the two pair rules? | **In scope** — five rule kinds, Part B. |
| 6 | Named snapshots? | **In scope** — Part E. |
| 8 | Find your table on the site? | **In scope** — Part F. New Q10–Q12 cover its privacy choices. |
| 1, 7, 9, 10 | Which events; delete confirm; tray default; nav | Carried into §13 unchanged. |

## 1. What was asked

"Plan and spec out a seating plan function," then "scope out all of this."
This spec starts from `docs/wedding-platform-spec.md`'s V3 ("The day itself")
and fits it to the codebase as it stands. **Auto-seating stays out** — the core
spec's own call ("V4 or never"), and nothing the planner said reopened it.

## 2. What exists today (read off the repo)

- **No seating anything.** "Seat" in the codebase means headcount:
  `v_households.seat_count` (adults + children; infants don't occupy a seat —
  `0003_derived_views.sql`), the rank screen's per-seat cost, spec 14's
  `coach_seats`.
- **Who is coming to what** is one answer: `v_guest_event_invites`
  (`invited`, `excluded_from_counts`, per guest per event) plus
  `rsvps (guest_id, event_id, status)`. Seating reads those; it never
  re-derives invited-ness (spec 22's lesson).
- **Per guest:** `age_band`, `side`, `dietary`, `accessibility` (free text),
  tags, household, `plus_one_for`.
- **Per-event screens** live under `/events/[id]/…` — the run sheet is
  `/events/[id]/run-sheet`, `/run-sheet` redirects to the first event with one.
- **dnd-kit** is a dependency and handles touch. The planner works from an
  iPad (session 38), where HTML5 native drag-and-drop does not work.
- **Images:** one private bucket, created by `scripts/ensure-bucket.mjs` (not a
  migration, so `verify-migrations.sh` keeps running on bare Postgres). Objects
  are written and signed by the service role after the caller's wedding is
  established; moodboards and the site use `<prefix>/` paths in it.
- **Site blocks:** `site_blocks.type` is free text checked by a regex; the set
  of kinds lives in `src/lib/site/blocks.ts` (`BLOCK_TYPES`). A new block kind
  is code, not a migration. Every guest page is a household's own
  (`/w/[slug]/[household]`); the shared page is a 404 (spec 28).
- **Postgres functions called from queries** have precedent
  (`budget_guest_counts` via `.rpc`), which Part E's restore uses.
- **The standing caveat:** nothing in this app has run against a live Supabase
  project or been opened in a real browser. Part C (the canvas) is the most
  interaction-heavy thing proposed so far; §11 is plain about what no automated
  check can vouch for.

## 3. The whole thing, in one paragraph

Per event, the planner adds **tables** and drags **guests** onto them from an
**unseated tray** of that event's attendees, grouped by household. Two views of
the same plan: **Tables** (a grid of cards — fast, works on a phone) and
**Room** (an SVG floor plan, optionally over a picture of the venue, where
tables and fixtures like the dance floor are moved and rotated). Opening a table
shows its **chairs**, for seat-by-seat placement and place cards. **Rules** —
keep together, keep apart, near each other, not at this table, needs an
accessible table — and the plan's own problems (over capacity, declined but
seated, a child away from their parents) surface as **warnings, never errors**.
**Snapshots** save a named copy of the layout and restore it. A **"Your table"
block** tells each household where they're sitting, from a date the couple
chooses. A **print pack** and a **CSV** come out the other end.

## 4. Scope

### 4.1 In

| Part | What |
| --- | --- |
| A | Tables per event; table-level assignment; the tray; tap-to-place. |
| B | Warnings, and five rule kinds. |
| C | The Room view: positions, rotation, fixtures, a venue image, optional calibration. |
| D | Seat-level placement; place cards. |
| E | Named snapshots and restore. |
| F | "Your table" on each household's site page, with a reveal date. |
| G | Print pack and CSV export. |

### 4.2 Out

- **Auto-seating / suggestions.** Core spec, kept.
- **Meal choices per guest.** Catering, not seating (spec 23 said the same).
- **Seating someone not invited to the event.** Invite them first; the tray is
  the invite list.
- **Realtime co-editing.** Each move is one row and last write wins; the page
  revalidates per action. Two people editing at once see each other's moves on
  their next action, not live.
- **A name search on the public site.** The shared page doesn't exist (spec 28)
  and a name search would tell anyone holding a link who is coming.
- **Server-side PDF rendering.** Print pages are HTML + `@media print`; the
  browser makes the PDF. The core spec's Vercel-limits warning doesn't arise.

## 5. Data model — one migration, `0036_seating.sql`

All schema for every part lands in one migration, ahead of the steps that use
it (the README allows schema ahead of the build when it's reviewed as
infrastructure — this paragraph is that review). Every table carries
`wedding_id`, composite foreign keys, a place in the RLS `tenant_tables` array,
and spec 32's `audit_row()` trigger — **except `seating_snapshots`**, which goes
on `18_audit_log.sql`'s exception list (§5.6).

### 5.1 `seating_plans` — one per event, created on first use

```sql
create table public.seating_plans (
  wedding_id        uuid not null,
  event_id          uuid not null,
  -- The room, in centimetres. Defaults are a generic 20 m × 15 m marquee;
  -- calibration (§C.3) overwrites them from the venue image.
  room_width_cm     integer not null default 2000 check (room_width_cm between 300 and 20000),
  room_depth_cm     integer not null default 1500 check (room_depth_cm between 300 and 20000),
  background_path   text,            -- object in the private bucket, `seating/<wedding>/<event>/…`
  background_w_px   integer,         -- the image's own size, so the room box can match its aspect
  background_h_px   integer,
  calibrated        boolean not null default false,
  -- Part F. Null = never shown to guests.
  reveal_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (event_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  check ((background_path is null) = (background_w_px is null)
     and (background_path is null) = (background_h_px is null))
);
```

The core spec called this `floor_plans`. It earns its row now because the room,
the image and the reveal date all have to live somewhere per event.

### 5.2 `seating_tables`

```sql
create type public.seating_table_shape as enum ('round', 'long', 'square', 'head');

create table public.seating_tables (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null,
  event_id        uuid not null,
  label           text not null check (label <> ''),
  shape           public.seating_table_shape not null default 'round',
  capacity        integer not null check (capacity between 1 and 60),
  -- Chairs taken by people who aren't guest records: the couple if they
  -- aren't entered as guests, the celebrant, the photographer's meal (Q8).
  reserved_seats  integer not null default 0 check (reserved_seats >= 0),
  reserved_note   text,
  ends_seated     boolean not null default false,  -- long tables only: a chair at each end (Q4)
  accessible      boolean not null default false,  -- Part B's `accessible` rule checks this
  sort_order      integer not null default 0,
  notes           text,
  -- Part C. Centre of the table, in room centimetres. Null = not yet placed.
  pos_x_cm        integer,
  pos_y_cm        integer,
  rotation_deg    integer not null default 0 check (rotation_deg between 0 and 359),
  -- Physical size. Null = derived from shape and capacity (§C.2).
  width_cm        integer check (width_cm between 40 and 2000),
  length_cm       integer check (length_cm between 40 and 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, wedding_id),
  unique (id, event_id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade,
  check (reserved_seats <= capacity),
  check ((pos_x_cm is null) = (pos_y_cm is null))
);
```

### 5.3 `seating_fixtures` — Part C

```sql
create type public.seating_fixture_kind as enum
  ('dance_floor', 'bar', 'band', 'dj', 'stage', 'cake', 'gifts', 'entrance',
   'photo_booth', 'buffet', 'other');

create table public.seating_fixtures (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null,
  event_id      uuid not null,
  kind          public.seating_fixture_kind not null,
  label         text,                 -- null = the kind's own name
  pos_x_cm      integer not null,
  pos_y_cm      integer not null,
  width_cm      integer not null check (width_cm between 20 and 5000),
  depth_cm      integer not null check (depth_cm between 20 and 5000),
  rotation_deg  integer not null default 0 check (rotation_deg between 0 and 359),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
```

### 5.4 `seat_assignments`

```sql
create table public.seat_assignments (
  wedding_id  uuid not null,
  event_id    uuid not null,
  guest_id    uuid not null,
  table_id    uuid not null,
  seat_index  integer check (seat_index >= 0),  -- null = at this table, chair not chosen
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (guest_id, event_id),             -- one place per guest per event
  foreign key (guest_id, wedding_id)
    references public.guests (id, wedding_id) on delete cascade,
  foreign key (table_id, event_id, wedding_id)  -- the table must be THIS event's
    references public.seating_tables (id, event_id, wedding_id) on delete cascade
);
create unique index seat_assignments_chair_uq
  on public.seat_assignments (table_id, seat_index) where seat_index is not null;
```

`seat_index < capacity` is **not** a check constraint — it would need a
cross-table trigger. The action that shrinks a table clears out-of-range
`seat_index`es in the same transaction (§D.3), and the warnings flag any that
slip through.

### 5.5 `seating_rules` — Part B

```sql
create type public.seating_rule_kind as enum
  ('together', 'apart', 'near', 'avoid_table', 'accessible');

create table public.seating_rules (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  kind        public.seating_rule_kind not null,
  guest_a     uuid not null,
  guest_b     uuid,
  table_id    uuid,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (guest_a, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  foreign key (guest_b, wedding_id) references public.guests (id, wedding_id) on delete cascade,
  foreign key (table_id, wedding_id) references public.seating_tables (id, wedding_id) on delete cascade,
  check (case kind
    when 'avoid_table' then guest_b is null and table_id is not null
    when 'accessible'  then guest_b is null and table_id is null
    else guest_b is not null and table_id is null and guest_a < guest_b
  end)
);
create unique index seating_rules_pair_uq  on public.seating_rules (kind, guest_a, guest_b) where guest_b is not null;
create unique index seating_rules_table_uq on public.seating_rules (guest_a, table_id) where table_id is not null;
create unique index seating_rules_acc_uq   on public.seating_rules (guest_a) where kind = 'accessible';
```

Pair and `accessible` rules are wedding-wide ("keep Rose away from Bill" holds
at the dinner and the brunch). `avoid_table` is event-specific by being tied to
a table. `guest_a < guest_b` stores each pair once.

### 5.6 `seating_snapshots` — Part E

```sql
create table public.seating_snapshots (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null,
  event_id    uuid not null,
  name        text not null check (name <> ''),
  automatic   boolean not null default false,  -- "Before restoring …"
  created_by  uuid,                            -- auth.uid(); null from the SQL editor
  payload     jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz not null default now(),
  unique (id, wedding_id),
  foreign key (event_id, wedding_id)
    references public.events (id, wedding_id) on delete cascade
);
```

**Not audited:** a snapshot *is* a record of a layout, and auditing it would
copy every payload into `audit_log` in full. Restoring one is audited — it's
ordinary deletes and inserts on the audited tables. Goes on
`18_audit_log.sql`'s exception list with that reason.

### 5.7 Deletion and guest data

- Tables, fixtures, rules and snapshots are **planner layout data** and are
  hard-deleted; the audit log keeps what was where. Deleting a table cascades
  its assignments and those guests reappear in the tray.
- A **soft-deleted guest's** assignment row stays (no destructive writes to
  guest data); every query joins through `guests.deleted_at is null`, so they
  vanish from tables and counts, and restoring the guest restores their seat.
- **Infants don't count against capacity** — `v_households.seat_count`'s rule.
  They're listed at the table with a high-chair marker. `reserved_seats` do
  count.

### 5.8 Function: `restore_seating_snapshot(p_snapshot_id uuid)`

`security invoker`, so RLS applies exactly as it would to the app. In one
transaction: write an automatic snapshot of the current plan named
`Before restoring "<name>"`; delete the event's tables and fixtures (cascading
assignments and `avoid_table` rules); re-insert tables and fixtures **with
their original ids** from the payload; re-insert assignments, **skipping**
guests that no longer exist or are soft-deleted; restore `seating_plans`' room
size (not the image, not `reveal_at`). Returns
`{tables, fixtures, seated, skipped}`. A function rather than a server action
because a half-restored plan is the one failure here worth a transaction.

`avoid_table` rules pointing at restored tables are lost on restore unless the
snapshot carries them — so the payload **does** include `avoid_table` rules
(they belong to tables); pair and `accessible` rules are facts about people and
are not snapshotted (Q9).

## 6. Part A — Tables and assignment

### A.1 Tables

Add (label defaults to the next free "Table N"; Q13), rename, change shape,
seats, reserved seats, mark accessible, reorder, delete (confirm, naming how
many guests go back to the tray). In the Tables view the grid follows
`sort_order`; in the Room view it follows position.

### A.2 The tray

Guests where `v_guest_event_invites.invited` and not `excluded_from_counts`
for this event, **not yet seated**, grouped by household. Status filter: *Yes
only* / *Yes + no answer yet* (Q2: the latter until the first Yes arrives).
Filter by tag and side; search by name. A household header drags (or taps)
the whole household.

### A.3 Moving people

- **Tables view:** dnd-kit, chip to table card, card to card, card to tray.
  Here it's a list problem — what amendment 23 kept dnd-kit for.
- **Room view:** drop a chip on a table shape (pointer events, same canvas as
  Part C), or tap-to-place.
- **Tap-to-place everywhere:** tap a guest or household to pick up (a bar
  shows who's held), tap a table or chair to put down, tap the tray to unseat.
  First-class on phones, not a fallback.
- **One action:** `assignGuests(eventId, tableId | null, guestIds[], seatIndex?)`.
  Checks every guest is invited to the event; places a household at a table
  with `seat_index` null; with `seatIndex`, places one guest in one chair,
  swapping with whoever's there (§D.2).
- **Optimistic:** the screen moves at once; a failed action snaps back with a
  message. Never a whole-plan save.

## 7. Part B — Warnings and rules

### B.1 Rules

| Kind | Meaning | Checked when |
| --- | --- | --- |
| `together` | A and B at the same table. | Both seated at different tables. |
| `apart` | A and B not at the same table. | Both at the same table. |
| `near` | A and B at the same or neighbouring tables. | Both seated, tables differ, and their edges are more than **300 cm** apart in the Room view. If either table isn't placed: an info line, "can't check until both tables are placed". |
| `avoid_table` | A not at this table (the one by the speakers). | A is at it. |
| `accessible` | A needs an accessible table. | A is at a table not marked `accessible`. |

Added from a guest's chip menu ("Keep apart from…", "Not at this table",
"Needs an accessible table"…) or `/guests/[id]`; listed in a panel under the
header with a delete each. A guest with non-empty `accessibility` text and no
`accessible` rule gets a "needs a look?" marker that offers to add one.

### B.2 Warnings — `src/lib/seating/warnings.ts`, pure and tested

Computed from the loaded plan, never stored:

| Warning | When |
| --- | --- |
| Over capacity | Non-infant guests + `reserved_seats` > `capacity`. |
| Declined, still seated | RSVP `no` for this event, or now `excluded_from_counts`, or no longer invited. Never auto-removed; one "Return all declined to the tray" button. |
| Not answered yet | RSVP `pending`/`maybe`, shown once the tray is on *Yes only*. Info. |
| Child away from household | A `child`/`infant` at a different table from every seated adult in their household. |
| Plus-one split | Not at the same table as their `plus_one_for`. |
| Any rule in B.1 | As tabled. |
| Chair off the table | `seat_index ≥ capacity` (shouldn't happen; §5.4). |
| Overlap | Room view: two tables or a table and a fixture overlap (Q6 — overlap only, no walkway minimum). |

Header totals: seated / attending, unseated, empty chairs, tables over
capacity, open warnings (click to jump to the table).

## 8. Part C — The Room view

### C.1 Canvas

SVG with pointer events (amendment 23), in a `viewBox` of the room's
centimetres, so the drawing is to scale by construction. Pan (drag the
background, two-finger on touch), zoom (pinch, wheel, +/−), "fit room".
Select a table or fixture to move it (drag), rotate it (a handle; 15° steps,
free with a modifier), or edit it in a side panel. Snap to a 25 cm grid,
toggleable. Arrow keys nudge 5 cm (25 with shift). Unplaced tables sit in a
strip along the bottom: drag one into the room to place it.

Each table draws as its shape, label, and `7 / 10`, tinted when it has a
warning. Fixtures draw as labelled rectangles (dance floor, bar…), added from
a palette with sensible default sizes (dance floor 500 × 500, bar 300 × 80…).

**Moves save on pointer-up**, one action per drag
(`moveSeatingItem(kind, id, x, y, rotation)`), not per frame.

### C.2 Geometry — `src/lib/seating/geometry.ts`, pure and tested

- Default size from shape and seats, if `width_cm`/`length_cm` are null:
  round diameter from ~60 cm of circumference per chair (min 90 cm); long
  tables 60 cm per chair per side, 75 cm wide (plus an end each if
  `ends_seated`); square ~60 cm a side per chair-quarter; head tables one-sided.
- `seatPositions(table)` → each chair's position and facing, used by the Room
  view, the table drawer (§D.1) and the print floor plan alike.
- Edge distance between tables (for `near`) and rectangle/circle overlap (for
  the overlap warning), rotation included.

### C.3 Venue image and calibration

Upload a photo or PDF-exported image of the venue's floor plan (JPEG/PNG/WebP,
≤ 10 MB; re-encoded client-side like site images). Stored in the existing
bucket at `seating/<wedding_id>/<event_id>/<uuid>.<ext>`, served by a
short-lived signed URL. Drawn under everything at reduced opacity, stretched to
the room box.

**Calibrate (optional):** tap two points on the image, type the real distance
("12 m between these walls"); the app sets `room_width_cm`/`room_depth_cm` from
the image's pixel size and marks `calibrated`. Without calibration the image is
fitted to the default room and positions are by eye. Replacing the image keeps
table positions in centimetres; removing it deletes the object.

### C.4 Phones

The Room view works on a phone (pinch, pan, tap-to-place, move tables), but
the toolbar collapses to essentials and it opens on the Tables view by default
below tablet width.

## 9. Parts D–G

### D. Seat-level placement and place cards

- **D.1 The table drawer.** Opening a table (either view) shows its chairs
  around the drawn shape, numbered clockwise from the top (head tables left to
  right as the guests see them — Q5). Guests at the table with no chair yet
  are listed beside it.
- **D.2 Placing.** Drag or tap a guest to a chair; dropping on an occupied
  chair swaps the two. "Clear chairs" sets the table's `seat_index`es to null.
  Reserved seats are drawn as the last chairs, labelled with `reserved_note`.
- **D.3 Shrinking a table** below a chosen chair: confirm ("2 guests lose
  their chair and stay at the table"), then the same action nulls their
  `seat_index`.
- **D.4 Place cards** (`print?view=cards`): folded tent cards, 4 per A4,
  guest's name (preferred name if set) and table label; ordered by table then
  chair so they can be laid out in sequence. No dietary marking on the card
  (Q6).

### E. Snapshots

"Save a copy" names and stores the current plan (tables, fixtures,
assignments, `avoid_table` rules) as a versioned JSON payload
(`{version: 1, …}`, built by `src/lib/seating/snapshot.ts`, tested). A list
shows each snapshot with when, who, and a summary ("18 tables, 164 seated").
"Restore" confirms, then calls the function in §5.8 and reports what was
skipped ("2 guests have been removed from the list since"). Rename, delete. No
cap — a snapshot of a 200-guest plan is a few tens of kB. Automatic
"Before restoring" snapshots are marked and can be deleted like any other.

### F. "Your table" on the site

- **Block kind `your_table`** in `BLOCK_TYPES`, family "the day", payload
  `{event_id, heading, show_tablemates, show_seat}`. No migration.
- On a household's page, **only after the event's `reveal_at`**: one line per
  member who's seated — "Ana — Table 4" (and "seat 3" if `show_seat`). Members
  not seated aren't mentioned. Before the reveal, or if nobody in the household
  is seated, **the block doesn't render at all** (Q11).
- `show_tablemates` adds the other names at their table(s) — off by default
  (Q10): it tells a household who else is coming.
- `reveal_at` is set on the seating screen ("Show guests their table from…",
  in the wedding's timezone) with a reminder that changes after that date
  are seen immediately.
- Served by the existing household page loader (service role, scoped to that
  household's guests), so no new public route. Seating actions revalidate the
  wedding's household pages once `reveal_at` has passed. How that fits the
  pages' caching is checked at build time — `staleTimes` is what bit spec 30.
- The planner's preview shows the block regardless of date, labelled
  "Guests see this from <date>".

### G. Print pack and export

`/events/[id]/seating/print?view=…`, server-rendered with `@media print`, the
same approach as `/invitations/print` and `/vendors/contact-sheet`:

| View | For | Content |
| --- | --- | --- |
| `tables` | Venue, caterer | Per table: chairs in order (or names, if no chairs), dietary, accessibility, high chairs, reserved seats. One table per block, page breaks avoided. |
| `names` | Entrance board | Alphabetical by surname: name → table. |
| `catering` | Caterer | Per table: adults / children / infants / reserved, and each dietary line; totals. |
| `floor` | Venue | The Room view as SVG on A4/A3 landscape: tables with label and count, fixtures; no guest names. |
| `cards` | Place cards | §D.4. |

CSV: a `seating` kind on `/api/export/[kind]` (event, table, chair, guest,
household, age band, dietary, accessibility), included in "Download everything
(.zip)".

## 10. Build order (each step committed separately)

| Step | What | Usable alone? |
| --- | --- | --- |
| 0 | `0036_seating.sql` (all of §5), `restore_seating_snapshot`, `supabase/tests/NN_seating.sql`, audit exception entry. | — |
| 1 | Tables: queries (`cache()`), actions (`ActionResult`), the Tables view without a tray. | — |
| 2 | Tray and assignment, tap-to-place. | **Yes — a working plan.** |
| 3 | Warnings; `together`/`apart`/`avoid_table`/`accessible` rules; "Return all declined". | |
| 4 | Print `tables`/`names`/`catering`; CSV. | **Yes — the venue and caterer get what they need.** |
| 5 | Geometry lib; the Room view; positions, rotation, fixtures; `near` and overlap warnings. | |
| 6 | Venue image upload; calibration; print `floor`. | |
| 7 | Table drawer; chairs; swap; place cards. | |
| 8 | Snapshots and restore. | |
| 9 | `your_table` block and `reveal_at`. | |

Steps 5–9 depend on 0–4; among themselves, 6 needs 5, the rest are
independent. The canvas (5–6) is the largest single piece of UI proposed for
this app so far; a reasonable stopping point after step 4 exists by design.

## 11. Verification, honestly

- **Automated:** `npm run typecheck`; `npm test` — the warnings (every row of
  §B.2, infants and reserved seats vs capacity, soft-deleted and uninvited
  guests), geometry (default sizes, chair positions under rotation, overlap,
  edge distance), snapshot build/parse; `./scripts/verify-migrations.sh` —
  second-account tenancy on all six tables, the cross-event FK refusal, one
  place per guest, one guest per chair, every branch of the rules check,
  restore round-trip (including a guest deleted between save and restore, and
  the automatic snapshot it writes); `npm run build`.
- **Not provable by any of those:** touch drag and pinch on a real iPad, the
  canvas's feel, how the print views come out on paper, an image upload to the
  real bucket, and the reveal on a real household page. Per
  `docs/HANDOFF.md`, no feature has been opened in a browser against a live
  project yet; the build status will list which of these were and weren't
  seen.

## 12. Risks

- **The canvas is real work** — pan/zoom/rotate/snap/hit-testing on touch. Kept
  apart from the core (steps 0–4) so the useful part doesn't wait on it.
- **RSVP drift** — handled as warnings plus one bulk action, never silent removal.
- **Leaking who's coming** through `your_table` — tablemates off by default,
  only the household's own page, nothing before `reveal_at`.
- **Restore is destructive to the current layout** — mitigated by the automatic
  snapshot it takes first.
- **Size** — ~200 guests × ~25 tables is plain DOM/SVG; no virtualisation.

## 13. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Which events get a seating plan — any, or switched on per event? | **Any event**, nothing to switch on. |
| 2 | Tray default before RSVPs are in. | ***Yes + no answer yet* until the first Yes, then *Yes only*.** |
| 3 | Nav: under each event beside Run sheet, or a top-level "Seating"? | **Under Events**, plus a `/seating` shortcut. |
| 4 | Long tables: chairs at the ends? | **Off by default, a tick box per table.** |
| 5 | Chair numbering: clockwise from the top; head table left to right as guests face it. | **Yes.** |
| 6 | Place cards: name + table only, or a dietary marker too? Spacing: overlap warning only, or also a minimum walkway between tables? | **Name + table only; overlap only.** |
| 7 | Calibration (two points + a real distance) — keep, or position by eye over the image only? | **Keep, optional.** It's one small dialog and makes `near` meaningful. |
| 8 | Are the two of you entered as guests? If not, the head table uses reserved seats (also good for vendor meals). | **Reserved seats** either way — tell me if you're already guest records. |
| 9 | Do snapshots include pair/accessibility rules? | **No** — those are facts about people, not about a layout. |
| 10 | "Your table": show tablemates' names? | **Off by default**, a switch on the block. |
| 11 | Before the reveal date, hide the block or show "Table plan coming soon"? | **Hide it.** |
| 12 | After the reveal, should moving someone notify them? | **No** — the page just shows the current table. |
| 13 | Table names: "Table 1, 2…" by default, renamable? | **Yes.** |
| 14 | Deleting a table: confirm only, or undo too? | **Confirm only** (snapshots now cover bigger mistakes). |
