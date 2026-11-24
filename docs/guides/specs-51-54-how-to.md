# WEDPLAN how-to guide: specs 51–54

As of 2026-11-24. Written from the specs and their Build status sections, not from using the app, so a button's wording may differ slightly from the screen.

## What's new

Specs 51–54 add four things: event types, a live phone page for everyone helping on the day, a shot list for the photographer, and a faster seating plan. Day links (spec 54) are the base the shot list and seating plug into.

| Feature | Spec | Where the couple uses it | Who else uses it |
| --- | --- | --- | --- |
| Event types and per-event switches | 51 | `/events` | Guests (they only see what applies) |
| Day links | 54 | `/run-sheet`, `/run-sheet/links` | Vendors, ushers, family helpers on their phones |
| Shot list | 52 | `/shots` (under The day) | Photographer and family wrangler, through their day link |
| Seating workspace | 53 | `/events/[id]/seating` | Ushers, through the Seating tab on their day link |

The on-the-day master at `/day` (spec 55) is where the couple and planner watch everything day links send. It is outside this guide.

## Setup before anyone uses it

Apply the migrations to live first; nothing in these specs has been run against the live database. Steps 3–5 are only for day-link photos and push reminders.

1. Apply the migrations in order. Each spec's number moved up one because spec 54 used two files:

   | Migration | Spec |
   | --- | --- |
   | `0049` | 51 Event types |
   | `0050`, `0051` | 54 Day links |
   | `0052` | 52 Shot list |
   | `0053` | 53 Seating |

2. Check the spec 51 backfill on live. It gives every existing event a type (matched by name, otherwise Other) and turns seating on only where a plan already has tables. It was tested only on empty tables.
3. For push reminders, run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in Vercel. Without them, helpers never see the Remind me switch.
4. Run `node scripts/ensure-day-cron.mjs` with `SUPABASE_DB_URL`, `SITE_URL` and `CRON_SECRET` set. It needs the `pg_cron` and `pg_net` extensions in Supabase.
5. If the private photos bucket doesn't exist yet, run `node scripts/ensure-bucket.mjs`.

Day links send no email. That was removed in session 61, so reminders are push only.

## Event types (spec 51)

Every event now has a type, and each event turns off the features it doesn't need. A type only sets the starting switches; after that, the event's own switches decide.

**Give an event a type**

1. Open `/events` and add or edit an event.
2. Pick a **Type**. On a new event this sets the switches under **What this event needs**.
3. Adjust the switches: Guests reply, Seating plan, Shown on the public site, Main event, and Just us — not shown to guests.
4. Save. Changing the type of an existing event leaves its switches as they are.

**What each switch does**

| Switch off | Effect |
| --- | --- |
| Guests reply | Left out of the RSVP form, reply card, counts, `/guests` columns, chase emails and RSVP export. Guests still see it on their page. Old replies are kept. |
| Seating plan | No Seating button, not in the `/seating` picker. Existing tables are kept for when it's turned back on. |
| Just us (guest-facing off) | Never on a guest page or the site, not in Invitations' who's invited. Still on `/events`, the calendar and the run sheet. |

A main event must ask for replies, so some switches are greyed out with the reason beside them.

**Make your own type**

1. Choose **+ New type** at the bottom of the Type select, or open **Event types** at the foot of `/events`.
2. Give it a name (1–40 characters, unique) and its four defaults. Or use **Duplicate** on an existing type, such as Welcome drinks into Mehndi.
3. Use **Rename**, **Hide** / **Show again** and the up and down arrows to manage the list. Types are never deleted, and **Other** can't be hidden.

Nine types come built in: Ceremony, Reception, Ceremony & reception, Rehearsal dinner, Welcome drinks, After party, Recovery brunch, Getting ready / photos, and Other.

## Day links (spec 54)

Each helper without a login (a vendor, an usher, a family member) gets one private link that opens a phone page of their jobs. Every tap they make goes to the couple's master on the day.

**1. Write the tasks** on `/run-sheet`. In a run sheet item's helper section, fill in what the helper needs:

- **Instructions** (shown to helpers) and **Notes** (private, never shown)
- **Steps** (up to 12, helpers tick them) and **What to bring**
- An address for directions, a **contact** for the task, and up to 10 reference photos or files
- **Must not slip**, **Ask for a photo when done**, **Cue** (for moments that start on your word), and **Opens** (a module such as the shot list)

**+ Task from a suggestion** gives ready-written tasks to edit, such as hand out programmes, guestbook table, or pack down.

**2. Assign people.** Use the assignee picker on the task, or **Tasks on the day** on a guest or vendor page. Other ways to assign:

- Save a **group** ("Ushers") and pick it to add every member at once.
- Mark one assignee as **lead** from their chip.
- Open a task to a group with a number of places. It shows under **Can you help?** and the first to tap **I'll do it** take it.
- Use **Assign someone to several tasks** to put one person on many tasks.

The **People** view on `/run-sheet` shows one row per person across the day, so gaps and clashes are easy to spot.

**3. Make and share links.** Open **Day links →** (`/run-sheet/links`):

1. Tap **Make links for everyone without one**, or **Make their link** on one person. Making a new link turns off the old one.
2. Share it: **Copy link**, **Show QR code**, or the **print sheet** (one card per person with a QR code).
3. Use **See what they see** to preview their page. Nothing you tap there is sent.
4. Set **day contacts** (shown on every link with call buttons) and **Good to know** (parking, wet-weather plan, first aid, wifi).
5. Turn modules on or off per person, such as the Shot list or Seating tab.

**What the helper does on their phone**

1. Opens the link and taps **See my jobs**. Before the day they can read everything, tap **Got it**, add a question, or tap **Can't do it**.
2. On the day, taps **I'm here** on arrival.
3. Works from the **Now** card: **Start**, then **Done** (with **Undo** after each tap).
4. Uses **Running late**, **Need help** or **More** (Can't do it, Add a note) when something goes wrong. Photos can go with Done, Need help or a note.
5. Can add the page to their home screen and switch on **Remind me 10 minutes before**.

The page refreshes every 15 seconds and keeps working offline: taps wait on the phone and send when the signal returns. The link stops working a week after the day.

## Shot list (spec 52)

The couple builds the shot list at `/shots`, and the photographer works through it from their day link. Every wedding starts with six empty sections: Getting ready, Ceremony, Family formals, Couple portraits, Reception and Details.

**Build the list**

1. Open `/shots` from **The day** in the sidebar.
2. Link each section to a run sheet item so it takes that item's time and place.
3. Add shots. Each has a title, a kind (group, moment, detail, portrait), the people in it, **must-have**, estimated minutes, an optional reference photo, a note, and lead or second shooter.
4. Add people as guests, people from your team, or a role in words ("All the cousins").
5. Use the up and down buttons (or drag) to reorder.

**Let it help**

- **Suggest groups** asks for each side's parents, siblings and grandparents, then proposes the standard family formals. Tick the ones to add. Step-parents stay in separate groups.
- **Suggest an order** finds the order with the fewest call-backs (people asked back into a later shot). Press **Use this order** to apply it, and **Undo** to go back.
- The **slot fit** line shows how long the section takes against its run sheet slot, such as "8 groups · about 19 minutes of a 45 minute slot". It turns amber when over.
- The **Faces** panel adds a photo, a relationship ("Aroha's grandmother") and a vendor note to a guest. The photographer sees these; your private guest notes stay private.

**Share it.** The Shot list tab is on by default for photography and videography vendors. Someone whose run sheet task opens a section (a family wrangler) gets the tab for just that section. Switch it for anyone else on the Day links screen.

**The photographer's tabs**

| Tab | What it shows |
| --- | --- |
| Now | The next shot in large type, who to call up, who can go, and what's next. Buttons: **Taken**, **Undo**, **Later**, **Skip**. |
| All shots | Every shot; tap to mark it taken. Filters for left, must-haves and missed. |
| Faces | Everyone in a shot who has a photo or relationship, with their vendor note. |

Taps work offline. `/shots` updates every 15 seconds on the day, so you see "Family formals · 4 of 12" move. For a paper backup, use `/shots/print` (one section per page) or the **shots** CSV export.

## Seating workspace (spec 53)

The seating plan at `/events/[id]/seating` is quicker to set up, every change can be undone, and ushers can use it on the day. The event's **Seating plan** switch (spec 51) must be on.

**Set up the room**

1. On an event with no tables, the first screen is **Set up the room** (or **Start blank**).
2. Choose how many to seat (said yes + not answered, or said yes only), the table type, where the couple sits, and what's in the room (dance floor, bar, cake table and so on).
3. Check the preview line, such as "12 tables · 128 seats for 120 people · 8 spare chairs".
4. Press **Use this layout**. It is one undo step.

**Add and change tables**

- **+ Tables** adds several at once ("6 rounds of 10").
- **Duplicate** on a table copies its shape and seats, not its guests.
- Type a number another table already has, and the two numbers swap.

**Seat people**

- Tap an empty chair to search unseated guests. Households offer **Seat all N** or one person.
- **Select several** (checkboxes, Shift for a range), then **Seat N at…**. Anyone who didn't fit stays selected.
- Search also finds seated guests and rings their chair.
- Mark guests who need a highchair or use a wheelchair. A wheelchair user takes no chair.
- **Colour by Fit** shows how well each table works, with counts.
- Before printing, "N people aren't seated yet — see who" shows above **Print & share**.

**Undo and history**

- **Cmd+Z** or **Ctrl+Z** undoes; **Shift+Cmd+Z** or **Ctrl+Y** redoes. The toolbar buttons name the last action. Up to 100 steps, cleared on reload.
- An undo is refused ("Someone changed the plan since") if anyone else changed the plan in between.
- The clock button opens **History**. A version is saved automatically before the first change after 30 quiet minutes, and the newest 30 are kept. Use **Save this version…** for named copies. **Restore** asks first and replaces the plan for everyone.

**On the day.** Turn on the Seating tab for ushers on the Day links screen. They can find a guest's seat, mark them **Arrived**, move them to a spare chair, and seat a walk-in with a note. The couple's plan shows ticks and a count such as "86 of 112 here".

## Known limits

These differ from the specs as built. Each spec's Build status section has the full list.

- **No Remind me switch for helpers:** the VAPID keys aren't set (Setup, step 3). On iPhone, push works only after the link is added to the home screen.
- **Seating undo refused:** undo restores the whole plan, so any change by someone else in between blocks it, not just a change to the same table.
- **Tab bar holds five tabs at most.** Shot list (3) plus Seating (1) fit alongside My day.
- **No sunset time** on the shot list's Now tab (no venue coordinates are stored).
- **Shot reference images are upload only**, with no mood-board picker. Faces details are edited from the shot list, not the guest page.
- **Show and meal colours** reach only the table drawer's chairs, not the Room view or the floor-plan print. Blocked chairs aren't drawn on the Room view.
- **Tasks on the day** isn't shown for helpers added as people; use the People view or the Day links screen.
- **Claiming an open task needs a signal.** It isn't queued offline, so two phones can't both claim the last place.
- A task's contact can only be a day contact, not another assignee.

## What has been tested

Typecheck, unit tests, the SQL suite and the build all pass. Most screens in this guide have never been opened in a browser, so test them before guests or vendors use them.

| Screen | Rendered in a browser? |
| --- | --- |
| Helper page `/d/[token]` | Yes, headless at phone width with sample data |
| `/events` form and Event types panel | No |
| Day links screen `/run-sheet/links` | No |
| `/shots` and the photographer's tabs | No |
| Seating changes and the ushers' Seating tab | No |

Nothing has run against live Supabase, on a real phone or iPad, or with real push notifications. A good first check: on a test wedding, make a link for yourself, open it on your phone, and tap through one task.
