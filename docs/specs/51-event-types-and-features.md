# Feature spec: Event types, and only the features an event needs

**Status: built (migration 0049).** Asked for as a spec (2026-11-23). Every
question is answered (§9), and custom event types were added the same day.
Nothing is built until the planner says to build it (see
`docs/specs/README.md`).

**Depends on:** V1 events, spec 22 (per-event invites), spec 33 (seating),
spec 40 (onboarding, where a wedding is created), spec 41 (`is_main`,
migration `0041`), spec 50 (run sheet, where an event is a label).

## 1. What was asked

1. An event has a **type**, because different events need different features.
2. Not every event needs every feature. Seating is the example: a ceremony or
   welcome drinks has no seating plan.
3. The couple can create their own event types.
4. Built-in and custom types work exactly the same way.

## 2. Story

> **As the couple**, setting up our events, **I want** to say what kind of
> event each one is, make my own kinds, and turn off what an event doesn't
> need, **so that** guests aren't asked to RSVP to the getting-ready photos
> and I'm not offered a seating plan for the ceremony.

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

## 4. The model

### 4.1 One rule for every type

An **event type** is a row the wedding owns: a name, a position in the list,
and a default for each switchable feature (§4.3). Built-in and custom types
are the same kind of row, edited in the same place, with the same fields.
The only difference is where a type came from.

- A type **presets** an event's switches when the event is created. After
  that the event's own switches are the truth, and nothing in the app reads
  the type to decide behaviour. The type is for the defaults, the label, and
  sorting.
- Changing a type's defaults never changes existing events. It applies to
  events created afterwards.
- Changing an existing event's type leaves its switches alone.
- Rejected: deriving features from the type at read time (one odd event,
  like a seated ceremony, would need a type of its own).

### 4.2 The built-in types

Every wedding starts with these nine, seeded when the wedding is created and
by the migration for existing weddings:

| Type | Guests reply | Seating plan | Guest-facing | Main event |
| --- | --- | --- | --- | --- |
| Ceremony | on | off | on | on |
| Reception | on | on | on | on |
| Ceremony & reception | on | on | on | on |
| Rehearsal dinner | on | on | on | off |
| Welcome drinks | on | off | on | off |
| After party | off | off | on | off |
| Recovery brunch | on | off | on | off |
| Getting ready / photos | off | off | off | off |
| Other | on | off | on | off |

The couple can rename a built-in type, change its defaults, reorder it or
hide it, exactly as with their own. **Other** is the one type that can't be
hidden, because it is the fallback.

### 4.3 Custom types

- **"+ New type"** sits at the bottom of the Type select on the event form
  and in the type list (§5). It asks for a name and the four defaults,
  starting from Other's defaults. A custom type is ready to use straight
  away.
- **Duplicate** on any type copies its defaults under a new name ("Mehndi"
  from Welcome drinks).
- **Hide** takes a type out of the Type select for new events. Events that
  already use it keep it, and the list shows it as hidden with "Show again".
  Types are never deleted, so no event is ever left without one.
- Names are unique within a wedding (case and spacing ignored), 1–40
  characters.

### 4.4 What each switch does

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

**Main event** (`is_main`) keeps its meaning from spec 41. A type's default
for it is only a preset.

### 4.5 Adding a switch later

A new per-event feature is one boolean on `events` and one default on
`event_types`, added together in the same migration, so every type, built-in
or custom, gets a default for it. That is the whole pattern. No feature is
keyed to a particular type.

### 4.6 Existing events

Migration backfill, so nothing a guest sees changes:

- Each existing event gets its wedding's built-in type whose name matches
  exactly ("Ceremony", "Reception", "Wedding" → Ceremony & reception,
  "Rehearsal dinner", "Welcome drinks", "After party"; case and spacing
  ignored), otherwise **Other**.
- `asks_rsvp = true`, `guest_facing = true` for every existing event (they
  all ask today).
- `has_seating = true` only where the event has a seating plan with at least
  one table; otherwise off.

## 5. Screens

- **`/events` form.** A "Type" select first, listing the wedding's visible
  types in their order, then "+ New type". On a new event, choosing a type
  sets the switches below it, which stay editable. On an existing event,
  changing the type does not touch the switches. A "What this event needs"
  group holds: Guests reply, Seating plan, Shown on the public site, Main
  event, and "Just us — not shown to guests". Switches that a combination
  rules out are disabled, with the reason beside them ("A main event asks for
  replies").
- **`/events` list.** The type shown beside the name; the Seating button only
  where seating is on. A small "No RSVP" / "Just us" note where relevant, in
  the same place as "hidden from the public site" today.
- **Event types** (a section at the foot of `/events`, collapsed by default):
  every type, built-in and custom alike, each row showing its name, its
  defaults as four small switches, how many events use it, and Rename,
  Duplicate, Hide/Show and move up/down (spec 45: no drag needed).
- **Invitations "who's invited".** Lists guest-facing events only.
- **RSVP form, reply card, `/guests` columns, exports.** Only events that ask
  for replies.

## 6. Data

Migration `0049_event_types_and_features.sql`:

- `event_types (id, wedding_id, name, builtin_key text null, asks_rsvp,
  has_seating, guest_facing, is_main, sort_order, hidden_at null, created_at,
  updated_at)`, with `unique (id, wedding_id)`, a unique index on
  `(wedding_id, lower(btrim(name)))`, and a unique index on
  `(wedding_id, builtin_key) where builtin_key is not null`. `builtin_key`
  records where a seeded type came from (`'ceremony'`, `'other'`, …) and is
  read only to stop Other being hidden. Check:
  `not (builtin_key = 'other' and hidden_at is not null)`.
- `public.seed_event_types(p_wedding_id uuid)` inserts the nine of §4.2 if
  the wedding has none. It is called by the migration for every existing
  wedding and by wherever a wedding is created (spec 40's onboarding).
- `events.type_id uuid not null`, a composite foreign key to
  `event_types (id, wedding_id)` with no delete action (types are hidden,
  never deleted). `events.asks_rsvp boolean not null default true`,
  `has_seating boolean not null default false`,
  `guest_facing boolean not null default true`.
- Checks on `events`: `not is_main or asks_rsvp`;
  `guest_facing or (not asks_rsvp and not is_main and not is_public)`. The
  same two checks on `event_types`' defaults.
- Backfill per §4.6, inside the migration, before `type_id` becomes not null
  and before the checks are added.
- `v_household_rsvp`, `v_guest_event_invites`, `v_wedding_stats`: replaced
  to ignore events with `asks_rsvp = false` (and, for invites, non-guest-facing
  events). Each view is replaced in full in the new migration, never edited
  in its old file.
- RLS on `event_types` keyed to `wedding_id`; planner access per spec 39's
  registry; an audit trigger (spec 32).
- `take_seating_snapshot` / restore are unchanged: they read whole rows.

## 7. Code

- `src/lib/events/types.ts`: the nine built-in definitions (§4.2) used by the
  seed and the tests, and `normaliseFeatures(input)` applying the rules of
  §4.4. Unit tested.
- `src/server/actions/event-types.ts`: create, rename, duplicate, set
  defaults, hide/show, reorder. Each checks the Supabase `error`.
- `saveEvent` (`src/server/actions/events.ts`): takes `type_id` and the
  switches, presets the switches from the type only when creating, and
  validates them with `normaliseFeatures`.
- `getEventTypes(weddingId)` in `src/server/queries/`, wrapped in `cache()`.
- Readers that filter: the RSVP form and its actions (`rsvp.ts`, `reply.ts`,
  `src/server/rsvp/resolve.ts`), `src/lib/site/reply-state.ts`,
  `src/lib/guest-table.ts` and the `/guests` table, the invites queries,
  `getEventIdsWithSeating` and the `/seating` picker, the export route, the
  site renderers (`content.tsx`, `on-the-day.tsx`) for guest-facing.

## 8. Out of scope

- Per-event RSVP questions (meal choice only at the reception). Questions
  stay wedding-wide; per-event questions would be their own spec.
- Per-event capacity or headcount limits, and transport per event.
- Changing what a run sheet, budget item or task can attach to.

## 9. Answered — 2026-11-23

Every question took its recommendation.

1. **Built-in types:** the nine in §4.2, with Other for the rest. The couple
   adds their own (§4.3).
2. **Seating on existing events:** on only where a plan with tables already
   exists (§4.6). Rejected: on for every existing event.
3. **"Just us" events:** a switch (`guest_facing`, §4.4). Rejected: relying
   on `is_public` and inviting nobody.
4. **Other per-event features:** none in this spec (§8). §4.5 is how one is
   added later.
5. **Changing an existing event's type:** the switches are left alone
   (§4.1). Rejected: an "apply this type's defaults" button.

## 10. Build order

1. Migration `0049` with the table, seed function, backfill, checks and views;
   SQL suite assertions for the seed, the backfill, every check (including
   Other not hideable and unique names), and each view.
2. `src/lib/events/types.ts` and tests.
3. Event type actions and the Event types section on `/events`.
4. `saveEvent` and the `/events` form and list.
5. Readers in §7: RSVP form and reply card first (guest-facing), then
   `/guests`, invitations, seating, exports.
6. Typecheck, tests, SQL suite, build; a browser pass of `/events` (create a
   custom type, use it, hide it), `/seating`, and an RSVP form with one event
   that doesn't ask.
