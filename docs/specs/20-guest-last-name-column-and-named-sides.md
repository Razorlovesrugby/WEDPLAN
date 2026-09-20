# Feature spec: A last name column and real-name "Side" on the guest list

**Status: proposed, not built — no migration, no code.** This is a spec
only, per `docs/specs/README.md` — nothing here is built until the Open
Questions in §5 are answered.

**Depends on:** V1 (`guests.last_name`, `guests.side` already exist) and
spec 15 (`collaborators.display_name`, already built). No new tables or
columns are needed for the core of this feature — see §3.

## 0. What was actually asked

> Add last name into guest column so can see. Add a "Side" dropdown which
> we can choose Ray or Olivia (as set in the settings so we know who is in
> charge of getting emails etc for who and what not).

Two things worth flagging before the design: both `guests.last_name` and
`guests.side` **already exist in the schema** (`0001_core_schema.sql`),
and a per-guest "Side" dropdown already exists on the individual guest
edit form (`src/components/guests/guest-form.tsx`) with generic labels
("Partner A" / "Partner B" / "Both" / "Other"). What's actually missing is:

1. Last name and Side aren't visible on the **guest list table**
   (`/guests`) at all — only on each guest's own edit page.
2. The Side labels are generic role placeholders, not the couple's real
   names — there's nowhere to see "Ray" or "Olivia" today.
3. A `side` filter already exists end-to-end in the filter/query logic
   (`GuestFilters`, `matches()` in `src/server/queries/guests.ts`) but has
   no control in `FilterBar` — it's currently unreachable from the UI.

This spec is about closing those three gaps, not about adding new guest
fields.

## 1. Last name on the guest list

`GuestsTable` (`src/components/guests/guests-table.tsx`) currently has one
"Name" column that already renders `guestName(guest)` —
`preferred_name || first_name` plus `last_name` joined with a space
(`src/lib/format.ts`). So a guest with a last name on file already shows
it there, just folded into one string rather than a scannable column of
its own, which is presumably why it currently reads as "missing" when
skimming the table.

**Proposed:** split the "Name" column into two — "First name" (what's
currently shown, minus the last name, still linking to `/guests/[id]`)
and a new "Last name" column, inline-editable the same way Email and
Dietary already are (`InlineText` + `updateGuest(guest.id, { last_name })`).
This makes last name scannable and sortable at a glance without changing
what's stored — `guests.last_name` is already there, and `sortGuests`
already sorts by it first (`` `${last_name} ${first_name}` ``) when the
household/rank sorts don't apply.

No schema change. No new server action — `updateGuest` already accepts
`last_name` (see `src/server/actions/guests.ts`).

## 2. Real names on "Side," not "Partner A" / "Partner B"

`guest_side` is a fixed enum: `partner_a | partner_b | both | other`
(`0001_core_schema.sql`). The settings page already solved exactly this
naming problem for task assignment — spec 15 added `collaborators.display_name`
(nullable, editable under Settings → "Names"), and `collaboratorLabel()`
in `src/components/lists/item-row.tsx` already falls back to
`display_name || (role === "owner" ? "Owner" : "Partner")` wherever a
task's assignee is shown.

**Proposed:** reuse the same collaborator names for the Side dropdown
instead of inventing a second settings field for "Ray" / "Olivia":

- `partner_a` displays as the **owner** collaborator's `display_name`
  (falling back to "Partner A" if unset).
- `partner_b` displays as the **non-owner** collaborator's `display_name`
  (falling back to "Partner B" if unset).
- `both` and `other` keep their current generic labels.

This needs a small shared helper (e.g. `sideLabel(side, collaborators)` in
`src/lib/format.ts`) used in three places: the Side `<select>` on
`guest-form.tsx`, a new Side column on `GuestsTable`, and the new Side
filter in `FilterBar` (§4). No settings UI changes — the existing
Settings → "Names" section already sets the values this reads.

**This is the one real design decision in this spec — see §5, question 1.**
Mapping `partner_a`/`partner_b` to "owner"/"non-owner" is a guess at what
the couple would expect, not a fact already established anywhere in the
code. It's plausible but arbitrary: nothing currently says whoever signed
up first ("owner") is "Ray" rather than "Olivia."

## 3. Side column on the guest list

Add a "Side" column to `GuestsTable`, next to Tier, rendering `sideLabel()`
as a small badge (same pattern as the existing tier badge). Not
inline-editable inline in the table — same reasoning as Tier already not
being editable there (it's derived-ish/structural); editing stays on the
individual guest page's existing dropdown.

## 4. Wiring up the existing (dead) Side filter

`GuestFilters` already parses and applies `side` (`src/lib/filters.ts`,
`matches()` in `src/server/queries/guests.ts`), but `FilterBar` has no
control for it — it's unreachable today. Add a "Side" `<select>` to
`FilterBar` next to Tier/Tag, options built from `sideLabel()` so it shows
"Ray" / "Olivia" / "Both" / "Other" rather than the enum values.

## 5. Open questions — nothing beyond this spec is built until these are answered

1. **Does `partner_a` = owner and `partner_b` = non-owner, or does "Ray"
   and "Olivia" need to be assignable independent of who happens to hold
   the `owner` role?** The owner/partner role split exists for auth
   reasons (spec 0/V1), not to model "whose side is whose" — using it for
   that is a repurposing, not a given. If the answer is "no, we need an
   explicit mapping," the fix is small (e.g. a `weddings.side_a_collaborator_id`
   pointer, or just naming the enum values `owner`/`partner` instead of
   `partner_a`/`partner_b` so the mapping is self-evident) but it is a
   real schema decision, not free to assume.

2. **Is "so we know who is in charge of getting emails ... for who" asking
   for a label, or for actual routing?** As written above, Side is purely
   informational — a badge a human reads before deciding who replies to a
   guest. It does **not** change who receives reminder digests, RSVP
   notifications, or any other email the app currently sends (`docs/HANDOFF.md`
   section on reminders — those go to both collaborators regardless of any
   guest's side). If what's actually wanted is "Ray's guests' RSVP
   emails/reminders go to Ray," that's a materially larger feature —
   per-side notification routing — with its own open questions (does
   `both`/`other`/unset go to both collaborators? does it change the
   `v_reminders_due` digest query, or the RSVP-received notification, or
   both?). Nothing in this spec builds that; say so explicitly if it's
   wanted and it'll get its own spec.

3. **Does splitting "Name" into "First name" + "Last name" columns
   (§1) also apply to the CSV exports** (`/api/export/guests`,
   `/api/export/catering`)? They currently export whatever columns
   `csvDocument` is given today — worth confirming whether "so I can see
   it" is scoped to the on-screen table only, or the exports too.

## 6. Test plan (once authorized)

- Unit: `sideLabel()` covering all four enum values with and without
  `display_name` set on either collaborator; `guestName`/sort behavior is
  unchanged so no new coverage needed there.
- `verify-migrations.sh`: unaffected — no migration in this spec.
- Browser pass: confirm the guest list shows first/last name as separate
  columns and a Side badge with the real collaborator names, confirm the
  Side filter in `FilterBar` narrows the list, and confirm renaming a
  collaborator under Settings → "Names" updates the Side labels
  everywhere without a page reload surprise (Next.js cache invalidation
  on that settings action already exists — confirm it also covers these
  new read sites).
