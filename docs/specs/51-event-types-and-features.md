# Feature spec: Event types, and only the features an event needs

**Status: proposed, not built.** Asked for as a spec (2026-11-23). The open
questions are in §9. Nothing is built until they are answered and the
planner says to build it (see `docs/specs/README.md`).

**Depends on:** V1 events, spec 22 (per-event invites), spec 33 (seating),
spec 41 (`is_main`, migration `0041`), spec 50 (run sheet, where an event is
a label).

## 1. What was asked

1. An event has a **type**, because different events need different features.
2. Not every event needs every feature. Seating is the example: a ceremony or
   welcome drinks has no seating plan.

## 2. Story

> **As the couple**, setting up our events, **I want** to say what kind of
> event each one is and turn off what it doesn't need, **so that** guests
> aren't asked to RSVP to the getting-ready photos and I'm not offered a
> seating plan for the ceremony.

## 3. What an event carries today (read from the source)

Every event gets every feature. There is nothing to switch off except two
flags.

| Feature | Where it lives | Can it be turned off per event? |
| --- | --- | --- |
| Who's invited | `invitation_events`, `guest_event_overrides` (spec 22) | Only by inviting nobody |
| Guests reply (RSVP) | `rsvps (guest_id, event_id)`; the form asks for every invited event | No |
| Seating plan | `seating_plans`/`seating_tables`/… keyed by `event_id` (spec 33); a "Seating" button on every event on `/events`, every event in the `/seating` picker | No |
| Shown on the public site | `events.is_public` | Yes |
| Main event (counts as "coming") | `events.is_main` | Yes |
| Note for invited guests, dress code | `events.guest_note`, `events.dress_code_id` | Leave blank |
| Run sheet, budget items, tasks, mood boards | `event_id` used as a label, `on delete set null` | Leave unlabelled; nothing to switch off |

## 4. The model: a type is a preset, features are stored

`events` gains a **kind** and one boolean per switchable feature. The kind
picks the defaults when an event is created; after that the switches are the
truth, and the planner can change any of them. Nothing in the app reads the
kind to decide behaviour. The kind is there for the defaults, an icon, and
sorting.

This keeps behaviour predictable: changing a feature never depends on a
lookup table in code, and adding a kind later changes no existing event.
Rejected: deriving features from the kind at read time (one odd event, like
a seated ceremony, would need a new kind).

### 4.1 Kinds and their defaults

| Kind | Guests reply | Seating plan | Guest-facing | Main event |
| --- | --- | --- | --- | --- |
| Ceremony | on | off | on | on |
| Reception | on | on | on | on |
| Ceremony & reception (one event) | on | on | on | on |
| Rehearsal dinner | on | on | on | off |
| Welcome drinks | on | off | on | off |
| After party | off | off | on | off |
| Recovery brunch / day after | on | off | on | off |
| Getting ready / photos (just us) | off | off | off | off |
| Other | on | off | on | off |

"Shown on the public site" (`is_public`) keeps its current default of on for
guest-facing kinds and is forced off for a private event.

### 4.2 What each switch does

**Guests reply** (`asks_rsvp`).
- Off: the event is left out of the RSVP form, the reply card, RSVP counts,
  the per-event status columns on `/guests` (spec 47), the chase emails and
  the RSVP export. Guests invited to it still see it on their page and the
  schedule, as information.
- Existing `rsvps` rows are kept, never deleted. Turning it back on brings
  them back.
- A main event must ask for replies (a check constraint): "coming" is worked
  out from the main event's answers.
- Seating with replies off seats from everyone invited, since there are no
  yeses to seat from.

**Seating plan** (`has_seating`).
- Off: no "Seating" button on `/events`, the event is left out of the
  `/seating` picker, `/events/[id]/seating` shows "Seating is off for this
  event — turn it on" instead of the editor, and the guest-facing table
  reveal (spec 33 Part F) shows nothing.
- An existing plan, tables and snapshots are kept. Turning it back on brings
  them back as they were.

**Guest-facing** (`guest_facing`).
- Off ("just us"): the event is not offered in Invitations' "who's invited",
  is never shown on any guest page or the site, and cannot ask for replies or
  be the main event. It still appears on `/events`, the calendar, and as a run
  sheet, budget and task label. Its existing invitation rows are kept but
  ignored.
- Rejected: reusing `is_public` for this. `is_public` already means "on the
  shared site schedule" while invited households still see the event, which
  is a different thing.

### 4.3 Existing events

Migration backfill, so nothing a guest sees changes:

- `kind = 'other'`, except names that are exactly "Ceremony", "Reception",
  "Wedding" (ceremony & reception), "Rehearsal dinner", "Welcome drinks",
  "After party" (case and spacing ignored).
- `asks_rsvp = true`, `guest_facing = true` for every existing event (they
  all ask today).
- `has_seating = true` only where the event has a seating plan with at least
  one table; otherwise off. See Q2.

## 5. Screens

- **`/events` form.** A "Type" select first. On a new event, choosing a type
  sets the switches below it, which stay editable. On an existing event,
  changing the type does not touch the switches. A "What this event needs"
  group holds: Guests reply, Seating plan, Shown on the public site, Main
  event, and "Just us — not shown to guests". Switches that a combination
  rules out are disabled, with the reason beside them ("A main event asks for
  replies").
- **`/events` list.** The type shown beside the name; the Seating button only
  where seating is on. A small "No RSVP" / "Just us" note where relevant, in
  the same place as "hidden from the public site" today.
- **Invitations "who's invited".** Lists guest-facing events only.
- **RSVP form, reply card, `/guests` columns, exports.** Only events that ask
  for replies.

## 6. Data

Migration `0049_event_kinds_and_features.sql`:

- `create type public.event_kind as enum (...)` with the nine kinds of §4.1.
  A new type used in the same migration is safe; the 55P04 rule only bites on
  `alter type … add value`.
- `events.kind event_kind not null default 'other'`,
  `asks_rsvp boolean not null default true`,
  `has_seating boolean not null default false`,
  `guest_facing boolean not null default true`.
- Checks: `not is_main or asks_rsvp`; `guest_facing or (not asks_rsvp and not is_main and not is_public)`.
- Backfill per §4.3, inside the migration, before the checks are added.
- `v_household_rsvp`, `v_guest_event_invites`, `v_wedding_stats`: replaced
  to ignore events with `asks_rsvp = false` (and, for invites, non-guest-facing
  events). Each view is replaced in full in the new migration, never edited
  in its old file.
- `take_seating_snapshot` / restore are unchanged: they read whole rows.

## 7. Code

- `src/lib/events/kinds.ts`: the kind list, labels, and `KIND_DEFAULTS`
  (§4.1), plus `normaliseFeatures(input)` applying the two rules of §4.2. Unit
  tested.
- `saveEvent` (`src/server/actions/events.ts`): accepts and validates the new
  fields; checks the Supabase `error`.
- Readers that filter: the RSVP form and its actions (`rsvp.ts`, `reply.ts`,
  `src/server/rsvp/resolve.ts`), `src/lib/site/reply-state.ts`,
  `src/lib/guest-table.ts` and the `/guests` table, the invites queries,
  `getEventIdsWithSeating` and the `/seating` picker, the export route, the
  site renderers (`content.tsx`, `on-the-day.tsx`) for guest-facing.

## 8. Out of scope

- Per-event RSVP questions (e.g. meal choice only for the reception). Today
  questions are wedding-wide. See Q4.
- Per-event capacity or headcount limits.
- Changing what a run sheet, budget item or task can attach to.

## 9. Open questions

**Q1. Is the kind list in §4.1 right?** Anything to add (e.g. "Mehndi",
"Tea ceremony", "Hens/stag"), drop, or rename?
*Recommendation:* the nine as listed; "Other" covers the rest.

**Q2. Seating on existing events.** Only where a plan with tables already
exists (recommended: the ceremony stops offering seating straight away, and
no plan is hidden), or on for every existing event (nothing changes until the
planner switches it off)?

**Q3. "Just us" events.** Wanted as a switch (recommended: getting ready,
photos and vendor setup sit on the calendar and run sheet without any risk of
a guest seeing them), or not needed (use `is_public` off and invite nobody)?

**Q4. Are there other features that should be per event?** Candidates:
RSVP questions per event (meal choice only at the reception), a capacity
limit, transport/coach seats per event. *Recommendation:* none in this spec;
per-event questions as its own spec if wanted, since it touches the RSVP
form and spec 49's answers.

**Q5. Changing the type of an existing event.** Leave the switches alone
(recommended: no surprise loss of seating or RSVPs), or offer "Apply this
type's defaults" as a button?

## 10. Build order (once answered)

1. Migration `0049` with backfill, checks and views; SQL suite assertions for
   the backfill, both checks and each view.
2. `src/lib/events/kinds.ts` and tests.
3. `saveEvent` and the `/events` form and list.
4. Readers in §7: RSVP form and reply card first (guest-facing), then
   `/guests`, invitations, seating, exports.
5. Typecheck, tests, SQL suite, build; a browser pass of `/events`,
   `/seating`, and an RSVP form with one event that doesn't ask.
