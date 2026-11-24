# Feature spec: Day links — a live page for everyone with a job on the day

**Status: first part built (session 60, migration 0050); the rest is not built.** See "Build status" below. Asked for as a
spec (2026-11-23). The first two rounds are answered (§15, §17). A pass
against the leading event-staffing and day-of tools (§18) added
confirmations, check-in, announcements, open tasks, good-to-know, reminders
and cues on 2026-11-24; their questions are answered too (§19). Nothing is
built until the planner says to build it (see `docs/specs/README.md`).

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
6. The couple creates tasks on the run sheet, assigns them to people, and
   says exactly what each task is: what to do, where, with whom, what to
   bring, and who to ask.

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

## 5. The look: a native-feeling app

Day links and every module on them (the photographer's shot list, the
venue's seating) are held to a higher bar than the rest of WEDPLAN. The
planner screens and the wedding site keep their own simpler look; this
section applies only under `/d/`. The aim is a page that feels like a
first-class iPhone app, Apple-inspired in its conventions, not a copy of any
Apple app.

### 5.1 Type

- The **system font**: `-apple-system, BlinkMacSystemFont, system-ui`, which
  is SF Pro on iPhone and Mac and Roboto on Android. No web font is loaded.
- A fixed scale, in px at the default text size:

  | Style | Size / line height | Weight | Used for |
  | --- | --- | --- | --- |
  | Large title | 34 / 41 | bold, −0.4 tracking | the screen title ("Today") |
  | Title 1 | 28 / 34 | bold, −0.4 | the Now card's task |
  | Title 3 | 20 / 25 | semibold | sheet titles |
  | Headline | 17 / 22 | semibold | row titles, buttons |
  | Body | 17 / 22 | regular | notes |
  | Subhead | 15 / 20 | regular | meta lines (time, place, who) |
  | Footnote | 13 / 18 | regular | section headers, captions |
  | Caption | 12 / 16 | medium | tab labels, status capsules |

- Times and counts use tabular figures. Nothing is smaller than 12 px.
- **Text size follows the phone.** Sizes are in `rem`, so a larger system
  text size makes the whole page larger, and layouts wrap instead of
  truncating.

### 5.2 Colour

- **Light:** grouped background `#F2F2F7`, cards `#FFFFFF`, primary text
  `#000000`, secondary text `rgba(60,60,67,0.6)`, separators
  `rgba(60,60,67,0.29)`, fills for grey buttons `rgba(120,120,128,0.12)`.
- **Dark:** background `#000000`, cards `#1C1C1E`, raised cards `#2C2C2E`,
  primary text `#FFFFFF`, secondary `rgba(235,235,245,0.6)`, separators
  `rgba(84,84,88,0.65)`.
- **Tint** is the wedding's accent colour (spec 31). It colours the primary
  button, the progress ring, links and the selected tab, and nothing else. A
  tint that can't reach 4.5:1 with white text is darkened until it does, and
  lightened the same way in dark mode.
- **System colours for states**, never colour alone: on it (tint), done
  (green `#34C759` / dark `#30D158`, with a tick), running late (orange
  `#FF9500` / `#FF9F0A`, with "+10 min"), need help (red `#FF3B30` /
  `#FF453A`, with "Help requested"), handed back (grey, struck through).
- **Dark mode** follows the phone. A helper can also switch it from the More
  sheet, kept on their device.

### 5.3 Shape, depth and materials

- Corner radii: 22 px for the Now card, 16 px for buttons and grouped lists,
  12 px for photos, capsules for status tags.
- Cards sit on the grouped background with no shadow in dark mode and a very
  soft one in light mode (`0 1px 2px rgba(0,0,0,0.04), 0 8px 24px
  rgba(0,0,0,0.06)`).
- Lists are **inset grouped**: rounded, with separators inset past the
  leading icon.
- **Bars are translucent**: the tab bar and the collapsed title bar use a
  blurred material (`backdrop-filter: saturate(180%) blur(20px)` over a
  70–80% background), with a hairline edge. Where blur isn't supported, they
  are solid.
- Sheets rise from the bottom with a grabber, a 16 px top radius and a dimmed
  backdrop; they can be swiped down to close.

### 5.4 Icons

A single line-icon set drawn for WEDPLAN in the style of system symbols: a
1.75 px stroke on a 24 px grid, rounded ends, matched to the text weight
beside it. Every icon sits next to a word. Icons are inline SVG, not a font.

### 5.5 Motion and haptics

- Spring animations (about 350 ms, gently damped) for sheets, the Now card
  changing state and rows moving to Earlier today. Fades are 150 ms.
- The Done tick draws itself; the progress ring fills smoothly.
- **Reduced motion** replaces every movement with a fade. **Reduced
  transparency** makes the bars solid.
- Haptics, where the phone allows: a light tap on Start, a success pattern on
  Done and Taken, a firm double tap on Need help.

### 5.6 Layout

- Designed at 390 × 844, with safe-area insets (`env(safe-area-inset-*)`)
  respected top and bottom, and working from 320 px wide up.
- A **large title** ("Today") collapses into the translucent bar as the page
  scrolls.
- The primary button sits at the bottom of the Now card, 56 px tall, in the
  thumb zone. Secondary actions are a row of three grey buttons with an icon
  above a label.
- Every control is at least 44 × 44 px.

### 5.7 A home-screen app

The link is an installable web app: a manifest with the wedding's initials
on a tint-coloured icon, `display: standalone`, a matching status-bar colour,
and a splash in the grouped background. The first-open screen (§6.1) shows
how to add it to the home screen. Once added, it opens full screen like an
app.

### 5.8 The bar for done

A day-link screen is finished only when it has been checked on a real iPhone
and a real Android phone, in light and dark, at the default and the largest
text size, with reduced motion on. The mockups canvas ("Shot list & seating
mockups", the last row) shows the intended look.

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
   - who else is on it (names only), and "You're leading this" when they are
     the task's lead (§10.2);
   - the task's **instructions** (§10.1), never the couple's private notes;
   - its **steps**, as a checklist they tick (§6.3), and **what to bring**;
   - the couple's photos and files (§6.10);
   - the task's own contact, when it has one ("Ask Jo if anything's wrong");
   - the **primary button** (§6.4);
   - a row of three secondary buttons: **Running late**, **Need help**,
     **More** (which holds **Can't do it** and **Add a note**).
4. **Next up:** their following tasks, each a row with time, title and
   location. Tap one to open it.
5. **Earlier today:** done and past tasks, folded, with their final state.
6. **Contacts:** call and text buttons for the day contacts the couple chose
   (§10.6).

A task the couple changed since the person last saw it carries a badge:
"Changed: was 1:45, now 2:00", until they open it.

### 6.3 A task

Opening any task shows the same card as Now, full screen, with its buttons.
**Back** returns to My day.

- **Steps** are a checklist. Each helper ticks their own; ticking every step
  doesn't mark the task done, and Done doesn't tick the steps. A step tick is
  an activity row (§9), so the master shows "2 of 4 steps".
- **What to bring** is a plain list, with no ticks.
- A task in **critical** (§10.1) shows a small "Must not slip" tag, so the
  helper knows the master is watching it closely.

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
  "Saturday 6 March" and the jobs, with Start and Done disabled and "You can
  start these on the day". **Can't do it** already works, so the couple
  learns early that someone can't make a task, and the master's readiness
  check (spec 55 §7) lists it.
- **The day** starts at midnight before the first event, in the wedding's
  timezone. From then on the buttons work.
- **More than one day** (welcome drinks on Friday, recovery brunch on
  Sunday): My day groups tasks by day, opens on today's, and each task's
  buttons work from midnight before that task's own day.
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

### 6.11 Confirming

Each task they haven't seen before has a **Got it** button under its card,
until the day. Tapping it confirms they know about the task. **Got it to all**
appears when there are several. The master's readiness check (spec 55 §7)
shows "Confirmed 8 of 10". Confirming is never required, and a task changed
after it was confirmed asks again ("Changed since you confirmed").

### 6.12 I'm here

On the day, until they tap it, the top of My day shows **I'm here** ("Tap
when you arrive"). It records their arrival for the master's People list
(spec 55 §5.7). There is no location tracking: arriving is a tap, never a
GPS check.

### 6.13 Announcements

Messages from the master (spec 55 §5.8) to everyone, a group, or one person
show at the top of My day, newest first, as cards: "Ceremony running 10
minutes late", "Rain plan: everything moves to the woolshed". Opening the
page marks them seen. An **important** announcement stays pinned with an
**OK, got it** button until tapped, and the master sees who has acknowledged
it.

### 6.14 Good to know

A **Good to know** tab (or section, on a link with no modules) holds what
every helper needs and nobody wants to ring about: the venue address and
parking, the wet-weather plan, where the first-aid kit and toilets are, the
wifi, and the day contacts. The couple writes it once (§10.9). It shows
before the day too.

### 6.15 Reminders

- **The day before**, a helper with an email address gets one email at 6 pm
  in the wedding's timezone: "Your jobs tomorrow", with their tasks and their
  link. The couple can turn this off per wedding.
- **On the day**, a helper who has added the link to their home screen (§5.7)
  can switch on **Remind me 10 minutes before each job**. It uses web push,
  which iPhones support only for home-screen web apps; on other phones it
  works in the browser too. It is off until they switch it on, and their
  phone asks for permission.

### 6.16 Cues

A task the couple marks as a **cue** (the walk-in music, the first dance,
the speeches) is a moment that has to start exactly on someone's word. From
5 minutes before it, the assignees' Now card shows **Standby** with a
countdown, and the page refreshes every 3 seconds instead of every 15. When
the master taps **Go** (spec 55 §5.2), their card turns to **Go now**, the
phone vibrates, and the countdown becomes "Started 0:04 ago".

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
| `step_done`, `step_undone` | a step ticked or unticked (§6.3) | the item, the step |
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

## 10. The couple's side: tasks, people and links

Everything here is done by the couple, or a planner login where spec 39
allows it. It extends spec 50's run sheet editor and screens; nothing there
is replaced.

### 10.1 What a task holds

Spec 50 gives every run sheet item a title, start and end, "starts after",
location, notes, an event label, assignees and the guest-visible flag. For
helpers a task also holds:

| Field | What it is | Who sees it |
| --- | --- | --- |
| **Instructions** | what to do, in a few lines ("Two per household, keep a few for latecomers") | the assignees, on their link |
| **Notes** (spec 50's) | the couple's private notes about the task | the couple and planner only |
| **Steps** | an ordered checklist, up to 12 ("Collect the boxes from Mere's car", "Set them out at the gate") | the assignees, who tick them |
| **What to bring** | a short list ("Programmes, the sign, tape") | the assignees |
| **Where** | spec 50's location, plus an optional address or map link for Directions | the assignees |
| **Contact for this task** | one of the day contacts (§10.6), or any assignee on the task | the assignees, as a call button |
| **Photos and files** | up to 10 (§6.10) | the assignees |
| **Ask for a photo when done** | §6.10 | the assignees |
| **Critical** | the master raises "not started" at the start time instead of 5 minutes after, and in red (spec 55 §5.1) | the couple; helpers see "Must not slip" |
| **Opens** | a module the task leads to, such as the shot list (§6.7) | the assignees |

Instructions and notes are separate on purpose: what the couple writes for
themselves never reaches a helper.

### 10.2 Assigning

- **From the task:** spec 50's assignee picker (one search over collaborators,
  guests, vendors and people, multi-select, "Both of us", and "add a person"
  for someone in none of them). Each chosen assignee shows as a chip, with
  their link state (§10.5).
- **A lead:** when a task has more than one assignee, one can be marked
  **lead** from their chip's menu. The lead sees "You're leading this"; the
  others see "Tama is leading this". The lead is who the master calls first.
- **Groups:** the couple can save a **group** ("Ushers": Sione, Tama, Rangi,
  Hemi) and pick it in the assignee picker. Picking a group adds each member
  as their own assignee, so each has their own Done.
- **From the person:** each guest, vendor and person page has **Tasks on the
  day**: their tasks in time order, **+ Assign a task** (pick an existing
  task or create one with this person already on it), and remove.
- **Several at once:** in spec 50's list view, tasks can be selected and
  **Assign to…** adds the same people to all of them.
- **Clashes:** spec 50's soft warning when one person is on two overlapping
  tasks stays, and is shown in the picker before they are added ("Sione is
  seating guests then").
- **Open tasks:** instead of naming people, a task can be **open to a group**
  with a number of places ("2 ushers to run the guestbook"). It shows on every
  group member's link under **Can you help?**, and the first to tap **I'll
  do it** are assigned, until the places are filled. The couple can still
  assign anyone directly.
- **Handing over:** a helper's Can't do it sheet (§6.4) can suggest who could
  take it, from their own group. The suggestion goes to the master with the
  hand-back; nobody is moved until the couple or planner reassigns.

### 10.3 The People view

A third view on `/run-sheet`, beside Timeline and List: one row per person
with a task, their tasks laid along the day, so gaps and clashes show at a
glance. Each row shows their link state and how many tasks they have. People
with no task aren't listed; **Unassigned tasks** sits at the top while there
are any.

### 10.4 Suggested tasks

**+ Task from a suggestion** offers common helper tasks with instructions
and steps already written, to edit before adding: hand out programmes, seat
guests for the ceremony, ring bearer, guestbook table, gift table, run the
music for the walk in, family photo wrangler (linked to the shot list),
signing witnesses, pack down and load the cars, return hired items. The list
is code, not data.

### 10.5 Links

- Each assignee chip shows their link state (no link, made, opened) and their
  part's state on that task. The chip's menu has **Make their link**, **Copy
  link**, **Show QR code**, **Send by email** (when an address is known),
  **See what they see** (their link in a read-only preview, no taps
  recorded) and **Turn off**.
- The first time someone is assigned a task and has no link, the chip offers
  **Make their link**.
- **Day links** (`/run-sheet/links`) lists everyone assigned anything, one
  row each: their link state, last opened, their modules (switch any offered
  module on or off), and **Make links for everyone without one**.
- **Print sheet:** one card per person with their name, their jobs and a QR
  code for their link (the `qrcode` package), for handing out on the day.
- **Guest and vendor pages** show the person's link state and the same menu.

### 10.6 Day contacts

On the Day links screen: who appears as a contact on every link (the
planner, the venue coordinator, a family member), each with a phone number.
A task's own contact (§10.1) is picked from these or from its assignees.

### 10.7 Helpers' details

`people` gains **phone** and **email**, so a helper added as a person (spec
50 §7.5) can be called from the master, texted, emailed their link and sent
the day-before reminder. Guests and vendors already have both. The picker's
"add a person" asks for a name and, optionally, a phone and email.

The couple enters helpers' numbers themselves. An assignee chip for anyone
with no phone number shows **Add phone**, which edits it in place on the
guest, vendor or person it belongs to, and the master's readiness check
lists anyone still without one (spec 55 §7). Helpers never type their own
details into a link.

### 10.8 Questions before the day

A note a helper adds before the day (§6.4) lands on the master's readiness
check as a **question** ("Where do I park?"), with **Answer**. The answer
shows on their link like a help answer. On the day, notes go to the live
feed as before.

### 10.9 Good to know

On the Day links screen, an editor for §6.14: a short list of headed
sections the couple can add to, reorder and delete, starting with Venue and
parking, Wet-weather plan, First aid and toilets, and Wifi, each empty.

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
- `run_sheet_items` gains `instructions text null`, `address text null`,
  `critical boolean not null default false` and `contact_id uuid null` (a
  day contact) or `contact_assignee_id uuid null` (an assignee on this
  task), at most one set.
- `run_sheet_item_steps (id, wedding_id, item_id, kind text check (kind in
  ('step','bring')), text, sort_order)`, at most 12 steps and 12 bring items
  per task (checked in the action).
- `run_sheet_step_ticks (wedding_id, step_id, assignee_id, ticked_at,
  primary key (step_id, assignee_id))`.
- `run_sheet_item_assignees.is_lead boolean not null default false`, with a
  partial unique index on `(item_id) where is_lead`.
- `helper_groups (id, wedding_id, name, sort_order)` and
  `helper_group_members (id, wedding_id, group_id, collaborator_user_id null,
  guest_id null, vendor_id null, person_id null)`, exactly one set, the same
  shape as `run_sheet_item_assignees`.
- Saving a task with its steps and assignees stays **one transaction**,
  through spec 50's save function, extended.
- `run_sheet_item_assignees.confirmed_at timestamptz null` (§6.11), cleared
  when the task's time, place or instructions change.
- `day_links.arrived_at timestamptz null` (§6.12).
- `day_announcements (id, wedding_id, audience text check (audience in
  ('everyone','group','link')), group_id null, link_id null, text,
  important boolean, sent_by, sent_at)` and `day_announcement_reads
  (announcement_id, link_id, seen_at, acknowledged_at null, primary key
  (announcement_id, link_id))` (§6.13).
- `day_info_sections (id, wedding_id, heading, body, sort_order)` (§6.14,
  §10.9).
- `day_push_subscriptions (id, wedding_id, link_id, endpoint unique,
  p256dh, auth, created_at)`, deleted when the link is revoked or expires
  (§6.15).
- `run_sheet_items.is_cue boolean not null default false`,
  `cue_called_at timestamptz null` (§6.16).
- `run_sheet_items.open_to_group_id uuid null`, `open_places int null check
  (open_places between 1 and 20)`, both set or neither (§10.2).
- `people.phone text null`, `people.email text null` (§10.7).
- **The every-minute job** (§6.15, §19) is a `pg_cron` schedule calling a
  route with a secret header. It is created by a script
  (`scripts/ensure-day-cron.mjs`), not a migration, because `pg_cron` doesn't
  exist on the bare Postgres the SQL suite runs on (the same reason the
  storage bucket is made by `scripts/ensure-bucket.mjs`). The route does the
  work; the job only calls it.
- New activity kinds (§9): `confirmed`, `arrived`, `claimed`,
  `announcement_seen`, `announcement_ok`, `question`; the master writes
  `cue_go`.
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
- `src/lib/run-sheet/suggested-tasks.ts`: §10.4's list.
- `src/server/actions/run-sheet.ts` extended: instructions, steps, bring
  list, contact, critical, lead, groups, assign from a person, assign several.
  The link side adds `tickStep`, `untickStep`, `confirmTasks`, `markArrived`,
  `claimOpenTask`, `markAnnouncementSeen`, `acknowledgeAnnouncement`,
  `savePushSubscription` and `removePushSubscription`.
- `src/lib/day-links/reminders.ts`: who is due a day-before email or a
  10-minute push, from tasks, timezone and subscriptions. Pure and tested.
- The send side reuses `src/lib/email/send.ts` for email and adds a web push
  sender (`web-push` with VAPID keys held as server environment variables).
- The People view on `/run-sheet`, Tasks on the day on guest, vendor and
  person pages, and the group editor.
- `src/components/day-link/`: the shell, Now card, task row, button sheets,
  confirmation, offline strip and tab bar, shared by every module.
- Screens: `/d/[token]`, `/run-sheet/links`, the print sheet, and the chip
  menu on the run sheet.

## 14. Out of scope

- Accounts for vendors or helpers, or one person seeing several weddings.
- Two-way chat. A help request gets one answer back. Notes go one way.
- Texts sent by the app. Reminders are the day-before email and opt-in web
  push (§6.15) only.
- GPS or location tracking of helpers, including geofenced check-in.
- Shift swaps between helpers without the couple: a helper can suggest
  someone, never move a task themselves.
- Hours worked or pay for helpers.
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
7. **Look:** a native-feeling, Apple-inspired app look with the wedding's
   accent as its tint (§5), for day links and their modules only; the
   planner screens and the site keep their own. Rejected: the full site
   theme (readability would depend on it), and the three earlier directions
   (Programme, Night shift, Daylight).
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
2a. Tasks (§10.1–§10.4): instructions, steps, bring list, contact, critical,
   lead, groups, Tasks on the day, assign several, the People view and
   suggested tasks, all in the couple's run sheet before any link exists.
   Phone and email on people (§10.7).
3. Making, copying, revoking and emailing links: the run sheet chip and the
   Day links screen.
4. `/d/[token]`: the shell, first open, My day, the Now card, the task
   screen, before and after the day.
5. The buttons, their sheets, confirmations and activity rows.
5a. Photos: reference photos on items (couple), helper photos on Done, Need
   help and notes, "Ask for a photo when done".
6. The offline queue, live polling and the Changed badge.
7. The print sheet with QR codes.
7a. Got it, I'm here, Good to know, questions before the day, open tasks and
   handing over (§6.11, §6.12, §6.14, §10.2, §10.8).
7b. Announcements, with spec 55 §5.8 (§6.13).
7c. Reminders: the day-before email, then web push (§6.15), each behind its
   answer in §19.
7d. Cues, with spec 55's Go (§6.16).
8. Spec 55's master reads what this writes; specs 52 and 53 plug in their
   modules.
9. Typecheck, tests, SQL suite, build. On a real phone: open a link, start
   and finish a task, ask for help and see the answer, go offline, tap,
   reconnect.

## 17. Answered — 2026-11-24 (tasks and assigning)

Every question took its recommendation.

1. **Existing notes** stay private; instructions start empty (§10.1).
   Rejected: copying notes into instructions.
2. **Groups** add their members one by one; later changes to a group don't
   touch tasks already assigned (§10.2). Rejected: tasks linked to the group.
3. **Can't do it before the day:** yes (§6.5).
4. **Suggested tasks:** a fixed list in the app (§10.4). Rejected: the
   couple saving their own.
5. **Making links:** offered on first assignment (§10.5). Rejected: making
   them automatically.

## 18. What the leading tools do, and where it's covered

Read from the products' own pages and listings (Rosterfy, Connecteam,
Deputy, SignUpGenius, VolunteerHub, That's The One, TIMED, Timeline Pro,
EventSync, TMLN, Rundown Studio, Ontime, CueTimer, zkipster). Not tried
hands-on.

| Pattern | Seen in | Here |
| --- | --- | --- |
| A personal view of only your own items, by link with no login | That's The One, TIMED, EventSync | §3, §6.2 |
| Accept or confirm an assignment | Connecteam, That's The One | §6.11 |
| Check in on arrival | Rosterfy, EventSync, zkipster | §6.12 (a tap; no geofence) |
| Broadcasts to everyone or a role, with who has seen them | EventSync, VolunteerHub, Rosterfy | §6.13, spec 55 §5.8 |
| Reminders before each item, and the day before | EventSync (10 minutes before), TIMED, SignUpGenius | §6.15 |
| Open shifts that people claim | Connecteam, SignUpGenius | §10.2 open tasks |
| Releasing a shift and suggesting a replacement | Connecteam | §10.2 handing over |
| Checklists with photo proof | Connecteam, Deputy (photo on clock-in) | §6.3 steps, §6.10 photos |
| Role-specific views of one shared plan | Rundown Studio, Ontime, EventSync (shot list, music queue) | §7 modules |
| Standby and Go cues with a live countdown | Rundown Studio, Ontime, CueTimer | §6.16, spec 55 §5.2 |
| Times reflow when the schedule slips | Runsheet, TMLN | spec 55 §5.4 |
| Comments or questions on an item before the day | Timeline Pro | §10.8 |
| Works offline | EventSync | §6.8 |
| An activity log of every change | zkipster | §9, spec 55 §5.5 |
| Sensitive planner context hidden from roles | EventSync | §10.1 (instructions vs notes), §12 |

## 19. Answered — 2026-11-24 (from the tools pass)

Every question took its recommendation.

6. **Web push reminders:** yes, opt-in, for helpers who add the link to
   their home screen (§6.15). The every-minute job is Supabase `pg_cron`
   calling a token-protected route, like the existing cron routes, so no
   Vercel plan change is needed. Rejected: no push.
7. **Cues:** yes, Standby and Go with 3-second refresh from 5 minutes before
   (§6.16, spec 55 §5.2).
8. **Open tasks:** yes, a group can claim a task (§10.2).
9. **The day-before email:** on by default for helpers with an email, sent at
   6 pm in the wedding's timezone by the same `pg_cron` job (§6.15). The
   couple can turn it off.

## Build status (session 60)

**Built** (typechecked, unit-tested, SQL-suite tested, `npm run build`; never opened in a browser or run on live):

- Migration `0050`: day links, devices, append-only activity, per-assignee state and "Got it", task content (instructions, address, critical, contact, steps, bring list, ticks), day contacts, Good to know, phone and email on `people`.
- `src/lib/day-links/` (`state.ts`, `my-day.ts`, `tint.ts`) with tests; `src/server/day-links/` (token resolve with the shared throttle, the link's scoped read).
- Couple's side: `/run-sheet/links` (make, copy, email, new link, turn off, phone and email in place, "make links for everyone", day contacts, Good to know, answer help requests), the print sheet with QR codes, and a "For the people helping" section in the run sheet item editor.
- Helper's side `/d/[token]`: first open, My day (Now/Next up/Earlier today, help banner, I'm here, Got it, contacts, Good to know), the task screen with steps and bring list, Start/Done/Undo, Running late, Need help, Can't do it, Add a note (a question before the day), the 15-second poll, the Changed badge, before/after-the-day phases, the wedding's accent as tint, dark mode. Privacy page names it.

**Not built yet** (each still as specced): reference photos and helper photos (§6.10, step 5a); the offline queue and its strip (§6.8; a tap with no signal shows an error and is not queued); the home-screen manifest and icon (§5.7); modules and their registry (§7); groups, leads, open tasks, handing-over suggestions, the People view, suggested tasks, "Tasks on the day" on guest/vendor/person pages, assign-several (§10.2–§10.4); the assignee chip's menu on the run sheet (the Day links screen does its job) and "See what they see"; announcements (§6.13, with spec 55); the day-before email and web push, and the `pg_cron` script (§6.15); cues (§6.16); `opens_module`, `photo_on_done` and the other columns for the unbuilt parts; reordering Good to know sections.

**Deviations:** saving a task's helper content is a second call after the item's own save, not one transaction (a failure says the item saved but the details didn't). Audit rows for a helper's taps show `actor_kind = 'public'` but not the link's label. "Changed" shows the badge without "was 1:45, now 2:00" (previous times aren't stored). The `/d/` page sets `no-referrer` and is `force-dynamic`.
