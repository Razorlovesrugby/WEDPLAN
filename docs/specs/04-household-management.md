# Feature spec: Household editing and moving guests between households

**Status: built. Scope was narrow enough, and directly requested, that this
spec folds the decisions in as "Decided" rather than leaving an Open
Questions section to block on — see section 6. No migration: this feature
changes zero schema. `typecheck`, `npm test` (186 tests, 5 new), and
`npm run build` all pass. Not opened in a browser — same live-project caveat
as specs 1–3 (`docs/HANDOFF.md` section 0); nothing here was verified against
an actual rendered page.**

## 1. What this is

V1 already lets a planner create, rename and remove a household
(`HouseholdForm`), and add or remove guests one at a time. What it never
supported is the single most common guest-list cleanup task: **a guest is
attached to the wrong household, and needs to move to another one** — a CSV
import grouped two families under one row, a couple got engaged and now
share an address, a "+1, name TBC" turned out to be someone who's on the
list in their own right. Before this spec the only way to do that was delete
the guest from one household and recreate them in the other, losing their
RSVP history, tags, and notes in the process.

This spec adds guest-to-household moves as a first-class action, reachable
from every screen a guest can be found on, and makes creating the
destination household part of the same flow rather than a separate trip.

## 2. Scope

**In:**
- `moveGuest` / `moveGuests` server actions — reassign one or many guests'
  `household_id` in a single update.
- A reusable `HouseholdPicker` combobox: type to filter, click to move, or
  create a brand-new household inline and move there in one step.
- Wired into three places: the household page (move one member, or move
  every current member at once), the guest detail page (move this guest),
  and the guests table's bulk-selection bar (move N selected guests at
  once, from anywhere in the filtered list).

**Out, explicitly:**
- No "merge households" concept in the schema or the UI. Folding household A
  into household B is just moving every member of A to B — the "move all
  members" button *is* the merge action, with no separate table state to
  keep in sync and no separate code path to maintain.
- No automatic handling of `plus_one_for` (see section 6, decision 2).
- No change to `households.rank` on a move. A newly-created destination
  household still lands at the bottom of the ranking via the existing
  `createHousehold` action (unchanged); moving guests into an *existing*
  household doesn't touch that household's rank, because a household's
  position in the cut-line order is a fact about the household, not about
  who's currently in it.
- No bulk household-to-household merge UI beyond what "move all members"
  already gives you (select the source household, move all, the empty
  household stays behind for the planner to rename, reuse, or delete
  manually — see decision 4).

## 3. Data model — none

No migration. The only column that changes is `guests.household_id`, which
already exists (`0001_core_schema.sql`), and everything downstream is
already derived live from it:

- `v_households.head_count` / `seat_count` / `tier` — computed per-household
  from the live `guests` rows (`0003_derived_views.sql`), not stored. Move a
  guest, the counts and tiers on both households are correct on the next
  read, with nothing to recompute or invalidate.
- `v_household_rsvp` — same: computed by joining `rsvps` through
  `guests.household_id`, so a moved guest's RSVP state follows them
  automatically.
- Tenancy is already enforced by the composite foreign key
  `guests (household_id, wedding_id) references households (id, wedding_id)`
  — a move that tried to target another wedding's household is a constraint
  violation before it's anything else. The action does a friendlier lookup
  first (section 5) so that shows up as a message, not a raw Postgres error,
  but the constraint is what actually makes it safe.

This is, deliberately, the cheapest possible feature to add to this schema —
`docs/HANDOFF.md`'s "tier is not a column" design point is exactly what
makes a guest move a single-column update instead of a batch of rollups to
fix up.

## 4. Screens

| Route | What's new |
| --- | --- |
| `/households/[id]` | Each row under "Members" gets a "Move" picker; the section header gets "Move all members…", which moves every current member of this household to another one in a single action |
| `/guests/[id]` | "Move to a different household…" next to the guest's name, alongside which household they're currently in |
| `/guests` | The bulk-selection bar (already used for tag add/remove) gains "Move to household…", operating on every currently-selected guest regardless of which page or filter surfaced them |

No new route. Nothing here needed one — the picker is a component, not a
screen.

## 5. Server actions

`src/server/actions/guests.ts`:

- `moveGuests(guestIds: string[], targetHouseholdId: string)` — validates
  both inputs with `zod`, confirms the target household exists, belongs to
  the current wedding, and isn't soft-deleted (a friendly `fail(...)` if
  not, rather than a raw FK error), then updates every guest whose id is in
  the list **and** whose `wedding_id` matches the caller's wedding — the
  same "never trust an id from the client beyond what the wedding scope
  allows" pattern every other action in this file already follows. Revalidates
  `/guests`, `/guests/rank`, the destination household's page, every
  *origin* household page (guests can come from more than one household in
  a bulk move), and every moved guest's own detail page.
- `moveGuest(guestId: string, targetHouseholdId: string)` — thin wrapper
  over `moveGuests` for the single-guest call sites, returning the plain
  `ActionResult` shape those call sites already expect (`HouseholdForm`,
  `GuestForm` and friends use the same `ok(undefined)` / single-id
  convention throughout this file).

No new query. `listHouseholds` (`src/server/queries/guests.ts`) already
returns everything the picker needs (`id`, `display_name`, `address`) for
in-memory filtering, so the three pages that now render a `HouseholdPicker`
each call it once alongside whatever they already fetch.

`src/lib/household-search.ts` — the picker's filter logic, pulled out as
pure code per `docs/HANDOFF.md` section 8 ("pure logic lives in `src/lib/`,
not beside the action or component that uses it") specifically so it's
unit-tested directly rather than only exercised through a rendered
combobox: case-insensitive substring match against name and address, 5
tests in `household-search.test.ts`.

## 6. Decisions

These would ordinarily be an Open Questions section per `docs/specs/README.md`'s
process, but the feature was requested directly and every question here has
a low-risk default that matches an existing pattern elsewhere in the app —
so they're recorded as decisions, the way spec 2 folded its own open
questions in once answered.

**1. Does moving a guest touch their rank or tier?** No. Rank belongs to
the household, not the guest — moving someone into household B puts them
under B's existing rank, wherever that currently sits in the cut line. If
that's not where the planner wants it, that's what `/guests/rank` is for;
this feature doesn't duplicate it.

**2. What happens to `plus_one_for` on a move?** Nothing, deliberately. A
guest who is somebody's `+1` and gets moved away from them, or a guest with
a `+1` of their own who gets moved without them, is left exactly as
recorded — the schema doesn't require a `+1` to share a household with the
guest they're a `+1` for, and silently rewriting that link on a move would
be a bigger, less visible action than "move this one guest" implies. This
mirrors the existing `on delete set null (plus_one_for)` behaviour: the
system clears the pointer only when the referenced guest is gone, never
speculatively.

**3. What happens to household-scoped RSVP answers and the invitation on a
move?** They stay with the origin household. `rsvp_answers` scoped to a
household (the "message to the couple" style questions) and `invitations`
are keyed by `household_id` directly, not derived from guest membership, so
a guest who moves takes their own per-guest answers and RSVP rows with
them (both keyed by `guest_id`) but leaves household-scoped ones behind.
Documented here as a known limitation rather than solved, the same way spec
1 documents its own simplifications — fixing it would mean deciding what
"the household's RSVP" even means once its membership isn't fixed, which is
a bigger question than this spec's scope.

**4. Does emptying a household by moving everyone out delete it?** No.
"No destructive writes to guest data" is a rule that spans this whole app
(`docs/wedding-platform-spec.md`, rules section, point 5); an empty
household left behind by "move all members" is inert, not lost — still
visible on `/guests/rank`, still renamable, still deletable by hand through
the existing `removeHousehold` action if the planner actually wants it
gone. Auto-deleting it would be one unrequested destructive action riding
on top of a requested non-destructive one.

## 7. Test plan

- Unit: `src/lib/household-search.test.ts` — blank query returns
  everything, name match, address match, a household with no address
  doesn't throw, no match returns empty. 5 tests, all passing.
- `npm run typecheck` — clean.
- `npm test` — 186 tests passing (181 existing + 5 new), no regressions.
- `npm run build` — clean (verified locally against dummy Supabase env
  values; no live project reachable from this session, same gap
  `docs/HANDOFF.md` section 0 has flagged since session 3).
- `./scripts/verify-migrations.sh` — not run. Nothing in this feature
  touches `supabase/migrations/`, so there is nothing for it to check; it
  also refuses to run as this container's root user regardless (see the
  script's own guard, noted in the README).
- **Not done: opened in a browser.** The picker is a plain combobox (no
  drag, no virtualisation), so it's the least exposed surface in this app to
  the rendering-vs-typecheck gap `docs/HANDOFF.md` section 6 warns about —
  but "least exposed" isn't "verified." Before trusting this in real use:
  move a guest from the household page and confirm the source and
  destination member lists both update; move a guest to a brand-new
  household via "+ Create … and move here" and confirm it lands at the
  bottom of `/guests/rank`; select several guests on `/guests` (ideally
  under different filters) and bulk-move them; confirm a moved guest's
  tier and their new household's head count both reflect the move
  immediately, with no separate refresh needed beyond the page's own.

## 8. Build order

1. `src/lib/household-search.ts` + unit tests — done.
2. `moveGuests` / `moveGuest` in `src/server/actions/guests.ts` — done.
3. `HouseholdPicker` (`src/components/guests/household-picker.tsx`) — done.
4. Wired into `/households/[id]`, `/guests/[id]`, and the `/guests` bulk bar
   — done.
5. Full check pass (`typecheck`, `npm test`, `npm run build`) — done, all
   green. Browser pass — not done, per section 7.
