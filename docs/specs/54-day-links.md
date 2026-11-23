# Feature spec: Day links — a live page for everyone with a job on the day

**Status: answered, not built.** Asked for as a spec (2026-11-23). Every
question is answered (§15). Nothing is built until the planner says to build
it (see `docs/specs/README.md`).

**Depends on:** spec 9 (share-link token pattern), spec 32 (audit log),
spec 34 (polling), spec 39 (`people`), spec 48 (phone), spec 50 (run sheet
items and their assignees).
**Used by:** spec 55 (the on-the-day master, which shows everything a day
link sends), spec 52 (the Shot list module), spec 53 Part I (the Seating
module).

## 1. What was asked

1. When the couple assigns a run sheet task to someone, that person can see
   it.
2. Each assigned person gets their own live link, made by the couple: a
   vendor, an usher, a family member.
3. Mobile first, with a beautiful, clear experience: clear tasks and clear
   buttons.
4. Every button feeds back to a master the couple and planner watch on the
   day (spec 55).
5. The design stays open to front ends made for one kind of person, like the
   photographer's: new ones plug in without rebuilding the link.

## 2. Story

> **As an usher**, **I want** to open one link on my phone and see that I'm
> handing out programmes at the gate at 1:45, tap Start when I begin and Done
> when I finish, and ask for help in one tap if the programmes haven't
> arrived, **so that** I know where to be and the planner knows where I am.
>
> **As the couple**, **I want** everyone helping on the day to have their own
> link, **so that** nobody rings us on our wedding day to ask what's next.

## 3. Who gets a link

A **day link** belongs to one **assignee**: anyone who can be assigned a run
sheet item (spec 50) and has no login of their own:

- a **vendor** (spec 8);
- a **guest** (an usher, a reader, the family wrangler);
- a **person** from `people` (spec 39) who has no planner login.

The couple and anyone with a planner login don't get a day link: they get the
on-the-day master (spec 55).

Each assignee has at most **one live link**. Making a new one revokes the old
one.

## 4. Principles

These hold on every screen of a day link and every module.

1. **Phone first.** It is designed at 390 px wide and one hand. It works on
   a tablet and a laptop, but is never designed for them first.
2. **One clear next action.** Each screen has one primary button, in the
   thumb zone at the bottom, at least 56 px tall and full width.
3. **Every tap answers.** A tap changes the screen at once, and a small
   confirmation says where it went: "Sent to the planner ✓", or "Saved — will
   send when you're back online".
4. **Every tap feeds the master.** Each button writes one activity row
   (§9) that spec 55 shows live.
5. **Nothing to learn.** Plain words ("Start", "Done", "Running late"), no
   icons without labels, no settings.
6. **Only their own.** A link shows the person's own tasks and what their
   modules show, nothing else from the wedding.
7. **Works with a bad signal.** Every write queues offline and sends when the
   connection comes back (§6.8).

## 5. The look

The day link uses the **app's own look with the wedding's accent**: the same
type, spacing and components on every wedding, so it is always readable, plus
the couple's names and the accent colour from their site theme (spec 31).

- **Type:** the system font stack. Body 17 px, task titles 22 px, the Now
  card's title 28 px, times in tabular figures. Nothing smaller than 13 px.
- **Colour:** paper background, ink text, one accent. The accent is used
  only on the primary button, the progress bar and the active tab. If the
  site's accent doesn't reach 4.5:1 contrast with white button text, the
  app's own accent is used instead.
- **States** each have a colour and a word, never colour alone: to do
  (outline), on it (accent), done (green with a tick), running late (amber
  with "+10 min"), need help (red with "Help requested"), handed back (grey,
  struck through).
- **Dark mode** follows the phone's setting, for dim receptions.
- **Motion:** state changes slide or fade in under 200 ms. Nothing moves when
  the phone asks for reduced motion.
- **Touch:** every control is at least 44 × 44 px, with 8 px between
  controls.
- **Haptics:** a short vibration on Start, Done and Need help where the phone
  supports it.

The mockups canvas ("Shot list & seating mockups", row 1) shows the look for
the photographer's link. The usher's link follows the same pattern.

## 6. Screens

### 6.1 First open

"Hi Sione. You're helping at Aroha & Sam's wedding on Saturday 6 March. You
have 3 jobs." One button: **See my jobs**. It is shown once per device.

### 6.2 My day (the home screen)

From top to bottom:

1. **Header:** the wedding's names, the date, and the time now in the
   wedding's timezone.
2. **Help banner** (only while one of their help requests is open): "Help
   requested 2:14 · waiting", which changes to "Mere is on her way" when the
   master replies (spec 55).
3. **Now card:** their current task, or the next one if nothing is current.
   It shows:
   - the title;
   - the time ("1:45 – 2:00 · ends in 12 min", or "starts in 25 min");
   - the location, which opens the phone's maps app;
   - who else is on it (names only);
   - the couple's notes for the task;
   - the **primary button** (§6.4);
   - a row of three secondary buttons: **Running late**, **Need help**,
     **More** (which holds **Can't do it** and **Add a note**).
4. **Next up:** their following tasks, each a row with time, title and
   location. Tap one to open it.
5. **Earlier today:** done and past tasks, folded, with their final state.
6. **Contacts:** call and text buttons for the day contacts the couple chose
   (§10).

A task the couple changed since the person last saw it carries a badge:
"Changed: was 1:45, now 2:00", until they open it.

### 6.3 A task

Opening any task shows the same card as Now, full screen, with its buttons.
**Back** returns to My day.

### 6.4 The buttons

Each assignee's part of a task is in one of four states. The primary button
moves it forward:

| State | Primary button | Shown as |
| --- | --- | --- |
| To do | **Start** | outline |
| On it | **Done** | accent, "Started 1:47" |
| Done | none (shows "Done 1:58 ✓" and Undo) | green |
| Handed back | none (shows "You handed this back") | grey, struck through |

Done can be tapped from To do as well (the task was quick). Each step can be
undone from the task screen until the end of the day.

The secondary buttons don't change the state. Each one sends something to
the master:

- **Running late:** a sheet with **+5 min**, **+10 min**, **+15 min** and
  **Other**. It marks their part "running late +10" on the master and on
  their own card. It doesn't move the run sheet: the planner decides that on
  the master (spec 55).
- **Need help:** a sheet with quick reasons ("Can't find someone",
  "Something's missing", "Running out of time", "Something's wrong") and an
  optional line of text, then **Send**. It raises an alert at the top of the
  master until someone answers it there. Their help banner (§6.2) shows the
  answer.
- **Can't do it:** a sheet asking why (one line, required), then **Hand it
  back**. Their part becomes "handed back". The master shows the task as
  needing someone. It stays in their Earlier today list.
- **Add a note:** one line of text, sent to the master's activity feed
  ("Gate is locked, using the side entrance").

After every tap, a confirmation slides up for 4 seconds: "Started · sent to
the planner ✓", with **Undo** on it.

### 6.5 Before and after the day

- **Before the day:** the link works as soon as it is made. My day shows
  "Saturday 6 March" and the jobs, with the buttons disabled and "You can
  start these on the day".
- **The day** starts at midnight before the first event, in the wedding's
  timezone. From then on the buttons work.
- **After the day:** "Thanks for helping. This link stops working on 13
  March." The buttons are disabled.

### 6.6 Tabs

My day is always the first tab. Each module the link has (§7) adds its own
tabs. A link with no modules shows no tab bar. The tab bar sits at the bottom,
with labels, at most four tabs.

### 6.7 Linked front ends

A run sheet item can open a module: an item linked to a shot section shows
**Open the shot list** on its card (spec 52). The item records which module it
opens and with which config (§11).

### 6.8 Offline

- Writes made without a connection are kept on the device, in order, with the
  time of the tap, and sent when the connection returns.
- A strip under the header says "Offline · 3 changes waiting to send", and
  turns into "All sent ✓" for 3 seconds when they go.
- The page keeps the last loaded data, so the person can still read their
  jobs.

### 6.9 Live

The page polls every 15 seconds while open (the spec 34 pattern), and on
coming back to the tab. Changed tasks get their badge, and help replies
appear in the banner.

### 6.10 Photos

Photos go both ways on a task.

**From the couple, on the task.** Any run sheet item can carry reference
photos and files: how the arbour should look, where the boxes are, a map of
the car park, the floor plan. They show as a row of thumbnails on the task
card. Tap one to open it full screen, pinch to zoom, swipe to the next. Files
that aren't images (a PDF) open in the phone's viewer. Up to 10 per item.

**From the helper, back to the master.** The helper can add a photo:

- **on Done:** "Show it's done" (the arbour set up, the tables laid);
- **on Need help:** "Show what's wrong";
- **on Add a note.**

The camera opens straight away. The photo library is offered as well. The
photo is shrunk on the phone to at most 1600 px on its long side, as a JPEG,
before it is sent, and it queues offline like every other tap (§6.8), kept on
the device until sent. It arrives on the master with its activity row (spec
55), as a thumbnail that opens full size.

**Asking for a photo.** The couple can tick **Ask for a photo when done** on
an item. The helper's Done button then reads **Done — add a photo**: it opens
the camera, and **Skip** is always there. A photo is never required to finish
a task.

**Where photos live.** In the existing private bucket, under
`run-sheet/<wedding>/<item>/` for the couple's and `day/<wedding>/<link>/`
for helpers'. They are served by short-lived signed URLs through the link's
scoped read, and are deleted with the item, or by the couple from the master
or the after-the-day summary. Helpers' photos stay with the wedding after
the link expires, so the couple keeps them.

## 7. Modules

A module is a front end for one job. It is code, not data: adding a module
adds code and no migration, the way site block kinds work (spec 23). Every
module follows §4 and §5.

Every module declares:

- `key` and `label` ("shot_list", "Shot list");
- **offered to:** a rule over the assignee (a vendor category, or anyone);
- **on by default for:** a rule over the assignee, so the couple rarely has
  to choose;
- its **config**, if any (the shot list takes an optional section, for a
  wrangler);
- its **tabs**;
- its **master card**, if any: a one-line summary on spec 55's master
  ("Family formals · 6 of 12");
- its **read**: one server query, scoped to the link's wedding, assignee and
  config, returning only what the module shows;
- its **writes**: the named server actions the module may call through the
  link, and nothing else. Each write also writes an activity row (§9).

The registry is `src/lib/day-links/modules.ts`. A stored module key the
registry doesn't know is ignored.

| Module | Offered to | On by default for | Spec |
| --- | --- | --- | --- |
| **Shot list** | vendors; guests and people (as wrangler) | vendors in Photography or Videography; anyone assigned a run sheet item linked to a shot section (scoped to it) | 52 |
| **Seating** | vendors; guests and people | vendors in Venue or Catering (the couple switches it on for ushers) | 53 Part I |

Modules for other people are added the same way. Examples this design keeps
open, not specced: the DJ's song list and "do not play" list (spec 34), the
florist's delivery list per location, the celebrant's order of service.

## 8. What the master receives

Every write from a day link reaches spec 55's master in two ways:

- **Current state:** each assignee's part of each task (§6.4), plus whether
  they're running late and by how much, held on `run_sheet_item_assignees`.
  The master reads it to show who's on what now.
- **Activity:** one append-only row per tap (§9), which the master shows as
  its live feed and its alerts.

Answers come back the other way. When the master answers a help request
(spec 55), the answer is written to that request's row, and the day link
shows it in the help banner.

## 9. Activity rows

`day_activity` has one row per tap, from any day link or module:

| `kind` | Written when | Payload |
| --- | --- | --- |
| `opened` | the link is first opened on a device | none |
| `started`, `done`, `undone` | §6.4's primary button, and its Undo | the item |
| `late` | Running late | the item, minutes |
| `help` | Need help | the item (or none), reason, text |
| `handed_back` | Can't do it | the item, reason |
| `note` | Add a note | the item (or none), text |
| module kinds (`shot_taken`, `guest_arrived`, …) | a module's writes | the module's own |

Every row records the link, the assignee, the wedding, the time of the tap on
the device (`tapped_at`) and the time it arrived (`received_at`). A `help`
row also has `answered_at`, `answered_by` and `answer` for the master's reply.
A replayed offline tap can never overwrite a newer state: a state change is
applied only if its `tapped_at` is later than the state's own.

## 10. Making and sending links (the couple)

- **On the run sheet** (spec 50), each assignee chip shows their link state
  (no link, made, opened) and their part's state on that item. The chip's
  menu has **Make their link**, **Copy link**, **Show QR code**, **Send by
  email** (when an address is known) and **Turn off**.
- **Day links** (`/run-sheet/links`) lists everyone assigned anything, one
  row each: their link state, last opened, their modules (switch any offered
  module on or off), and **Make links for everyone without one**.
- **Day contacts**, on the same screen: who appears as a contact on every link
  (the planner, the venue coordinator, a family member), each with a phone
  number.
- **Print sheet:** one card per person with their name, their jobs and a QR
  code for their link (the `qrcode` package), for handing out on the day.
- **Guest and vendor pages** show the person's link state and the same menu.

## 11. Data

Migration `0050_day_links.sql` (after spec 51's `0049`):

- `day_links (id, wedding_id, vendor_id null, guest_id null, person_id null,
  label, token_hash unique, token_encrypted, modules text[] not null default
  '{}', module_config jsonb not null default '{}', expires_at, revoked_at
  null, created_at, updated_at)`. Checks: exactly one assignee column is set;
  each module key matches `^[a-z_]{1,40}$` (the set of keys lives in code).
  One partial unique index per assignee column `where revoked_at is null`.
- `day_link_devices (link_id, device_id, first_opened_at, last_seen_at)`, for
  "opened" on the couple's screens and the first-open screen. The device id
  is random and stored on the device. Nothing else about the device is kept.
- `day_activity (id, wedding_id, link_id, assignee columns, item_id null,
  kind text, payload jsonb, tapped_at, received_at, answered_at null,
  answered_by null, answer null)`, append-only except for the three answer
  columns. `kind` matches `^[a-z_]{1,40}$`.
- `run_sheet_item_assignees` gains `state text not null default 'todo' check
  (state in ('todo','started','done','handed_back'))`, `state_at`,
  `started_at`, `done_at`, `late_minutes int null`, `handed_back_reason text
  null`, and `seen_at` (when the person last saw this item, for the
  "Changed" badge).
- `run_sheet_items.opens_module text null`, `opens_config jsonb null` (§6.7),
  checked against the key pattern.
- `run_sheet_item_files (id, wedding_id, item_id, path, mime_type, caption
  null, sort_order, created_at)`, at most 10 per item (checked in the
  action), and `run_sheet_items.photo_on_done boolean not null default
  false`.
- `day_activity.photo_path text null`, for a helper's photo on `done`, `help`
  or `note`.
- Uploads from a day link use a signed upload URL issued by a token-checked
  action (`requestDayPhotoUpload`) for one path under the link's own prefix,
  at most 10 MB before shrinking, images only.
- `day_contacts (id, wedding_id, label, phone, sort_order)`.
- RLS on every new table keyed to `wedding_id`; planner access per spec 39's
  registry; audit triggers on `day_links`, `day_contacts` and the new
  assignee columns (spec 32). `day_activity` is its own record and is not
  audited again.

## 12. Security and privacy

- A token is random, stored as a hash plus an encrypted copy (so the couple
  can copy it again), never in plain text: the spec 9 pattern.
- A link **expires seven days after the wedding's last event**. The couple
  can extend it or turn it off at any time.
- Token lookups go through the existing failed-lookup throttle
  (`rsvp_token_attempts`).
- A link reads only through its scoped queries: the person's own items, the
  day contacts, and what each module shows. Other guests appear by display
  name only. Vendor notes (spec 52 §4.3) are the only guest notes any module
  may show.
- Writes are only the link's own actions (§6.4) and its modules' named
  writes. Each is a server action that resolves the token, checks the link is
  live and the write is allowed, and writes with the service role. Audit rows
  carry `actor_kind = 'public'` and the link's label ("Sione (usher)").
- The privacy page names day links: what they show and how long they last.

## 13. Code

- `src/lib/day-links/modules.ts`: the registry and the module contract (§7).
- `src/lib/day-links/my-day.ts`: Now, Next up, Earlier today, the day's
  start and end, "ends in 12 min", and the Changed badge. Pure and tested.
- `src/lib/day-links/state.ts`: §6.4's states and allowed moves, and the
  "later tap wins" rule. Pure and tested.
- `src/lib/day-links/offline-queue.ts`: the device queue. Tested.
- `src/server/day-links/resolve.ts`: token to link, wedding and assignee,
  with the throttle and the expiry check.
- `src/server/actions/day-links.ts`: for the couple, make, revoke, set
  modules, set expiry and email; for the link, `setTaskState`, `reportLate`,
  `requestHelp`, `handBack`, `addDayNote` and `requestDayPhotoUpload`.
- `src/lib/day-links/photo.ts`: shrinking a photo on the device before
  upload. Tested where a test can reach it (the size maths); the canvas step
  is checked on a real phone. Each checks the Supabase
  `error`.
- `src/server/queries/day-links.ts`, wrapped in `cache()`.
- `src/components/day-link/`: the shell, Now card, task row, button sheets,
  confirmation, offline strip and tab bar, shared by every module.
- Screens: `/d/[token]`, `/run-sheet/links`, the print sheet, and the chip
  menu on the run sheet.

## 14. Out of scope

- Accounts for vendors or helpers, or one person seeing several weddings.
- Two-way chat. A help request gets one answer back. Notes go one way.
- Push notifications, texts or emails sent by the app on the day. The Changed
  badge is how changes reach a helper.
- Showing the whole run sheet to a helper. They see their own tasks.

## 15. Answered — 2026-11-23

1. **The couple and planners:** no day link. They get the on-the-day master,
   spec 55.
2. **Expiry:** seven days after the last event (§12).
3. **Done:** per person (§6.4).
4. **Notes:** yes, to the on-the-day master (§6.4, spec 55). Rejected: the
   inbox.
5. **Default modules:** by vendor category, and editable per link (§7).
6. **Buttons:** Start, Done, Running late, Need help and Can't do it
   (§6.4).
7. **Look:** the app's look with the wedding's accent (§5). Rejected: the
   full site theme, because readability would depend on the theme.
8. **Changes:** a "Changed" badge on the task (§6.2). Rejected: emailing
   helpers.
9. **Photos:** both ways (§6.10). The couple adds reference photos and files
   to a task; helpers can add a photo on Done, Need help or a note, and the
   couple can ask for one on Done, never require it.

## 16. Build order

1. Migration `0050` and SQL suite assertions (tenancy, one live link per
   assignee, the one-of-three check, the key patterns, the state check, audit
   firing).
2. `src/lib/day-links/*` and tests.
3. Making, copying, revoking and emailing links: the run sheet chip and the
   Day links screen.
4. `/d/[token]`: the shell, first open, My day, the Now card, the task
   screen, before and after the day.
5. The buttons, their sheets, confirmations and activity rows.
5a. Photos: reference photos on items (couple), helper photos on Done, Need
   help and notes, "Ask for a photo when done".
6. The offline queue, live polling and the Changed badge.
7. The print sheet with QR codes.
8. Spec 55's master reads what this writes; specs 52 and 53 plug in their
   modules.
9. Typecheck, tests, SQL suite, build. On a real phone: open a link, start
   and finish a task, ask for help and see the answer, go offline, tap,
   reconnect.
