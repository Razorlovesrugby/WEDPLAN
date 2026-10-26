# WEDPLAN — how to use it

> A designed version of this guide, with screenshots, is in [`USER-GUIDE.pdf`](USER-GUIDE.pdf).

A guide for the couple and the close collaborators (partner, family helping
out). It covers what the app is, how the pieces fit together, where each thing
lives, and the one idea that trips people up: **there is no single wedding
website — every household gets its own page, and that page is their invitation.**

> **About this guide.** It was written from the code and the specs in
> `docs/specs/`, not from clicking through a running app. As of the last
> handoff (`docs/HANDOFF.md`, session 42) the app had never been opened against
> the live database in a real browser for most of its newer features, and
> migrations `0026`–`0039` were not yet applied to the live project. If a
> screen described here errors or looks wrong, check `HANDOFF.md` first — it
> says what has been seen and what has only been compiled.

---

## 1. What WEDPLAN is

One place to run the whole wedding, in place of spreadsheets and group chats.
Roughly in the order a couple touches it:

| Stage | What you do | Where |
| --- | --- | --- |
| Decide who | Build the guest list as **households**; rank them; draw the cut line at venue capacity | Guests, Ranking, Settings |
| Plan | Tasks and a timeline, budget, vendors, moodboards, events | Tasks, Budget, Vendors, Moodboards, Events |
| Tell people | Design the **save the date**, then the **invitation site**, and send each household its own link | Guests → Save the date / Invitations, Site |
| Collect answers | RSVPs, dietary and access needs, extra questions, coach seats, song requests | Invitations, Questions, Travel |
| Fine-tune | Seating plan, run sheet, gift registry | Events → Seating / Run sheet, Registry |
| Day-of and after | Run sheet, catering numbers, thank-you tracking on gifts | Events, Guests, Registry |

A few rules the whole app follows, because they explain behaviour you will notice:

- **Money is NZD only**, kept as whole cents, with a per-line GST setting.
- **Times are shown in the wedding's own timezone** (set in Settings), whoever is looking and wherever they are.
- **Guests are never hard-deleted.** Removing a guest hides them; the record of who was asked stays reconstructable.
- **Everything belongs to one wedding.** Each account sees only its own wedding's data.

---

## 2. The big idea: one address per household

Most wedding sites are one public page everyone visits. WEDPLAN deliberately
isn't. When you add a household (say, "The Okonkwos"), the app immediately
gives it an address:

```
/w/mia-and-jonah/okonkwo-4f7ak
     └─ wedding ──┘ └─ household ┘
                      name  + 5 random characters
```

- **The readable part** (`okonkwo`) is just a label so a link says whose it is. It comes from the household name, with filler like "The" and "family" stripped. You can edit it on the household's screen; old links keep working after an edit.
- **The 5 random characters** (`4f7ak`) are the actual key. Behind the address sit the household's names, dietary notes, an RSVP form that can answer on their behalf, coach seats and photo uploads. The label alone would be guessable by anyone who knows the couple; the suffix is not. **Treat the full link like a house key — send it to that household only, don't post it publicly.**
- **There is no shared page.** `/w/mia-and-jonah` on its own is a plain "not found" on purpose. A guest can only ever reach a page that is *theirs*.

### What "the site is the invitation" means

You build the wedding site once, in the **Site** editor, from blocks (hero,
the weekend, RSVP, travel, FAQ, gallery…). That one design is rendered
**separately for every household**. Some blocks are *personal* and change per
household:

| Block | What each household sees |
| --- | --- |
| The weekend (schedule) | Only the events **they** are invited to — a ceremony-only household reads about the ceremony and nothing else — plus each event's note |
| RSVP | Their own people, their events, their questions |
| The coach | Times and stops, and a way to reserve their own seats |
| Your table | Where they're sitting, but only after the reveal date you choose on the seating plan |
| Guestbook | A line from them |

Everything else (story, FAQ, map, gallery…) reads the same for everyone. So the
"invite" and the "website" aren't two products — the invitation **is** the
website, personalised.

Two more links exist that are **not** per-household:

- **The gift registry** (`/registry/<wedding slug>`) — one address you can send to anyone, separate from every invitation. See §6.
- **Moodboard share links** — a link per board, no account needed.

Old-style links (`/i/<token>`, `/rsvp/<token>`) from earlier versions redirect to the household's new address, so anything already sent still works.

---

## 3. Save the date vs. invitation — why they're different

They share a household address, but they are two different pages with
different jobs. The save-the-date is the household address with
`/save-the-date` on the end:

```
Save the date:  /w/mia-and-jonah/okonkwo-4f7ak/save-the-date
Invitation:     /w/mia-and-jonah/okonkwo-4f7ak
```

| | Save the date | Invitation |
| --- | --- | --- |
| **Job** | "Block out this date" — go out early, before details are settled | "Here's your weekend — please answer" — the real thing |
| **What it shows** | A designed card: names, date, place, photos, message. Same for everyone (with a household greeting) | The full site, personalised: *their* events, RSVP, travel, FAQ, coach, uploads |
| **Asks for an answer?** | No. Nothing to answer | Yes — the RSVP form |
| **Needs an invitation record first?** | **No.** Works for any household, even one you haven't decided to invite to anything yet | **Yes.** You create the invitation and choose which events the household is invited to (`Invitations` → select households → pick events → create) |
| **Designed in** | `Guests → Save the date` (its own designer, with live phone/desktop preview) | `Site` (the block builder) |
| **Content you control** | Words, up to 6 photos, layout (Cover / Editorial / Postcard), palette, greeting, add-to-calendar button, countdown | Every block, theme, palette, fonts, motion, per-block text style |
| **Draft/publish?** | No — press **Save** and guests see it straight away | Draft → **Publish** (guests see only the last published version) |
| **Tracked as** | "Save the Date Sent" tick, and its own opens column | "Invite Sent" tick, opens, and RSVP progress (`3/4` answered) |

**Why not just send the invitation early?**

- **You may not know yet who's invited to what.** An invitation is per person per event. A save-the-date doesn't need that decided.
- **An invitation asks for answers; a save-the-date must not.** If early opens counted as "read the invitation, no reply", you'd chase people who've only seen the date. Save-the-date opens are logged separately and never counted as invitation opens.
- **Different design intent.** The save-the-date is a keepsake card; the invitation is a working page.
- **You can send it before cutting the list.** It doesn't need an invitation, so you can circulate it while the ranking is still settling.

### "I already know I can't come"

The save-the-date has a quiet button for guests who are certain they can't
make it. Pressing it **flags** that guest — it deliberately does *not* record
an RSVP. Flagged guests drop out of headcount, catering, and budget per-head
numbers, but stay on the list as invited (so you still know who you asked). If
the guest later answers Yes, the Yes wins. The button only acts on a press —
never on page load — so email link-scanners can't trigger it.

---

## 4. Sending links and keeping track

Everything here is on **Guests → Invitations** (`/invitations`). One row per household.

**Two tick boxes — tick them yourself as you send:**

- **Save the Date Sent** — works with no invitation.
- **Invite Sent** — disabled until the household has an invitation.

Copying a link or opening a preview **never** ticks anything.

**Per-household buttons, one set for each link:**

| Button | Does |
| --- | --- |
| Send / Resend | Emails it to guests who have an email address on file |
| Copy link | Copies the household's address |
| WhatsApp | Copies a ready-to-paste message with the link — for relatives who live in group chats, not email |
| QR | A QR image to put on printed stationery |
| View (save the date) | Opens it as the guest would, without counting as an open |
| Mute / Unmute | Stop automatic RSVP reminders to this household |
| Reissue | New link; the old one **stops working immediately** |

**Printing:** *Print invitations* builds themed stationery with each
household's QR code.

**Opens:** the table shows last-opened and a count, for the save-the-date and
the invitation separately.

**Reminders:** a weekly job reminds households that haven't finished
answering — never more than once every ten days, never to a muted household,
and skipping a household where everyone has declined.

> **Careful with Reissue.** It redraws the secret suffix, which is part of
> *both* the invitation and the save-the-date address. Both old links die.
> That's the point (a leaked link), so it doesn't leave a forwarding alias
> behind. Use it only if a link went astray.

---

## 5. Where everything lives

The top bar has eleven entries. A few of them hold several screens, shown as
tabs underneath.

### Overview — `/`
"Where things stand": tasks, budget, registry, responses, capacity, invitations. Numbers click through to the filtered list behind them.

### Guests — `/guests`
Tabs: **Guests · Ranking · Invitations · Save the date**

- **Guests** — a table of everyone, with filters (tag, status, missing data), CSV import/export, and **catering numbers**. Beside the table is a grid of **guest × event** cells: click a cell to invite or remove that person from that event, mark an invitation sent, or record an answer someone gave you by text.
- **Add household** (`/households/new`) and each household's page (`/households/[id]`): members, notes, the **site address** (copy, edit, preview *as that household*), and "can't come" flags.
- **Ranking** (`/guests/rank`) — drag households into priority order, with the capacity **cut line** drawn across it. Households above the line are invited; those below become the waitlist automatically. When a decline lands it suggests the next household that fits the freed seats. Tiers are derived from rank and cut lines, never typed in; move the line and the waitlist updates.
- **Invitations** — §4.
- **Save the date** (`/invitations/save-the-date`) — the designer from §3.

### Budget — `/budget`
Categories and line items; NZD only, GST per line. Costs can be flat, **per head**, or **consumption-based**, driven by the guest numbers (so cutting the list moves the totals). Set an overall budget and **percentages** per category and per line; a line's estimate falls back to its allocation unless you type one. Payment schedule per line. A line can link to a vendor and to a task.

### Vendors — `/vendors`
Who they are, contacts, notes, and which budget lines they cover. Money is read from the budget, never stored twice. `/vendors/contact-sheet` is a printable contact sheet. Deleting a vendor never deletes budget lines.

### Events — `/events`
Ceremony, dinner, brunch… each with a time (in the wedding's timezone) and an optional **guest note** that appears on the right households' pages. Who is invited to which event is set on Guests, not here. Each event has:

- **Run sheet** (`/events/[id]/run-sheet`, listed at `/run-sheet`) — the day-of schedule, one per event.
- **Seating** (`/events/[id]/seating`, listed at `/seating`) — tables and a to-scale room view; drag or tap to place guests; warnings never block; saved copies; a reveal date after which each household sees its table; and a print pack (by table, entrance board, escort and place cards, caterer numbers).

### Questions — `/questions`
Extra RSVP questions, on top of dietary and access needs (always asked). Ask **per guest** (e.g. meal choice) or **per household** (e.g. "need a lift?").

### Tasks — `/lists`
Tabs: **Tasks · Calendar · Board · Timeline**

Lists and items with due dates, assignees, sub-items and repeats. Views: **Today** (with an Overdue group), Scheduled, Flagged, All, and Assigned to me. The **Timeline**, **Calendar** and **Board** are other views of the same items — they stay in sync automatically. A weekly digest email covers what's due and overdue. Export to CSV.

### Moodboards — `/moodboards`
One board per audience (e.g. florist, dress code), each shareable by a link that needs no account. Images can be added by upload, paste, or the browser clipper (create a clipper token in Settings). Pinterest import is only partly available.

### Registry — `/gifts`
Your side of the gift registry. See §6. (The planner screens are at `/gifts`, not `/registry`, because `/registry/...` is the public page.)

### Site — `/site`
The block editor, with a live preview beside it. See §7. Related screens:

| Screen | What it holds |
| --- | --- |
| `/site/gifts` | "A gift" block: what you're saving for, and the bank details a guest sees after pressing Contribute |
| `/site/songs` | Song requests, ranked by votes, with the do-not-play list; a big-button mode for the night and a print view for the DJ |
| `/site/guestbook` | Notes guests left; hide any you don't want shown |
| `/site/attire` | Dress codes, tied to the events they cover |
| `/site/history` | Published versions, to look back or restore |
| `/travel` ("Getting there") | Coach, parking, where to stay; households reserve coach seats from their own page |
| `/gallery` ("Photos") | Photos guests upload from their link — review them before they appear, or approve automatically |

### Settings — `/settings`
Wedding basics (names, date, timezone), **cut lines and capacity**, collaborator names (shown on task assignment), list appearance, **Download everything (.zip)** (a readable copy of your guest data as spreadsheets — not a full backup), **Activity** (who changed what and when, including changes made via guests' own links), Pinterest connection, clipper tokens, and the privacy notice shown to guests.

---

## 6. The gift registry

- A **public page** at `/registry/<wedding slug>`: one address for anyone. It has its own palettes and fonts and is independent of invitations.
- You add items by pasting a shop link (it tries to autofill the title, picture and price, and is allowed to fail). **There are no payments** — it links out to the shop.
- A visitor presses **I'll buy this**, gives a name and optional message, and the item leaves the page. They see the delivery address and a private undo link.
- **A visitor never sees another visitor's name or message.** You see everything, and move each claim **Claimed → Bought → Arrived → Thanked** by hand.

---

## 7. Building the site (the invitation)

`/site` is a rail of controls on the left and a live preview on the right.

1. **Start from a template** if the page is empty (Classic, Photo-led, One-pager), or add blocks from the catalogue.
2. **Edit blocks** — reorder by drag, click the preview to select, and use "Use the site's text style" or override per block.
3. **Pick a look** — palette, type pairing, hero style, motion (Still / Gentle / Cinematic), and a Vibe for a quick overall change. Palettes are checked for readability; a colour that fails isn't applied.
4. **Preview as a household** — the preview is a real household's page with no credential, so everything looks right but nothing can be saved. Use it to check the ceremony-only household really sees only the ceremony.
5. **Publish.** Guests see only the **last published version**, never your draft. The bar at the top says how many changes are unpublished and when guests last got a new version. Older versions are in `/site/history`.

---

## 8. Suggested order for a new wedding

1. **Settings** — names, date, timezone, capacity.
2. **Events** — create each event with its time.
3. **Guests** — add or import households; set tags; then **Ranking** and the cut line.
4. **Save the date** — design it, check it with *View*, then send. Tick *Save the Date Sent* as each goes out.
5. **Site** — build and publish the invitation; use *Preview as* on a few households.
6. **Questions** — add any extra RSVP questions.
7. **Invitations** — create invitations (choose events per household), send, tick *Invite Sent*, then watch RSVP progress.
8. **Travel, Photos, Registry** — switch on what you need.
9. **Seating and Run sheet** — once answers are in.
10. In parallel, throughout: **Tasks**, **Budget**, **Vendors**, **Moodboards**.

---

## 9. Concepts glossary

- **Household** — the unit you invite. It has people, one address, and (once you create it) one invitation.
- **Guest** — a person in a household; the unit for headcount and catering.
- **Invited per person, per event** — the household is invited to a set of events; you can make exceptions for one guest (e.g. a child not at the evening do). The numbers everywhere follow this one rule.
- **Cut line / tier** — A is within capacity, B the waitlist band, C beyond. Derived from ranking order; never stored by hand.
- **Seats vs. people** — a household may read "4 people · 3 seats" when someone has said they can't come.
- **Draft vs. published** — applies to the invitation site only: guests see the last published version. The save-the-date takes effect when you press Save.
- **Mute** — pause automatic RSVP reminders to one household.
- **Reissue** — replace a household's links (both the invitation and the save-the-date).

---

## 10. Quick answers

**Why can't I open `/w/mia-and-jonah` myself?** There's no shared page. Use *Preview* in the Site editor, or a household's own address.

**A guest says their link doesn't work.** Likely it was reissued, or mistyped. Use *Copy link* on their row for the current one.

**I renamed a household. Did their link break?** No. The readable part can be edited and old links keep working. Only *Reissue* breaks links.

**Can a guest forward their link?** Yes, and whoever has it can answer for that household. That's why it's a private key. If it spreads, Reissue.

**Why did a household not get the email?** Send emails guests who have an address on file. For the rest, use Copy link / WhatsApp / QR.

**Why is the number of people different from seats?** Guests who flagged "I can't come" are left out of headcount but remain invited.

**Can I edit the site after publishing?** Yes. Edit the draft; guests see changes only when you press Publish again.

---

## 11. Known gaps (as of the last handoff)

- The app hasn't been verified end to end against a live database and a real phone for most recent features; read `docs/HANDOFF.md` for exactly what has and hasn't.
- Pinterest import is partial; the browser clipper is the dependable route.
- No payment processing anywhere — the gift page and the registry link out.
- The Activity log (Settings) records who changed what but cannot undo it. The site editor has its own undo for deleted blocks and Vibe changes.
- Backups run nightly via a GitHub workflow that has never been run; the restore runbook is `docs/RESTORE.md`.
