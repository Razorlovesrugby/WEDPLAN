# Feature spec: The guest journey — save the date, invitation, RSVP and website as one screen

**Status: proposal, not built.** Written 2026-11-06 from a discovery pass over the code.
Nothing here is authorised to build until §9's questions are answered and the planner says to
build it.

**Depends on:** spec 41 (the shell; Invitations under For guests), specs 14, 21, 22, 27–30
(invitations, per-household addresses, per-event status, the invitation and save-the-date
pages and their tracking), spec 35 (the RSVP form).

## 1. What was asked

The invites, save the date and guests "kind of live in weird places." Make the part guests see
easy to find and follow, without losing any control.

## 2. Story

Sam opens **For guests → Invitations**. Across the top are four stages in order: **Save the
date → Invitation → RSVP → Website**. Each shows a progress bar ("82 of 94 sent"). Sam clicks
Invitation. Under it are the same four steps every stage has: **Design · Who · Send · Track**.
Sam checks Design, picks the households in Who, presses Send, and watches Track fill in. Each
household is **one row** showing where it is: save the date sent, invitation opened, replied. The
"two links per household" explainer box is gone, because the screen shows the order.

## 3. What's there now

- **Save the date** is designed at `/invitations/save-the-date` (Guests → 4th tab). Its own page
  says: design it here, copy each household's link from Guests, and email it from Invitations.
  That's three screens for one job.
- **Invitations** (`/invitations`, Guests → 3rd tab) has a summary line, a stationery panel, and
  an `InvitationsTable` with a save-the-date column and an invitation column per household. It
  needs a boxed paragraph explaining "two links per household".
- **Which households are invited to which event** is set on the invitations screen. The Events
  page tells you so in its intro text instead of letting you do it there.
- **RSVP questions** is a top-level nav item, `/questions`.
- **Status filters** already exist as `?status=sent|unsent|opened|silent|std_unsent|unable`,
  and the dashboard links to them. Keep them.
- **The data model already supports this.** `invitations`, `invitation_events`, the per-household
  `summary` (`sent_at`, `std_sent_at`, `opened_at`, `view_count`, `response_state`) and save-the-date
  opens all exist. This spec rearranges screens; it doesn't change the model.

## 4. The proposal

### 4.1 Stages and steps

`/invitations` becomes the journey screen. The stage and step are in the URL:
`/invitations?stage=save-the-date&step=design`. With no parameters it opens on **the first stage
with work left**, falling back to Invitation.

| Stage | Design | Who | Send | Track |
| --- | --- | --- | --- | --- |
| **Save the date** | Today's `SaveTheDateEditor` | Which households get one (default: everyone above the cut) | Copy link / email / mark sent / download links CSV | Sent, opened, not opened |
| **Invitation** | Stationery panel, the invitation page's options, print | Households × events (moved here as a clear grid; Events links to it) | Copy link / email / mark sent / print | Sent, opened, silent, replied |
| **RSVP** | RSVP questions (today's `/questions` editor) | (follows Invitation) | Reminder settings (every 10 days, muted households) | Attending / declined / maybe / outstanding, can't come |
| **Website** | Link to the builder (`/site`) | Who can see it (public, households only) | Copy the site link, QR | Published state, last published |

The stage cards are a **segmented control of links** (spec 41 §4.3), each with a progress bar.
The steps are a second, smaller segmented control.

### 4.2 One row per household

Track shows one table for all stages. Each row has the household name, then a **journey
strip** with one compact cell per stage (· not sent, ✓ sent, ◉ opened, ✓✓ replied, ✕ can't come).
The cell for the current stage is larger and has its actions. Rows can be filtered by the
existing `?status=` values. The row opens the household as today.

### 4.3 Send is one sheet

"Send" opens a sheet over the screen: who it goes to (with count), which link, and how
(**Copy links**, **Email**, **Download CSV**, **Mark as sent without sending**). It's the same
sheet for both stages. The stage is a parameter, so there's no second copy of the logic.

### 4.4 Events

`/events` keeps editing events. The "invited households" part moves to Invitation → Who; the
Events page gets an "Invited: 64 households → Edit" link per event instead of the instruction
text.

## 5. What doesn't change

- Every household link, token and public URL (`/w/[slug]/[household]`,
  `/w/…/save-the-date`, `/rsvp/[token]`, `/i/[token]`).
- `submitRsvp`, the reminder rules, tracking, and what guests see.
- `?status=` filters, so every dashboard number still clicks through.
- Old URLs: `/invitations/save-the-date` and `/questions` redirect to the right stage and step.

## 6. Data

**No migration expected.** "Who gets a save the date" may need storing if it isn't simply "every
household". See Q3.

## 7. Files (expected)

- `src/app/(planner)/invitations/page.tsx`: the stage/step router.
- `src/lib/invitations/journey.ts` (new, pure): stage progress, the "first stage with work left"
  rule, a household's strip state. Unit-tested.
- `src/components/invitations/journey-strip.tsx`, `send-sheet.tsx`, `stage-header.tsx`.
- `src/app/(planner)/invitations/save-the-date/page.tsx`, `questions/page.tsx` → redirects.
- `src/app/(planner)/events/page.tsx`: invited counts and links.

## 8. Test plan

- Unit: `journey.ts`: progress counts match today's summary-line numbers for the same rows;
  "first stage with work left"; strip state for each combination of sent/opened/replied/unable.
- Unit: each `?status=` filter still returns the same households as today.
- Headless Chromium: every stage × step renders at 1280 and 390; the redirects land correctly.
- typecheck, test, build.

## 9. Open questions

| Q | Question | Recommendation |
| --- | --- | --- |
| 1 | Name of the sidebar entry: "Invitations" or "Guest journey"? | **Invitations.** It's the word people use. |
| 2 | Should Website be a stage here, or only its own sidebar entry? | **Both.** The stage is a summary card that links to the builder. |
| 3 | Can a save the date go to only some households? | **Yes, default everyone above the cut.** If yes, it needs one column (a migration). If no, there's no data change. |
| 4 | Keep the printed-stationery flow inside Invitation → Design? | **Yes.** |
| 5 | Should the household × event grid move here from wherever it sits now? | **Yes.** Events links to it. |
