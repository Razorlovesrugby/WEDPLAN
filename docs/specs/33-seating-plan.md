# Feature spec: The seating plan

**Status: building (2026-10-14) — asked for as a spec, scoped in full,
researched against nine competing products, then "Build it" as its own turn.**
See **Build status** at the foot of this file for what was built and what was
not seen.

## Answered — 2026-10-14

"Build it" came without answers to §13, so **every question takes its
recommendation**, as written in §13. In one line each: any event (1); *Yes +
no answer yet* until the first Yes (2); under Events plus `/seating` (3); end
chairs off by default (4); clockwise from the top (5); name + table + colour
dot, overlap warning + clearance rings (6); calibration kept, optional (7);
reserved seats (8); rules not in snapshots (9); tablemates off by default
(10); hidden before the reveal (11); no notification (12); "Table N" (13);
confirm only (14); **no auto-seating** (15); **no day-of name search or QR**
(16); **no live venue link** (17); meal colour from an RSVP question (18).
Any of these can still be changed — say which.

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

**Second revision, same day — "make sure you're researching what top other
websites offer."** §2A is a survey of nine products. It changed the spec in six
places: escort cards (§G), colouring guests by side / tag / an RSVP answer such
as a meal choice (§A.2) and per-table meal counts (§G), optional clearance rings
around tables (§C.1), the entrance chart drawn in the site's own theme (§G), and
four new questions (§13 Q15–Q18), including whether to reopen auto-seating,
which most newer tools now sell.

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

## 2A. What other products offer (researched 2026-10-13)

Read from the products' own pages and help docs where search reached them, and
from third-party listings otherwise. Direct page fetches failed from this
environment (DNS), so everything below comes from search results; **nothing
here was tried hands-on**, and several of the third-party sources are
competitors' comparison pages, so they're noted as such.

| Product | Seating offer, as described | What it means for us |
| --- | --- | --- |
| **Zola** | Seating chart per wedding event, fed from the guest list; tables then guests, drag to specific seats; group by dietary restriction or custom tags; download as **PDF or Excel**; iOS app + desktop, synced. Free up to 15 guests, then Premium. | Per-event, seat-level, guest-list-fed: all already in the spec. Their paywall is a reason not to have one. |
| **The Knot** | A legacy tool its own staff say is no longer being updated. Forum complaints: tables silently change size, **seating one person from a party drags in the whole party**, a chart "that took hours… just disappeared". | Three lessons the spec already acts on: a household moves together by choice, not by force (§A.3); table size changes only when you change it; snapshots and per-move saves (§E, §A.3). |
| **WeddingWire** | Free; tables, dance floor, DJ booth placed to mimic the room; guests grouped; **chart view and list view**; seating for every event; print, export, email to partner/planner/venue. | Same two-view shape as our Tables/Room. |
| **Aisle Planner** (planner-facing) | Upload a venue image and **"Set Image Scale" by drawing a line between two points of known distance**; **service-area guides** showing room between tables; **coloured meal indicators** per guest; seating stats (enough chairs for the headcount); Table View synced with the layout; PDF of layout + guest list with meals and seats. A competitor says the editor has a steep learning curve and hard-copy output needs workarounds. | Confirms calibration (§C.3, Q7). Adds clearance rings (§C.1) and meal colouring (§A.2). Print quality is a real gap in the market — §G matters. |
| **Prismm** (formerly AllSeated) | To-scale furniture; JPG/PNG/PDF venue upload; 2D and a **3D walk-through**; guests imported with RSVP status, **meal type** and notes; seat-level assignment; real-time collaboration, comments, vendor access. | 3D stays out (the core spec's own call). Meal type confirmed again. |
| **PerfectTablePlan** (desktop, since 2005) | **Automatic seating** from together/apart preferences, or drag and drop; prints floor plans, charts **by name or by table**, place cards, **escort cards**, table cards, labels; data merged into card designs; meal choices printed on place cards for catering staff; a **scrolling chart on a screen at the venue**; offline. | Adds escort cards (§G). Auto-seating → Q15. |
| **Wedibox** | Floor-plan canvas, round/long/head tables, drag names onto chairs; declined guests left out automatically; **moving tables is desktop-only**, phones get a list; **"Find your seat" name search on the wedding site + a printable QR code**, only finds seated guests, on the top paid plan. | Our phone story is already better (§C.4). Name search + QR → Q16. |
| **Seatbee, Tablecharm, WedSites** (newer tools) | All sell **one-click auto-seating** from together/apart/VIP/dietary rules; trace a venue photo to scale; PDF export; Tablecharm texts guests a find-my-seat link. | The market now treats auto-seating as standard → Q15. |
| **Joy, Bridebook** | Joy: guest tags to filter while seating; whether it has a real chart tool is disputed (competitors say no). Bridebook: assign seats in the guest list, then **export** to build the chart elsewhere. | Not leaders here; nothing to borrow. |

**Where we'd already be ahead:** seating that follows per-person, per-event
invitations (spec 22) rather than a household-wide guest list; warnings that
remember rules across revisions; full editing on a phone; no paywall or guest
cap; a guest-facing lookup that doesn't let a stranger search the guest list.

**Where we'd be behind, by choice:** no 3D, no real-time co-editing, and — unless
Q15 says otherwise — no auto-seating.

Sources: [Zola seating chart](https://www.zola.com/wedding-planning/seating-chart),
[Zola FAQ](https://www.zola.com/faq/360038917171-how-do-i-use-the-zola-seating-chart-),
[The Knot feedback forum](https://help.theknot.com/forums/263843-theknot-com-ideas-feedback/suggestions/7837734--seating-chart-seating-chart-is-glitchy),
[The Knot — parties and seating](https://help.theknot.com/forums/263843-theknot-com-ideas-feedback/suggestions/11509791-guest-list-parties-and-seating-chart),
[WeddingWire seating chart](https://www.weddingwire.com/wedding-planning/wedding-seating-tables.html),
[Aisle Planner — Layouts & Seating](https://www.aisleplanner.com/blog/feature-spotlight/designing-perfect-event-layouts-seating-aisle-planner),
[Aisle Planner — Todd Harper on layouts](https://aisleplanner.com/blog/feature-spotlight/dive-layout-guest-list-seating-tools-todd-harper),
[Aisle Planner — Samantha Joder's tips](https://aisleplanner.com/blog/feature-spotlight/samantha-joders-top-layout-guest-seating-tool-tips),
[That's The One — floorplans (competitor)](https://www.thatstheone.com/planners/wedding-guides/floorplan),
[Prismm wedding planning software](https://prismm.com/wedding-planning-software),
[Prismm floor plan guide](https://prismm.com/blog/how-to-design-a-wedding-floor-plan-with-seating-style-ideas),
[PerfectTablePlan — weddings](https://www.perfecttableplan.com/html/weddings_and_celebrations.html),
[PerfectTablePlan — escort cards](https://www.perfecttableplan.com/html/escort_cards.html),
[PerfectTablePlan — tour](https://www.perfecttableplan.com/html/tour.html),
[Wedibox — seating chart on website](https://app.wedibox.com/help/seating-chart-on-website),
[Wedibox — find your seat](https://app.wedibox.com/help/guests-find-your-seat),
[Wedibox — add and arrange tables](https://app.wedibox.com/help/add-and-arrange-tables),
[Seatbee (Product Hunt)](https://www.producthunt.com/p/seatbee),
[Tablecharm (Product Hunt)](https://www.producthunt.com/products/tablecharm),
[WedSites seating charts](https://help.wedsites.com/en/articles/14456409-seating-charts),
[Joy seating guide](https://withjoy.com/blog/how-to-create-a-wedding-seating-chart-step-by-step-guide-etiquette-rules/),
[Tableplanner — Joy comparison (competitor)](https://www.tableplanner.io/compare/joy-alternative),
[Bridebook guest list](https://bridebook.com/uk/wedding-planning-tools/guestlist),
[Bemerri meal labelling](https://welcome.bemerri.com/help/meal-labeling).

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
- **A 3D view** (Prismm) and **a scrolling chart on a screen at the venue**
  (PerfectTablePlan). Expensive, and nobody asked; the print pack covers the day.
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
the whole household; one person can still be moved alone (The Knot's forum is
a record of what forcing the whole party costs).

**Colour by** (a view switch, not stored): side, a tag, or the answer to one
`single_select` RSVP question — typically the meal choice, if the couple asks
one. Each answer gets a colour and a key; chips in the tray, on table cards,
in chairs and in the print views use it. This is what Aisle Planner, Prismm
and Bemerri call meal indicators, built from questions the RSVP already asks
(`rsvp_questions` / `rsvp_answers`) — **no meal schema** (Q18).

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

**Clearance rings** (a toggle): a faint outline around each table at chair
depth + walkway (default 120 cm beyond the table edge), so a crowded room is
visible at a glance — Aisle Planner's "service area guides". Drawn, not
warned on (Q6).

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
| `names` | Entrance board | Alphabetical by surname: name → table, in the **site's own fonts and colours** (spec 31's tokens) at poster size, so it can go straight to a print shop as a PDF. |
| `catering` | Caterer | Per table: adults / children / infants / reserved, each dietary line, and — if a "Colour by" question is chosen — counts per answer (e.g. 5 beef, 3 fish); totals. |
| `escort` | Escort cards | One small card per guest: name and table (and the colour-by answer's colour dot if chosen), alphabetical, 8–10 per A4. Table-level, so they work before chairs are chosen — the difference from place cards. |
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
| 4 | Print `tables`/`names`/`catering`/`escort`; colour-by; CSV. | **Yes — the venue and caterer get what they need.** |
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
| 6 | Place cards: name + table only, or a dietary/meal marker too? Spacing: overlap warning only, or also a minimum walkway between tables? | **Name + table, plus the colour-by dot if one is chosen** (PerfectTablePlan users print meals on place cards for the servers). **Overlap warning + clearance rings drawn, no walkway warning.** |
| 7 | Calibration (two points + a real distance) — keep, or position by eye over the image only? | **Keep, optional.** It's one small dialog and makes `near` meaningful. |
| 8 | Are the two of you entered as guests? If not, the head table uses reserved seats (also good for vendor meals). | **Reserved seats** either way — tell me if you're already guest records. |
| 9 | Do snapshots include pair/accessibility rules? | **No** — those are facts about people, not about a layout. |
| 10 | "Your table": show tablemates' names? | **Off by default**, a switch on the block. |
| 11 | Before the reveal date, hide the block or show "Table plan coming soon"? | **Hide it.** |
| 12 | After the reveal, should moving someone notify them? | **No** — the page just shows the current table. |
| 13 | Table names: "Table 1, 2…" by default, renamable? | **Yes.** |
| 14 | Deleting a table: confirm only, or undo too? | **Confirm only** (snapshots now cover bigger mistakes). |
| 15 | **Auto-seating.** The core spec said "V4 or never", but PerfectTablePlan, Seatbee, Tablecharm and WedSites all sell one-click seating from together/apart rules now. Reopen it? | **Not in this build. If you want it, a modest "Seat the rest" button as a final step:** places unseated households into empty chairs, keeping households and `together` pairs whole and never breaking `apart`/`avoid_table`/`accessible`; never moves anyone already seated; shows what it did and can be undone by a snapshot it takes first. Not an optimiser. |
| 16 | **Day-of name search + a QR code** on the entrance sign (Wedibox, Tablecharm). Our household pages can't serve a QR that works for everyone. Add a separate search page, live only on the event day? | **No.** It lets anyone with the code search who's coming. The household page (Part F) plus the printed entrance board covers it. If yes: only during a window you set, and only exact full-name matches. |
| 17 | **A read-only link for the venue / caterer** (WeddingWire emails it, Prismm invites vendors)? | **No — the print pack as PDFs.** A live link changes under them after they've planned staffing. |
| 18 | **Meal choices:** rely on a `single_select` RSVP question for "colour by" and the catering counts, or make meal choice a first-class field? | **The RSVP question.** It already exists, already shows on the RSVP form, and needs no migration. |

## Build status (2026-10-14)

Built on branch `claude/spec-33-seating-plan`, every step in §10, each committed
separately. **No PR opened.** Every §13 question took its recommendation (see
**Answered**).

**What exists**

- **`0036_seating.sql`** — all six tables of §5, both functions, RLS, audit
  triggers (snapshots on the exception list). `supabase/tests/19_seating.sql`
  adds **45 assertions** (tenancy against the second account, the cross-event
  FK, one place per guest, one guest per chair, every branch of the rules
  check, the restore round trip including a guest deleted in between, the
  automatic "Before restoring" copy, audit firing on a move).
- **`src/lib/seating/`** — `geometry` (sizes, chairs, overlap, distance,
  snapping, calibration), `model`, `tray`, `warnings`, `colour`, `moves` (the
  screen's optimistic copy of the swap rule), `listings` (print + CSV shapes).
  **38 unit tests** in `seating.test.ts`.
- **`src/server/actions/seating.ts`** / **`src/server/queries/seating.ts`** —
  every write in §6–§9; one read for the screen.
  `src/server/queries/seating-public.ts` is the household-page read (Part F).
- **Screens:** `/seating` (picker, as `/run-sheet`), `/events/[id]/seating`
  (Tables and Room views, tray, table drawer with chairs, rules, saved copies,
  reveal date), `/events/[id]/seating/print?view=tables|names|catering|floor|escort|cards`.
  Linked from each event on `/events` ("Seating →") and lit under the nav's
  Events item.
- **CSV:** a `seating` kind on `/api/export/[kind]` (`?event=` for one event;
  every planned event in the "Download everything" zip).
- **Site block:** `your_table` (family "the day", personal).

**Where the build departs from the text**

1. **`take_seating_snapshot` / `restore_seating_snapshot` take `p_created_by`
   from the app** rather than reading `auth.uid()` inside. An invoker-rights
   function can only call `auth.uid()` where the role has usage on the `auth`
   schema; the test shim doesn't grant it, and passing it in is how
   `vendor_notes.author_id` already works.
2. **The `your_table` block has no event picker.** The builder's field kinds
   have no dynamic select, so the block shows every event whose seating has
   been revealed (one line per event when there's more than one). Payload is
   `{intro, show_seat, show_tablemates}`.
3. **Chairs are placed by tap only, not drag**, inside the table drawer (tap a
   guest or chair to pick up, tap a chair to put down; a taken chair swaps).
   Dragging chips between tables and the tray works in both views.
4. **On a phone the tray sits above the tables**, not in a bottom sheet (§6.1).
   Tap-to-place makes this workable; a bottom sheet is a follow-up if it isn't.
5. **"Place" for an unplaced table drops it in the middle of the current view**
   (a button), rather than dragging it in from the strip.
6. **Calibration asks for the distance in a browser prompt** ("How far apart
   are those two points, in metres?") rather than an inline field.
7. The **floor-plan print** draws tables, chairs and fixtures but not the
   venue image.

**What was seen, and what wasn't**

- **Automated:** typecheck clean; **1047 unit tests**; `verify-migrations.sh`
  **586 assertions**; `verify-migrations-single-tx.sh` passes; `next build`
  (placeholder env) passes.
- **Seen in headless Chromium, with sample data and no database** (a temporary
  page, deleted, never committed): the Tables view, tap-to-place, the warnings
  list, the table drawer with chairs, the Room view (to scale, chairs coloured
  by a meal answer), a phone-width layout, a **mouse drag of a guest onto a
  table** (seated at once), and **dragging and rotating a table** in the Room
  view (snaps to 25 cm, turns 90°). That pass found and fixed three things: a
  hydration mismatch from dnd-kit's ids, a table name truncated on its card,
  and labels too big for small tables.
- **Not seen:** anything against Supabase — no action has ever run, so no
  save, restore, upload, calibration or reveal has been exercised end to end;
  touch drag and pinch on a real iPad; the print views on paper (or at all —
  they need data from the database); the `your_table` block on a real
  household page.

**Pick up here:** apply `0026`–`0036` to the live project (in order; `0036`
needs `0034`'s view and `0035`'s `audit_row()`), then on an iPad: add tables to
the reception, seat a household by dragging and by tapping, open a table and
place chairs, switch to Room, upload the venue plan and set the scale, save a
copy and restore it, print "By table" and "Escort cards", set a reveal date in
the past and open a household's page with a "Your table" section.
