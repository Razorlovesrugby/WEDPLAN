# Feature spec: Multi-cut guest lines, and a day-of run sheet

**Status: proposed. Two unrelated features in one file, at the planner's
request — see below. Neither has been built. Per `docs/specs/README.md`,
nothing beyond schema gets built until each part's Open Questions section
has answers; the two parts have separate Open Questions and can be answered
and built independently of each other.**

**Depends on:** V1 only, for both parts. Neither reads or writes vendors,
budget, or Gmail. Part B reads `events` (V1) and, optionally, sits next to
spec 1's list/timeline infrastructure without requiring it.

Why these two share a file rather than getting their own numbers: the
planner asked for three features in one request and specifically asked for
two spec documents, not three. Cut lines and the run sheet are the closer
pairing of the three — both are "day-of guest-list mechanics" (who's coming,
and what happens once they're there) as opposed to money, which is spec 6.
They do not share schema, screens, or code, and are written as fully
separable parts — Part A could ship without Part B and vice versa.

---

# Part A — Multi-cut guest lines

## A1. What this changes

V1 shipped with **exactly two** configurable cut lines, hard-coded as two
columns on `weddings` (`cut_rank`, `tier_b_rank`), producing exactly three
tiers: **A** (invited, within capacity), **B** (waitlist), **C** (the rest).
That was a deliberate V1 simplification — `docs/wedding-platform-spec.md`
describes tier as "A above cut_rank, B within a configured band, C beyond"
with no mention of more than one waitlist band.

In practice, a two-tier waitlist isn't enough for how invitations actually
go out in waves: "definitely inviting," "would love to have," "if the
venue frees up," "long-shot / evening only" are four different lists a
planner reasons about, not two. This part generalises the cut-line system
from a fixed 2 lines / 3 tiers to **however many lines the planner wants**,
each with its own name.

## A2. Scope

**In:**
- A planner can add, remove, rename, and reorder cut lines from `/settings`
  and `/guests/rank`, the same two surfaces that already manage the two
  existing lines.
- Every tier's label is planner-chosen text (not a fixed A/B/C enum) —
  defaults to "A", "B", "C", "D"… on creation so existing weddings and new
  ones both start somewhere sane, but "Definitely", "Maybe", "Long shot" is
  equally valid.
- Colour and every screen that currently branches on `tier === "A"` (or
  `"B"`/`"C"`) is regeneralised to branch on **tier position** (0 = the top
  tier, the one that counts toward capacity) instead of the literal label.
- The existing single-line behaviour (`cut_rank` set, `tier_b_rank` null →
  "one undivided waitlist") is preserved exactly as today's default state:
  a wedding that has never touched this feature keeps working identically.

**Out, explicitly:**
- No per-tier capacity of its own (e.g. "tier B is capped at 20"). A tier's
  size is still just "however many households sit between this line and
  the next," same as today — no schema for a second capacity number.
- No guest-facing exposure of tier or waitlist language. `/rsvp/[token]`
  and `/w` already don't reference tier today and this part doesn't change
  that.
- No automatic re-invitation workflow when a decline frees a seat beyond
  what already exists (`/guests/rank` already suggests the next household
  that fits — see A5, that logic is preserved, just generalised past "the
  next tier-A candidate").

## A3. Data model

Replace the two fixed columns with a table, so "how many lines" becomes
data instead of schema:

```
cut_lines   id, wedding_id, label (text), position (smallint),
            boundary_rank (text, nullable), created_at, updated_at
```

- `position` is 0-indexed and defines line order top to bottom. `unique
  (wedding_id, position)`.
- `boundary_rank` is the rank of the **last household in this tier** —
  directly equivalent to today's `cut_rank` / `tier_b_rank`. The **last**
  line by position always has `boundary_rank = null`, meaning "no lower
  bound — catches everyone the lines above didn't." This generalises
  today's "`tier_b_rank` null means one undivided waitlist" rule uniformly
  to every position instead of special-casing just the second line.
- A wedding always has **at least one row** — "no cut lines configured" as
  a concept goes away; it becomes the trivial case of one line with
  `boundary_rank = null`, which is exactly today's "`cut_rank` is null,
  everyone is tier A" state, just represented as data instead of a null
  check. `deleteCutLine` on the last remaining line is refused at the
  action layer.
- `household_tier` as a fixed three-value enum is dropped. `v_households.tier`
  becomes plain `text` (the `cut_lines.label` the household falls under).
- `v_households` gains **`tier_position`** (int) alongside `tier` (text).
  Every place that today means "tier A specifically" (dashboard's
  "above-cut" stats, `/guests/rank`'s "eligible to fill a freed seat"
  suggestion) is rewritten to mean **`tier_position = 0`** — the top tier,
  whatever it's currently named. Nothing has to know or care what position
  0 is called.

**Migration (new file, e.g. `0008_multi_cut_lines.sql`):**
1. Create `cut_lines`, add to the RLS `tenant_tables` array
   (`supabase/migrations/0002_row_level_security.sql`'s pattern).
2. Backfill one `cut_lines` row per existing wedding per current line:
   `('A', 0, cut_rank)`, and — only if `tier_b_rank` is not null or
   `cut_rank` is not null — `('B', 1, tier_b_rank)`, then always a trailing
   `('C', <next position>, null)` so every wedding ends up with the same
   effective A/B/C split it has today, just stored as rows.
3. Rewrite `v_households`'s `tier` CASE as a lateral join against
   `cut_lines` ordered by `position`, picking the first row where
   `boundary_rank is null or h.rank <= boundary_rank`; add `tier_position`
   from that same row's `position`.
4. Rewrite `v_wedding_stats`'s `tier = 'A'` filters to `tier_position = 0`.
5. Drop `weddings.cut_rank`, `weddings.tier_b_rank`, and the
   `household_tier` enum.

## A4. Code changes required

This is the bulk of the work — the two-tier assumption is spread through
the UI more than the schema:

- `src/lib/tier.ts` — `tierFor(rank, cutRank, tierBRank)` becomes
  `tierFor(rank, cutLines: {label, position, boundaryRank}[])`, walking the
  ordered array instead of two named parameters. `tier.test.ts` and
  `supabase/tests/02_derived.sql` both get rewritten to the new shape —
  they currently assert the exact two-line behaviour one for one, per
  `tier.ts`'s own comment.
- `src/components/settings/cut-line-picker.tsx` — becomes a repeatable
  list: one row per configured line (household picker + label input, same
  "pick the last household in this tier" interaction as today), "Add
  another line" appends a new row above the trailing catch-all, drag or
  up/down reorders `position`, a remove control on every row except when
  it's the only one left.
- `src/components/rank/rank-list.tsx` — tier colour swatch
  (`tierColour`/`TIER_STYLE` in `guests-table.tsx` too) moves from a 3-way
  ternary on `"A"|"B"|"C"` to indexing a fixed palette array by
  `tier_position`, cycling if there are more lines than swatch colours
  (open question A6.4).
- `src/lib/filters.ts` — `tier: z.enum(["A","B","C"])` becomes a plain
  string, validated against the wedding's actual configured labels at
  query time rather than a compile-time enum.
- `tailwind.config.ts`'s `tierA`/`tierB`/`tierC` tokens are replaced by an
  ordered palette (`tierColors: string[]`) sized to the chosen cap (A6.4).
- `src/server/actions/rank.ts` — `setCutLine(householdId, which: "a"|"b")`
  becomes `setCutLine(householdId, lineId: string)`, reading and writing a
  `cut_lines` row by id instead of a fixed `which` branch. New actions:
  `addCutLine`, `removeCutLine`, `reorderCutLine`, `renameCutLine` —
  same "read the household's own rank server-side, never trust a rank
  string from the client" rule `setCutLine` already follows
  (`docs/HANDOFF.md` section 5, point 3).

## A5. Screens

| Route | What's new |
| --- | --- |
| `/settings` | `CutLinePicker` becomes the repeatable list from A4, same section it's already in |
| `/guests/rank` | Same picker inline, plus every tier badge/colour now reads N possible tiers instead of 3; the "suggest next household when a seat frees up" logic keys off `tier_position !== 0` (i.e. "not already in the top tier") rather than `tier !== "A"` |
| `/guests`, `/guests/[id]`, `/households/[id]`, export CSV | Tier badge renders whatever label + palette colour the household's `tier_position` resolves to; filter dropdown is populated from the wedding's actual configured labels, not a fixed list |

## A6. Open questions

1. **Cap on the number of cut lines?** Unbounded is simplest to build but a
   palette needs a finite size (A6.4) and an unbounded reorder list gets
   unwieldy in the UI. Suggest a soft cap (e.g. 8) enforced at the action
   layer, generous enough for "four invitation waves" with room to spare.
2. **Can two adjacent lines share a `boundary_rank`** (a zero-width tier —
   "Definitely" and "Would love" both end at the exact same household)?
   Simplest answer: allowed, the tier is just empty until the planner drags
   something into it. No schema constraint needed either way.
3. **Deleting a line that has households sitting in the tier below it** —
   do those households move up into the tier above the deleted line, or
   does the tier below simply absorb them by inheriting the deleted line's
   old boundary? The latter needs no data change (removing the row alone
   does it, since tier is fully derived) — recommend that, and note it
   explicitly on the confirm dialog ("removing this line merges its tier
   into the one below").
4. **Colour palette size and assignment** — fixed list of N preset colours
   cycling by position (simplest, matches today's fixed `tierA/B/C`
   tokens), or planner-choosable per line? Recommend fixed palette sized to
   the cap from A6.1, planner choice is a nice-to-have, not core to the
   feature.
5. **Does `weddings.capacity` / the dashboard's "over/under capacity"
   messaging need to say anything about lines beyond the first**, e.g. "42
   in tier A, 18 more in tier B if 5 decline"? Out of scope for this pass
   unless wanted — the existing dashboard only ever reasoned about tier A
   vs. capacity.

## A7. Test plan

- `src/lib/tier.test.ts`, rewritten for the array-based `tierFor` — same
  cases as today (line unset = everyone in, single line = one waitlist,
  trailing line always catches the remainder, rank comparison is byte-order
  per the `COLLATE "C"` rule) plus new cases for 3+ lines and for deleting
  a middle line.
- `supabase/tests/02_derived.sql`, same rewrite, kept mirroring `tier.ts`
  one for one per its own stated purpose.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build`.
- Browser pass: configure 4 cut lines on a seeded wedding, drag a household
  across every line, confirm colours/badges update on `/guests/rank`,
  `/guests`, and the household/guest detail pages without a manual refresh;
  delete a middle line and confirm the merge behaviour from A6.3; confirm
  `/settings` refuses to remove the last remaining line.

---

# Part B — Day-of run sheet

## B1. What this is

Spec 1's lists/timeline covers **planning tasks with a due date** — "book
the florist by March," "send save-the-dates by January." It has no concept
of a **time-of-day schedule with durations**: "ceremony 2:00pm, sharp,"
"speeches start when the mains are cleared, roughly 45 minutes after
they're served," "photographer's call time is 1:00pm." That's a different
shape of data — `docs/wedding-platform-spec.md`'s V3 names it "run of show"
and sketches `timeline_items` with a pinned/predecessor/offset cascade
specifically because "move the ceremony fifteen minutes and everything
downstream shifts" isn't computable from a flat list of absolute times.
This part pulls a scoped version of that forward, ahead of full V3 (no
seating, no printed pack, no vendor table — those still don't exist).

## B2. Scope

**In:**
- One run sheet per `events` row (an event already models "which day/
  occasion" — rehearsal dinner, ceremony, reception each get their own if
  the wedding has more than one).
- Items with a title, location, free-text owner ("best man," "DJ,"
  "venue coordinator" — no FK, see below), a track (`guests | couple |
  vendors | other`, for filtering a busy day down to one thread), and a
  duration.
- **Pinned items** carry a real wall-clock time and never move on their
  own (ceremony start, a venue-contracted vendor slot).
- **Unpinned items** chain off a predecessor: "starts when the previous
  item ends, plus an optional gap." Move or resize the item they depend
  on, everything downstream recomputes — no stored time to go stale.
- A non-blocking warning when a chain's computed time would run past the
  next pinned item, same "warn, never hard-block" rule V3 specifies for
  seating constraints — the planner is allowed to be behind schedule on
  paper.
- `guest_visible` flag per item, schema only (see B6.3 — publishing to
  `/w` is explicitly out of scope for the wiring in this pass).

**Out, explicitly:**
- No vendor table, no vendor FK on `owner` — that doesn't exist until
  budget/vendors ships (spec 6 doesn't add it either, see spec 6 §2). Owner
  is free text, same reasoning as spec 4's "no premature abstraction."
- No printed pack / PDF export, no per-vendor filtered export. That's V3's
  "printed pack" section wholesale, a materially bigger and different
  problem (server-side rendering, function duration limits) than the data
  model and screen this part adds.
- No sync with spec 1's lists/reminders. The planner asked budget to sync
  with lists/reminders; they didn't ask that of the run sheet, and a
  same-day schedule of minutes doesn't obviously belong in a due-dates
  digest that fires weekly. Treated as a deliberate non-goal, revisit if
  wanted.
- No auto-seating, no floor plan — unrelated, still V3.

## B3. Data model

```
run_sheet_items   id, wedding_id, event_id, title, notes, location, owner,
                  track (guests|couple|vendors|other),
                  pinned (bool), pinned_at (timestamptz, set iff pinned),
                  duration_minutes (int),
                  predecessor_id (self FK, nullable),
                  offset_minutes (int, default 0),
                  guest_visible (bool, default false),
                  sort_order, created_at, updated_at
```

- `predecessor_id` is null for a pinned item (it's its own anchor) and
  required for an unpinned one — enforced at the action layer, same
  pattern as spec 1's "one level of sub-items" rule
  (`list_items.parent_item_id`), not a check constraint, since "is this
  item's chain well-formed" needs to see the whole graph, not just one row.
- **`v_run_sheet_items`** (view, `security_invoker = true` per the existing
  convention) computes `starts_at` / `ends_at` for every item with a
  recursive CTE: pinned items use `pinned_at` directly; an unpinned item's
  `starts_at` is its predecessor's computed `ends_at` plus `offset_minutes`,
  and `ends_at = starts_at + duration_minutes`. This is "derived, not
  stored," the same rule `tier` and `seats_cumulative` already follow in
  `v_households` — move a pinned anchor, nothing downstream needs a write.
  The view also emits a `conflict` boolean per item: true when its computed
  `ends_at` runs past the next pinned item (by time, same event) that
  sits after it in the chain.

**Migration (new file, e.g. `0009_run_sheet.sql`):** create
`run_sheet_items`, add to RLS `tenant_tables`, create `v_run_sheet_items`.

## B4. Screens

| Route | What it does |
| --- | --- |
| `/run-sheet` (or `/events/[id]/run-sheet` if the wedding has more than one event with items — B6.1) | Chronological list of items for the day, grouped by track or shown as parallel columns, computed times from `v_run_sheet_items`, conflict rows flagged |
| Item editor (dialog, not a route) | Title/location/owner/track/duration; pin toggle switches between a time picker (pinned) and a predecessor + offset picker (unpinned); live-previews the computed start time as the form changes |

Reordering within an unpinned chain is "change the predecessor," not a
drag — dragging a item to a new slot in the list re-points its
`predecessor_id` (and the item that used to follow the old predecessor now
follows this one, keeping the chain intact), mirroring how `moveHousehold`
in spec 4's sibling feature treats a drag as "compute the new relationship
server-side," not a client-supplied position.

## B5. Server actions & queries

`src/server/actions/run-sheet.ts`: `createRunSheetItem`,
`updateRunSheetItem` (title/location/owner/track/duration/notes),
`pinRunSheetItem(id, at)` / `unpinRunSheetItem(id, predecessorId,
offsetMinutes)`, `reorderRunSheetItem` (re-points predecessors per B4),
`deleteRunSheetItem` (refuses, or re-links, if another item's
`predecessor_id` points at it — same "don't silently orphan a chain" rule
as spec 1's parent/sub-item handling).

`src/server/queries/run-sheet.ts`: `listRunSheetItems(eventId)` reading
`v_run_sheet_items`, ordered by computed `starts_at`.

## B6. Open questions

1. **One run sheet per event, or one shared day-of schedule spanning
   multiple events** (rehearsal dinner the night before, ceremony and
   reception the day of), with `event_id` just a grouping tag rather than
   a hard partition? Most weddings in this app are single-event so far
   (`events` already supports many); recommend scoping predecessor chains
   to stay within one event — a chain crossing midnight into a different
   event is more confusion than it saves.
2. **What does a conflict actually do in the UI** beyond the flag — a
   banner on the item, a summary count at the top of the page, both?
   Recommend both, non-blocking either way per B2.
3. **`guest_visible` wiring to `/w`** — build the column now and leave the
   public site untouched (current plan), or is publishing the guest-facing
   schedule part of what "run sheet" means to the planner? If the latter,
   this needs its own screens-section addition and touches `site_content`,
   which is a meaningfully bigger scope than a planner-only tool.
4. **Multiple independent chains on one event** (a "guests" track running
   ceremony → drinks → speeches → cake in parallel with a "vendors" track
   running photographer call time → band load-in → sound check, neither
   depending on the other) — already possible today since `predecessor_id`
   only needs *some* upstream item, it doesn't have to be same-track. Worth
   confirming the UI actually makes two parallel chains legible (parallel
   columns per track, per B4) rather than one interleaved list.
5. **An unpinned item with no predecessor at all** (the planner adds one
   before deciding what it follows) — reject at save time and require
   either a pin or a predecessor before the item is created, or allow it
   and show "time TBD" until one is set? Recommend the latter — matches
   this app's general preference for permissive intermediate states (e.g.
   a household with no rank neighbour) over blocking saves.

## B7. Test plan

- Unit: the recursive time-computation logic, if written in `src/lib/`
  rather than purely in SQL (recommend a `src/lib/run-sheet.ts` pure
  function mirroring the view's logic, same "duplicate deliberately, test
  against the SQL suite" pattern `tier.ts` already uses) — pin resolution,
  chain resolution, conflict detection, an item with no predecessor.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build`.
- Browser pass: build a same-day chain of 6+ items mixing pinned and
  chained, move a pinned anchor and confirm every downstream time updates
  with no page refresh beyond the action's own `revalidatePath`; force a
  conflict (extend an item's duration past the next pin) and confirm the
  warning renders; re-point a predecessor via drag and confirm the chain
  stays connected on both sides of the move.

## B8. Build order

1. `0009_run_sheet.sql` — table, RLS, view.
2. `src/lib/run-sheet.ts` (pure chain/conflict logic) + unit tests.
3. `src/server/actions/run-sheet.ts`, `src/server/queries/run-sheet.ts`.
4. `/run-sheet` screen: read-only chronological list first, item
   editor second, drag-to-repoint last.
5. Full check pass + browser pass per B7.

Part A's build order is the same shape (migration → `tierFor` rewrite and
its tests → actions → `CutLinePicker` rewrite → wire into `/settings` and
`/guests/rank` → check + browser pass) and is omitted here for brevity
since A3–A5 already state each piece explicitly.
