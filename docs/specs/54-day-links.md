# Feature spec: Day links — a live page for everyone with a job on the day

**Status: proposed, not built.** Asked for as a spec (2026-11-23), as the
shared ground under specs 52 and 53. The open questions are in §12. Nothing is
built until they are answered and the planner says to build it (see
`docs/specs/README.md`).

**Depends on:** spec 9 (share-link token pattern), spec 32 (audit log),
spec 34 (polling), spec 39 (`people`), spec 43 (inbox), spec 48 (phone),
spec 50 (run sheet items and their assignees).
**Used by:** spec 52 (the shot list module), spec 53 Part I (the seating
module).

## 1. What was asked

1. When the couple assigns a run sheet task to someone, that person can see
   it.
2. Each assigned person gets their own live link, made by the couple: a
   vendor, an usher, a family member.
3. The design stays open to front ends made for one kind of person, like the
   photographer's: new ones plug in without rebuilding the link.

## 2. Story

> **As the couple**, **I want** everyone helping on the day (the
> photographer, the venue, the ushers, my aunt doing the guestbook) to have a
> link showing exactly their jobs, live, **so that** nobody rings me on my
> wedding day to ask what's next.
>
> **As an usher**, **I want** to open one link and see that I'm handing out
> programmes at 1:45 at the gate, then seating guests at 2:00, **so that** I
> know where to be without carrying a printout.

## 3. Who gets a link

A **day link** belongs to one **assignee**: anyone who can be assigned a run
sheet item (spec 50) and has no login of their own:

- a **vendor** (spec 8);
- a **guest** (an usher, a reader, the family wrangler);
- a **person** from `people` (spec 39) who has no planner login.

Collaborators (the couple) and anyone with a planner login use the app
itself, so they never get a day link.

Each assignee has at most **one live link**. Making a new one revokes the
old.

## 4. The link page

`/d/<token>` is a **shell** with tabs. Each tab is a **module** (§5). The
shell provides, for every module:

- the header: the person's name, the wedding's name and date, and times in
  the wedding's timezone;
- live updates: polling every 15 seconds while the page is open (the spec 34
  pattern);
- the offline queue: writes made without a connection are kept on the device
  and sent when it returns, with a "3 changes waiting to send" banner;
- write authentication by token (§8);
- the phone layout of spec 48, a bottom tab bar, and touch targets of at
  least 44 px.

A link with one module shows no tab bar.

## 5. Modules

A module is a front end for one job. It is code, not data: adding a module
adds code and no migration, the way site block kinds work (spec 23).

Every module declares:

- `key` and `label` ("shot_list", "Shot list");
- **who it is offered to**: a rule over the assignee (a vendor category, or
  "anyone");
- **default on** for new links: a rule over the assignee, so the couple
  rarely has to choose;
- its **config**, if any (the shot list module takes an optional section, for
  a wrangler);
- its **read**: one server query, scoped to the link's wedding, assignee and
  config, returning only what the module shows;
- its **writes**: the named server actions the module may call through the
  link, and nothing else.

The registry lives in `src/lib/day-links/modules.ts`. A link's stored module
keys that the registry no longer knows are ignored.

### 5.1 The modules

| Module | Offered to | On by default for | Spec |
| --- | --- | --- | --- |
| **My day** | everyone | everyone (always on, can't be turned off) | this one, §6 |
| **Shot list** | vendors; guests and people (as wrangler) | vendors in the Photography or Videography category; a guest or person assigned to a run sheet item linked to a shot section (§6.3) | 52 |
| **Seating** | vendors; guests and people | vendors in the Venue or Catering category (the couple switches it on for ushers) | 53 Part I |

A module for one kind of person is added the same way: a new entry in the
registry, with its own read and writes. Examples kept open by this design
(not specced): the DJ's song list from spec 34's chart and "do not play"
list; the florist's delivery list per location; the celebrant's order of
service.

## 6. My day

### 6.1 What it shows

- **Now and next:** the item happening now, if they're on it, and their next
  one, in large type, with "in 25 minutes".
- **Their items:** every run sheet item they're assigned, across all events,
  in time order, each with its start and end, location, notes, the event
  name, and who else is on it (names only).
- **Past items** fold into "Earlier today".
- **Contacts:** call and text buttons for the people the couple chose as day
  contacts (§7). Phone numbers show only here, only for those contacts.
- **Where:** each location opens in the phone's maps app.
- Items marked guest-visible are never a reason to show anything extra: a
  day link shows only the person's own items.

### 6.2 Done

Each of their items has a **Done** button. It marks their part done (one
assignee's part, not the whole item) with the time. Undo is available until
they leave the page. The couple sees "2 of 3 done" on the run sheet item,
and each assignee's tick.

### 6.3 Linked front ends

An item can lead to a module. A run sheet item linked to a shot section
(spec 52 §4.1) shows "Open the shot list" on that item, going to the Shot
list module scoped to that section. Other modules use the same hook: an item
says which module and config it opens.

### 6.4 Telling the couple

"Send a note" on any item writes a short message to the couple's inbox
(spec 43) as "From the day: Sione (usher) — 'Gate is locked, using the side
entrance'". It's one line, with no replies through the link.

## 7. The couple's screens

- **Run sheet** (spec 50): each assignee chip shows a link state: no link,
  link made, opened (with when), and their Done tick per item. The chip's
  menu has "Make their link", "Copy link", "Show QR code", "Send by email"
  (when an address is known) and "Turn off".
- **Day links** (`/run-sheet/links`): everyone assigned anything, one row
  each, with their link state, their modules (switch any offered module on
  or off), "last opened", and "Make links for everyone without one".
- **Day contacts:** on the same screen, the couple ticks who appears as a
  contact on every link (the planner, the venue coordinator, a family
  member), each with a phone number.
- **Print sheet:** one page per person with their name, their items and a QR
  code for their link (the `qrcode` package), for handing out on the day.
- **Guest and vendor pages** show the person's link state and the same menu.

## 8. Security and privacy

- A token is random, stored as a hash plus an encrypted copy (so the couple
  can copy it again), never in plain text. This is the spec 9 pattern.
- A link **expires** seven days after the wedding's last event by default.
  The couple can extend it or turn it off at any time.
- Token lookups go through the existing failed-lookup throttle
  (`rsvp_token_attempts`).
- A link reads only through its modules' scoped queries: the person's own
  items, and what each module shows. Other guests appear by display name
  only. Vendor notes (spec 52 §4.3) are the only guest notes any module may
  show.
- Writes are only the module's named actions. Each is a server action that
  resolves the token, checks the link is live and the action is one of its
  modules' writes, and writes with the service role. Audit rows carry
  `actor_kind = 'public'` and the link's label ("Sione (usher)").
- Opening a link records `last_opened_at`, nothing more. No device or IP
  data is kept.
- The privacy page names day links: what they show and how long they last.

## 9. Data

Migration `0050_day_links.sql` (after spec 51's `0049`; specs 52 and 53
follow):

- `day_links (id, wedding_id, vendor_id null, guest_id null, person_id null,
  label, token_hash unique, token_encrypted, modules text[] not null,
  module_config jsonb not null default '{}', expires_at, revoked_at null,
  last_opened_at null, created_at, updated_at)`. Check: exactly one of the
  three assignee columns is set. Each module key matches `^[a-z_]{1,40}$`;
  the set of keys lives in code. A partial unique index per assignee column
  `where revoked_at is null` enforces one live link each.
- `day_contacts (id, wedding_id, label, phone, sort_order)`.
- `run_sheet_item_assignees.done_at timestamptz null`,
  `done_by text null`.
- `run_sheet_items.opens_module text null`,
  `run_sheet_items.opens_config jsonb null` (§6.3), checked against the same
  key pattern.
- RLS on every new table keyed to `wedding_id`; planner access per spec 39's
  registry; audit triggers on `day_links`, `day_contacts` and the new
  assignee columns (spec 32).

## 10. Code

- `src/lib/day-links/modules.ts`: the registry and the module contract (§5).
- `src/lib/day-links/my-day.ts`: now, next, earlier today, and "in 25
  minutes", from the wedding's timezone. Pure and tested.
- `src/lib/day-links/offline-queue.ts`: the device queue, keyed by link,
  replaying writes in order with their original times. Tested.
- `src/server/day-links/resolve.ts`: token to link, wedding and assignee,
  with the throttle and the expiry check.
- `src/server/actions/day-links.ts`: make, revoke, set modules, set expiry,
  email; and the link-side `markItemDone`, `undoItemDone`, `sendDayNote`.
- `src/server/queries/day-links.ts`, wrapped in `cache()`.
- Screens: `/d/[token]` (shell and My day), `/run-sheet/links`, the print
  sheet, and the chip menu on the run sheet.

## 11. Out of scope

- Accounts for vendors or helpers, or one person seeing several weddings.
- Two-way chat. Notes go one way, to the inbox.
- Push notifications or texts sent by the app. The couple sends links
  themselves (copy, email, QR).
- Showing the whole run sheet to a helper. They see their own items.

## 12. Open questions

**Q1. Collaborators and planners.** Never get a day link, since they have
the app (recommended), or can they have one too, for a phone view on the day?

**Q2. Expiry.** Seven days after the last event (recommended), on the night
of the wedding, or never?

**Q3. Done ticks.** Per person (recommended: "2 of 3 done" shows who's left),
or one tick for the whole item?

**Q4. Notes to the couple.** Wanted (recommended, one-way to the inbox), or
leave the link read-only apart from Done and the modules' own writes?

**Q5. Defaults by vendor category** (§5.1): a good starting guess
(recommended, always editable per link), or should every module start off?

## 13. Build order (once answered)

1. Migration `0050` and SQL suite assertions (tenancy, one live link per
   assignee, the one-of-three check, module key pattern, audit firing).
2. `src/lib/day-links/*` and tests.
3. Make, copy, revoke and email links from the run sheet chip and the Day
   links screen.
4. `/d/[token]`: the shell, My day, Done, notes to the inbox.
5. The offline queue and live polling, in the shell.
6. The print sheet with QR codes.
7. Spec 52's Shot list module and spec 53's Seating module plug in here.
8. Typecheck, tests, SQL suite, build; a real phone: open a link, go offline,
   tap Done, come back online.
