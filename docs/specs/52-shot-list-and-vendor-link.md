# Feature spec: The shot list, and the photographer's front end

**Status: built, session 61 (migration `0052`; see Build status at the end).** Asked for as research and mockups before any
build (2026-11-23). Mockups: the "Shot list & seating mockups" canvas, rows 1
and 2. Every question is answered (§11). Nothing is built until the planner
says to build it (see `docs/specs/README.md`).

**Depends on:** spec 54 (day links, which this plugs into as a module),
spec 8 (vendors), spec 32
(audit log), spec 34 (polling for live updates), spec 39 (`people`), spec 45
(no-drag), spec 48 (phone), spec 50 (run sheet items and their assignees),
spec 51 (event types).

## 1. What was asked

1. A shot list for the photographer: which photos, of whom, in what order.
2. Shots document the people in them, taken from the guest list.
3. The order to shoot in can be organised.
4. The photographer can easily mark a photo as taken on the day.
5. Design for the whole day, not one screen.

## 2. Story

> **As the couple**, before the day, **I want** to list every photo we want,
> who is in each one and in what order, **so that** the photographer gets
> everyone without us running the family photos ourselves.
>
> **As the photographer**, on the day, **I want** one link on my phone that
> shows what to shoot now, who to call up and who can go, with one tap to mark
> it taken, **so that** I never miss a must-have shot or a grandparent.

## 3. What the market does (conclusions only)

- Most couples and photographers use documents or forms. Tools built for it
  (Group Shot Star, ShotLace, Semuko, My Shot List, StudioBinder, Timeline
  Pro) share a shape: the couple fills the list through a link, the
  photographer ticks shots off live, assistants join by a link with no
  account, the checklist keeps working offline, and some say whether the
  family formals fit their time slot.
- Photographers' own advice repeats: name every person in each group, shoot
  the largest group first, cap formals at about 15–20 groups, have a family
  wrangler gather people, flag sensitive family situations, and ask the
  couple for a list of the people who matter most, ideally with photos.
- What only this app can add: the shots name real guests, sit inside run
  sheet time slots, and can use mood-board photos as references.

## 4. The model

### 4.1 Sections and shots

A **shot list** belongs to the wedding. It is split into **sections**
(Getting ready, Ceremony, Family formals, Couple portraits, Reception,
Details). A new wedding gets those six, empty, and the couple can rename,
reorder, add or delete sections.

A section can be **linked to a run sheet item** (spec 50). The section then
takes its time, end time and location from that item, and moves when the item
moves. An unlinked section has no time ("any time").

A **shot** has:

- a title ("Couple with Aroha's grandparents");
- a kind: group, moment, detail or portrait;
- the people in it (§4.2);
- **must-have** on or off;
- estimated minutes (default 2 for a group, 0 for the rest);
- an optional reference image, picked from a mood-board item or uploaded;
- an optional note for the photographer ("Nan uses a walking stick");
- an optional "who shoots it": lead or second shooter;
- a position in its section;
- its **status on the day**: to do, taken, skipped or later, with the time
  and who set it.

### 4.2 People in a shot

Each person in a shot is one of:

- a **guest** (the normal case), shown by preferred name;
- a **person** from `people` (spec 39), for the couple themselves or a
  planner;
- a **role** written as text ("Best man", "All the cousins"), for groups that
  aren't individuals.

A guest who is soft-deleted drops out of every shot. A shot left with no
people stays, flagged "nobody in this shot".

### 4.3 Faces to know

Guests gain three optional fields, shown only through day links (spec 54):

- `relationship`: free text ("Aroha's grandmother");
- a photo, uploaded by the couple on the guest's page or from the shot list.
  Guests never upload their own;
- `vendor_note`: free text for vendors ("Needs a chair", "Separated from
  Graham"). It is the only guest note a day link ever shows; the existing
  `notes` stay private to the couple.

The photographer's Faces screen lists everyone in any shot who has a photo or
a relationship, with their vendor note and the shots they are in.

### 4.4 Order: fewest call-backs

A **call-back** is someone who steps out of the line-up for a shot and is
needed again later. The couple is ignored (they are in nearly every shot).

- Every section shows its call-back count under the list.
- "Suggest an order" finds the order with the fewest call-backs. Ties go to
  the order that shoots bigger groups earlier, so people can leave sooner.
  The suggestion is shown first, applied only on "Use this order", and Undo
  reverts it.
- For sections of 8 shots or fewer, the search is exhaustive. Above that, it
  is a greedy pass followed by pairwise swaps until no swap improves it. It
  is a pure function in `src/lib/shots/order.ts`, unit tested.
- Rejected: forcing the suggested order. It is advice. The couple's order is
  what the photographer sees.

### 4.5 Suggest groups from the family

"Suggest groups" asks for each side's parents, siblings, grandparents and
(optionally) step-parents, chosen from the guest list. From them it proposes
the standard formals: everyone, each whole family, the couple with
grandparents, with parents and siblings, with parents, each partner with each
parent. Step-parents and separated parents are proposed as separate groups,
never merged. The couple ticks which to add. Nothing is created until they
add them.

### 4.6 Fits the slot

A linked section shows "8 groups · about 19 minutes of a 45 minute slot".
Minutes are the shots' estimates plus one minute of changeover per group. Over
the slot shows in amber. It is advice, never a block.

## 5. The Shot list module

The photographer's front end is the **Shot list module** of their day link
(spec 54). The link, its token, expiry, live polling and offline queue are
spec 54's. This spec adds the module.

- **Offered to:** vendors, and guests or people acting as wrangler. **On by
  default** for vendors in the Photography or Videography category.
- **Config:** an optional section. A link with a section set shows only that
  section: that is the **wrangler link**, the day link of the family member
  assigned to the run sheet item the section is linked to, which turns the
  module on for them, scoped to that section.

The module follows spec 54 §5's look in full: it is the screen held to the
highest bar of all, because the photographer uses it at speed, outdoors and
in dim rooms.

The module adds three tabs beside the link's My day (spec 54 §6), which
already shows the photographer's run sheet items and day contacts:

- **Now:** the next shot to do in the current section, in large type. It
  shows who is in it, **call up** (in this shot, not the last), **can go**
  (in the last shot, not this one and not any later shot), and up next. Its
  buttons are **Taken** (full width, at least 64 px tall), Undo, Later and
  Skip. It also shows whether the section is on time or behind its run sheet
  item, and the sunset time on sections after 4 pm.
- **All shots:** every section and shot. Tap a shot to toggle taken.
  Filters: left, must-haves, missed (skipped or still to do once its section
  has ended).
- **Faces:** §4.3.

A run sheet item linked to a section shows "Open the shot list" on My day
(spec 54 §6.3).

### 5.1 The module's writes

- `setShotStatus` is the module's only write: a shot's status, never its
  content.
- Each tap sends the status it sets ("taken"), never "toggle", with the time
  the tap happened. The server keeps the latest by tap time, so a replayed tap
  from the offline queue can't undo a newer one.

### 5.2 Live progress

The couple's shot list page polls every 15 seconds while open, like the day
link, so the couple sees "Family formals · 4 of 12" move during the day.

## 6. The couple's screens

- **`/shots`**, under "The day" in the sidebar: the sections list, the
  selected section's shots (reorder with up/down buttons as well as drag,
  per spec 45), and a details panel for the selected shot. It also has the
  call-back count, "Suggest an order", "Suggest groups" and the slot fit.
- **Shared with:** whose day links have the Shot list module on, and for
  which section, with a link to spec 54's Day links screen.
- **On the day:** the same page shows each shot's status, live.
- **Print:** `/shots/print`, one section per page, people listed per shot,
  must-haves marked, for a paper backup.
- **Export:** a `shots` kind on `/api/export/[kind]` (CSV), and in the
  "Download everything" zip.

## 7. Data

Migration `0051_shot_list.sql` (after spec 51's `0049` and spec 54's `0050`):

- `shot_sections (id, wedding_id, name, run_sheet_item_id null, location
  null, sort_order, created_at, updated_at)`; run sheet item `on delete set
  null`.
- `create type public.shot_kind as enum ('group','moment','detail','portrait')`
  and `create type public.shot_status as enum ('todo','taken','skipped','later')`
  (new types, so the 55P04 rule doesn't apply).
- `shots (id, wedding_id, section_id, title, kind, must_have, minutes,
  note, shooter text check in ('lead','second') null, reference_moodboard_item_id
  null, reference_path null, sort_order, status, status_at, status_by text,
  created_at, updated_at)`.
- `shot_people (id, wedding_id, shot_id, guest_id null, person_id null, role
  text null, sort_order)`, with a check that exactly one of the three is set.
- `guests.relationship text null`, `guests.photo_path text null`,
  `guests.vendor_note text null`.
- Linking a section to a run sheet item sets that item's
  `opens_module = 'shot_list'` and `opens_config = {"section_id": …}`
  (spec 54 §9).
- RLS on every table, keyed to `wedding_id`; the module reads and writes
  through spec 54's token resolution. Audit triggers on `shots`,
  `shot_people`, `shot_sections`.
- Photos under `shots/<wedding>/<guest>.<ext>` in the existing private
  bucket, served by signed URLs with the long cache header (session 58).

## 8. Code

- `src/lib/shots/order.ts`: call-backs, call up / can go, suggested order.
- `src/lib/shots/formals.ts`: §4.5's group proposals.
- `src/lib/shots/progress.ts`: missed, behind-schedule, slot fit.
- `src/server/actions/shots.ts` and `src/server/queries/shots.ts` (wrapped
  in `cache()`).
- The module: `src/lib/day-links/modules/shot-list.ts` (its entry in spec
  54's registry: offered-to, default-on, config, read, writes) and its three
  tabs under `/d/[token]`.
- Screens: `/shots`, `/shots/print`.

## 9. Out of scope

- Photographer accounts, or a photographer seeing several weddings in one
  place.
- Uploading the finished photos.
- Telling guests on their own page that they are in the family photos (a
  later spec, if wanted).
- Native apps. The link is a web page that works offline once opened.

## 10. Risks

- **Offline is the hard part** (the queue is spec 54's). A queued tap must survive the phone locking
  and the tab being reloaded. It is the step most likely to need a real phone
  to prove.
- **Guest photos are personal data.** They are only ever shown through a
  day link the couple made, they are deleted with the guest, and the
  privacy page says so.

## 11. Answered — 2026-11-23

Every question took its recommendation.

1. **Access:** a private link, no account: the Shot list module on the
   photographer's day link (§5, spec 54). Rejected: a vendor login.
2. **Face photos:** the couple uploads them (§4.3). Rejected: guests
   uploading their own on the RSVP form.
3. **Notes vendors see:** a new `vendor_note` per guest, and nothing else
   (§4.3).
4. **Wrangler link:** yes, the family member's day link with the module
   scoped to one section (§5).
5. **Second shooter:** "lead / second" per shot (§4.1). Rejected: a link per
   shooter.
6. **Spec 50's per-person print view:** stays. The day link is the live
   version, the print view the paper one.

## 12. Build order

0. Spec 54 (day links) first: this spec plugs into it.
1. Migration `0051` and SQL suite assertions (tenancy, the one-of-three check
   on `shot_people`, audit firing).
2. `src/lib/shots/*` and their tests.
3. `/shots`: sections, shots, people, reorder, details panel.
4. Ordering, suggested groups, slot fit.
5. The Shot list module in spec 54's registry, and its All shots tab.
6. The Now tab, and polling on `/shots`.
7. Faces: relationship and photo on guests, the Faces tab.
8. Print and CSV.
9. Typecheck, tests, SQL suite, build; a real phone for the Now tab and the
   offline queue.

## Build status (session 61)

**Built:** migration `0052`; `src/lib/shots/` (`order`, `formals`, `progress`, `model`, `export`) with tests; `/shots` (sections with up/down and run sheet linking, shots with people, reorder, details, call-back count, Suggest an order with Undo, Suggest groups, slot fit, Faces panel for relationship / vendor note / photo, reference image upload, live 15-second refresh, shared-with list), `/shots/print`, the `shots` CSV kind (also in the zip); the Shot list module on day links: registered in `src/lib/day-links/modules.ts` (on by default for photography and video vendors and for anyone whose task opens it, scoped to that section), Now / All shots / Faces tabs, offline taps through the link's queue, latest-tap-wins `setShotStatus`; a wrangler link is made automatically when a link is created for someone whose task opens a section.

**Verified:** typecheck, unit tests, SQL suite, build. **Not verified:** a browser (neither `/shots` nor the module tabs rendered), a real phone, live Supabase.

**Not built / different:** no mood-board image picker for a shot's reference (upload only); no sunset time on the Now tab (the app holds no venue coordinates); relationship, vendor note and photo are edited from the shot list's Faces panel, not also on the guest's own page; a guest photo gets a new path on each change (not `shots/<wedding>/<guest>.<ext>`) so a replaced photo is never served stale from the year-long cache; a link's tab bar is capped at four tabs, so the Seating module's tab (spec 53) will push one of the shot list's out when both are on.
