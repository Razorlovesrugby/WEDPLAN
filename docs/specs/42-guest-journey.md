# Feature spec: The guest journey — the save the date and the invitation, on one screen

**Status: proposal, not built.** Written 2026-11-06; revised 2026-11-08 with the planner's answers
(§10). **The planner said "update spec only"**, so nothing here is authorised to build until they
say so in a later turn. Q6 is still open.

**Depends on:** spec 41 (the shell), specs 14, 21, 22, 27–30 (the household's page, addresses,
per-event status, the invitation experience, save-the-date tracking), spec 28 §7a.4 (**there is no
shared wedding page**), spec 35 (the RSVP form).

## 1. What was asked

The invites, save the date and guests "kind of live in weird places." Make what guests receive
easy to find and follow, without losing any control.

## 2. The model this has to match

**The invitation is the website.** There's no shared "wedding site": `/w/<slug>` is a deliberate
404 (spec 28 §7a.4). What a guest opens is **their household's own page**,
`/w/<slug>/<household>`, personalised to that household: their names, their events, their RSVP.
What the code calls "the site", and the builder at `/site`, is **where that invitation page is
designed**.

So each household is sent exactly **two things**:

1. **The save the date**: `/w/<slug>/<household>/save-the-date`. Names, date and photos, nothing
   to answer.
2. **The invitation**: `/w/<slug>/<household>`. The full page, including the RSVP.

The first draft of this spec had a separate "Website" stage. That was wrong and has been removed.

## 3. Story

Sam opens **For guests → Invitations**. At the top are two stages in order: **Save the date →
Invitation**. Each shows a progress bar ("82 of 94 sent"). Sam clicks Invitation. Under it are the
same four steps both stages have: **Design · Who · Send · Track**.

- **Design** opens the page editor, the same builder as today, previewed as a chosen household.
  The RSVP questions and printed stationery are here too.
- **Who** is the households × events grid: which household is invited to the ceremony, the
  reception, the brunch.
- **Send** copies or emails each household's link.
- **Track** shows one row per household: save the date sent, invitation opened, replied.

The "two links per household" explainer box is gone, because the screen shows the order.

## 4. What's there now

- **Save the date** is designed at `/invitations/save-the-date`. Its own page says: design it here,
  copy each household's link from Guests, and email it from Invitations. That's three screens for
  one job.
- **Invitations** (`/invitations`) has a summary line, a stationery panel, and an
  `InvitationsTable` with a save-the-date column and an invitation column per household. It needs
  a boxed paragraph explaining "two links per household".
- **The invitation page is designed at `/site`.** Since spec 41 it sits in the sidebar as
  "Website", separate from Invitations. See Q6.
- **Which households are invited to which event** is set on the invitations screen. The Events
  page tells you so in text instead of letting you do it there.
- **RSVP questions** are at `/questions`, a tab under Invitations since spec 41.
- **Status filters** already exist as `?status=sent|unsent|opened|silent|std_unsent|unable`, and
  the dashboard links to them. Keep them.
- **The data model already supports this.** `invitations`, `invitation_events`, the per-household
  `summary` (`sent_at`, `std_sent_at`, `opened_at`, `view_count`, `response_state`) and save-the-date
  opens all exist. This spec rearranges screens; **it doesn't change the model** (§10 Q3 removed the
  only reason it might have).

## 5. The proposal

### 5.1 Two stages, four steps

`/invitations` becomes the journey screen. The stage and step are in the URL, e.g.
`/invitations?stage=invitation&step=who`. With no parameters it opens on **the first stage with
work left**, falling back to Invitation.

| Stage | Design | Who | Send | Track |
| --- | --- | --- | --- | --- |
| **Save the date** | Today's `SaveTheDateEditor` | Every household (a filter for *sending*, e.g. "not sent yet"; nothing stored) | Copy link / email / mark sent / download links CSV | Sent, opened, not opened |
| **Invitation** | The page editor (today's `/site` builder, previewed as a household), RSVP questions, printed stationery | **Households × events grid** (§5.4) | Copy link / email / mark sent / print; RSVP reminder settings | Sent, opened, silent, replied (attending / declined / maybe), can't come |

The stages are a **segmented control of links** (spec 41 §4.3), each with a progress bar. The
steps are a second, smaller segmented control.

### 5.2 One row per household

Track shows one table for both stages. Each row has the household name, then a **journey strip**
with two cells: save the date (· not sent, ✓ sent, ◉ opened) and invitation (· not sent, ✓ sent,
◉ opened, ✓✓ replied, ✕ can't come). The current stage's cell is larger and carries its actions.
Rows can be filtered by the existing `?status=` values. The row opens the household as today.

### 5.3 Send is one sheet

"Send" opens a sheet over the screen. It covers who it goes to (with a count), which link, and how
(**Copy links**, **Email**, **Download CSV**, **Mark as sent without sending**). It's the same
sheet for both stages; the stage is a parameter, so there's no second copy of the logic.

### 5.4 Who's invited to what: a grid

Invitation → Who is a **grid**: households as rows, events as columns, a tick in each cell. It has
a header checkbox per event ("everyone above the cut"), and the same filters as the guest list.
It writes through the existing invitation-event actions. `/events` keeps editing the events
themselves. Each event gets an **"Invited: 64 households → Edit"** link to this grid instead of the
instruction text.

## 6. What doesn't change — the links guests already have

**No household link, token or public route changes.** This spec only touches couple-only planner
screens:

- `/w/<slug>/<household>`, `/w/<slug>/<household>/save-the-date`, `/rsvp/<token>`, `/i/<token>`,
  `/m/<token>` and `/registry/<slug>` keep their code, tokens and behaviour.
- `submitRsvp`, the reminder rules, open tracking, and everything guests see.
- `src/middleware.ts` and `src/lib/public-paths.ts` are untouched.
- `?status=` filters, so every dashboard number still clicks through.
- Old planner URLs: `/invitations/save-the-date` and `/questions` redirect to the matching stage
  and step.

**The build must re-run the import-reach check** from 2026-11-08. That check traced every import
from the public link pages (`src/app/w`, `rsvp`, `i`, `m`, `registry`, `privacy`, `api`, the root
layout and the middleware) and confirmed none reaches a file the build changed, apart from planner
API routes such as the Pinterest callback. It should be kept as a unit test (§9).

## 7. Data

**No migration.** The save the date goes to every household (§10 Q3).

## 8. Files (expected)

- `src/app/(planner)/invitations/page.tsx`: the stage/step router.
- `src/lib/invitations/journey.ts` (new, pure): stage progress, the "first stage with work left"
  rule, a household's strip state. Unit-tested.
- `src/components/invitations/journey-strip.tsx`, `send-sheet.tsx`, `stage-header.tsx`,
  `event-grid.tsx`.
- `src/app/(planner)/invitations/save-the-date/page.tsx`, `questions/page.tsx`: redirects.
- `src/app/(planner)/events/page.tsx`: invited counts and links.

## 9. Test plan

- Unit: `journey.ts`: progress counts match today's summary-line numbers for the same rows;
  "first stage with work left"; strip state for each combination of sent/opened/replied/unable.
- Unit: each `?status=` filter still returns the same households as today.
- Unit (new, kept): **guest links are out of reach.** It walks the imports from every public entry
  point and fails if one reaches `src/app/(planner)/**`, `src/components/invitations/**` or
  `src/components/shell/**`.
- Headless Chromium: both stages × four steps render at 1280 and 390; the redirects land correctly.
- typecheck, test, build.

## 10. Answered (2026-11-08)

| Q | Question | Answer |
| --- | --- | --- |
| 1 | Sidebar entry name? | **"Invitations"**, already the label since spec 41. |
| 2 | A "Website" stage? | **No such thing.** "The invite is the website… custom to each household." The Website stage is removed; the page editor is Invitation → Design (§2, §5.1). |
| 3 | Can a save the date go to only some households? | **Not needed** ("Who cares"). Every household gets one; no migration. |
| 4 | Printed stationery inside Invitation → Design? | **Yes**, it's already part of the invitation. |
| 5 | Households × events grid under Invitation → Who? | **Yes**, with Events linking to it (§5.4). |

## 11. Still open

| Q | Question | Recommendation |
| --- | --- | --- |
| 6 | Spec 41 put the page editor in the sidebar as **"Website"**, separate from Invitations. Since the invite *is* the website, should that entry go, with the editor reached as Invitations → Invitation → Design? `/site` URLs would stay the same. | **Yes, merge it.** Remove the "Website" sidebar entry; `/site` pages light "Invitations"; the Page/Theme/Travel/Photos/Extras tabs stay inside Design. This is a change to built spec 41 code, so it's done as part of this build. |
