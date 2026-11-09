# Feature spec: The guest table — less sideways scrolling, status at a glance, links on the row

**Status: built (2026-11-09), branch `claude/pensive-euler-natrmu`, no PR.** No migration. All six
questions in §8 were answered (§10: every recommendation, plus a Planning view), then "Build it
all". **§11 says what was built and where it departs from §4.**

**Depends on:** spec 4 (households), spec 5 (tiers), spec 20 (last name column, named sides),
spec 21 (household addresses), spec 22 (per-event invite cells), spec 29/30 (save the date,
can't attend), spec 42 (Invitations' Send step, where copy links live today), spec 45 (touch
sizes, `RowMenu`).

Mockups: the brainstorm page shared in the session ("Guest List Table Ideas"), ideas A, B, C and
the "Chosen direction" section.

## 1. What was asked

"Whatever will help minimise the horizontal scroll, and give an easy view of what they RSVP or
their status, and maybe find somewhere to put the copy links." This came after a brainstorm of
four ideas (group by household, column views, summary strip with filter chips, phone cards).

## 2. Story

Sam opens **Guest list → Households**. Above the table, three event bars show the replies so far:
Reception has 7 yes, 2 maybe, 1 no and 3 with no reply yet. Sam clicks the "no reply" part and the
table narrows to those households.

Each household is one row: name, tier, side, then a symbol for each event (✓ all coming, ✕
declined, ? maybe, ● sent with no reply, ○ invited but not sent, "2/3" when the household is
split). The people fold out underneath, each with their own symbols. On a laptop the whole thing
fits without scrolling sideways.

At the end of the household row is **Links ▾**: Copy save-the-date link, Copy invitation link,
Copy WhatsApp message, QR code. Sam copies one and pastes it into the family group chat.

When Sam needs emails or dietary needs, the **View** control above the table switches to
**Contact** or **Catering**, and those columns replace the event columns.

## 3. What's there now

`src/components/guests/guests-table.tsx` shows one row per guest with 10 fixed columns (tick,
first, last, household, tier, side, email, dietary, tags, save the date) plus one per event,
inside `min-w-[60rem]`. With 3 events that is 13 columns, so it scrolls sideways on most laptops.
Household, tier and side repeat on every person's row. Event cells (`invite-cell.tsx`) show words
("Invited", "Sent", "Yes"). The save-the-date cell has a small "Copy link". The invitation link,
WhatsApp message and QR code exist only on **Invitations → Send**
(`src/components/invitations/invitations-table.tsx`, via `revealInvitationLink`).

## 4. The proposal

### 4.1 Rows grouped by household (default)

- A **household row** shows: tick box, a ▾ to fold, household name with a people count, tier
  chip, side chip, contact icons (address, and email for every adult; a dashed red icon when
  missing), save-the-date "Opened 3× · 2 Nov" / "Not opened", one summary symbol per event, and
  **Links ▾**.
- **Event summary on the household row:** if every invited member has the same state, show that
  state's symbol. Otherwise show `yes/invited` (e.g. "2/3"), with a tooltip that spells it out.
  The rule is a pure function in `src/lib/` (`householdEventSummary`) with tests.
- **Person rows** sit under the household, indented: name (preferred name, age band, "Can't
  attend"), last name (still inline-editable), email and dietary icons, and their own event cells
  (the existing `InviteCell` menu, unchanged in behaviour). Tier, side and household cells are left
  blank because they belong to the household row.
- People who can't attend are faded to about 55%. A household where nobody can attend sinks to
  the bottom.
- Folding is per household, plus **Expand all / Collapse all**. Expanded is the default (see Q2).
- The household row's tick box selects every person in it, so the bulk bar keeps working on guest
  ids.
- The header's "invite all · none" per event stays as it is.

### 4.2 Event cells as symbols

`InviteCell` renders a symbol instead of a word, each with its own shape so it reads without
colour: ✓ yes (green), ? maybe (amber), ✕ no (red), ● sent, ○ invited not sent, – not invited.
The override dot stays. The cell's `aria-label`/`title` keeps the full words ("Helen — Reception:
Sent, no answer"). A legend line sits under the table. Event columns shrink from about 140px to
about 80px.

### 4.3 Column views

A segmented control above the table, kept in the URL as `?view=`, the way filters are:

| View | Columns after the name |
| --- | --- |
| **RSVP** (default) | tier, side, save the date, one per event, Links |
| **Contact** | email (editable), address status, save the date, Links |
| **Catering** | age band, dietary (editable), "coming to n of m" |
| **Planning** | tier, side, tags |
| **Everything** | today's full set, with the name column pinned while you scroll sideways |

The view list and its columns are a plain map in `src/lib/guest-views.ts`, not configurable.

### 4.4 Event summary bars

Above the table, one compact card per event: "7 of 13 coming" and a stacked bar of yes / maybe /
no / no reply. Each part of the bar is a link that sets the existing `rsvp` and `event` filters
(`yes`, `maybe`, `no`, `pending`), so it works like the dashboard's stat tiles. The counts follow
the headcount rule (spec 29: `excluded_from_counts` people aren't counted as coming). Counting
logic is pure, in `src/lib/`, and is computed from the `invites` and guests the page already
loads. No new query.

### 4.5 Links on the household row

**Links ▾** opens a small menu (the spec 45 `RowMenu` pattern, 44pt on touch):

- **Copy save-the-date link**: moved from the save-the-date cell; same URL code
  (`absoluteUrl(saveTheDatePath(...))`).
- **Copy invitation link**: `revealInvitationLink(invitationId)`, as on Invitations → Send.
- **Copy WhatsApp message**: `whatsappMessage(...)`, as on Invitations → Send.
- **QR code**: opens `/api/qr/<invitationId>` in a new tab.
- Items that need an invitation are disabled with "No invitation yet" when the household has none
  (`invitation_id` is null in `v_guest_event_invites`).

The Invitations page keeps its own buttons. This is a second entry point that calls the same
actions, not a move.

## 5. Not in scope

- Replacing the filter dropdowns with chips (idea C's chips). The summary bars cover the most
  common filter; chips can be a later spec.
- Phone card layout (idea D). Below `md` the grouped table still scrolls sideways (see Q4).
- Saved named views, keyboard grid shortcuts, sorting by column.
- Any change to what guests see, or to `/guests/[id]`, households, Invitations or Ranking.

## 6. Data

No migration. Everything comes from what `src/app/(planner)/guests/page.tsx` already loads:
`listGuests`, `listHouseholds`, `listInvites` (which carries `invitation_id`, `sent_at`,
`excluded_from_counts`), `listSaveTheDateOpens`. The WhatsApp message also needs the wedding name
and date label, which `requireWedding()` already returns.

## 7. Files (expected)

- `src/lib/guest-views.ts`: view → columns map, `parseView`.
- `src/lib/guest-table.ts`: `groupByHousehold`, `householdEventSummary`, `eventReplyCounts`.
- `src/components/guests/guests-table.tsx`: grouped rows, views, pinned name column.
- `src/components/guests/invite-cell.tsx`: symbols instead of words.
- `src/components/guests/event-summary.tsx` (new): the bars.
- `src/components/guests/household-links.tsx` (new): Links ▾ menu.
- `src/components/guests/save-the-date-cell.tsx`: drop its Copy link (moved to the menu).
- `src/app/(planner)/guests/page.tsx`: read `view`, render the summary.
- Tests for the three pure functions and the view parser.

## 8. Open questions

1. **Group by household as the default?** Recommended: yes, with a "One row per person" switch for
   anyone who wants the flat list (e.g. to sort by last name later).
2. **Fold households by default?** Recommended: expanded, so nothing is hidden on first look, with
   Collapse all one click away. The alternative is collapsed, which is the shortest list.
3. **Which views?** Recommended: RSVP, Contact, Catering, Everything. Tags would only appear in
   Everything; say if you'd rather have a fifth "Planning" view (tier, side, tags).
4. **Phone:** leave the table scrolling sideways on phones for now (recommended, keeps this
   small), or include household cards in this spec?
5. **Links menu contents:** all four (save the date, invitation, WhatsApp, QR) as recommended, or
   just the two copy links?
6. **Event summary bars:** include them (recommended), or leave just the symbols for now?

## 9. Test plan

- Unit: `householdEventSummary` (all same, split, all not invited, can't-attend members, override
  members), `eventReplyCounts` (headcount rule), `groupByHousehold` order (can't-attend
  households last), `parseView` (unknown → RSVP).
- Existing guests-table/invite-cell behaviour unchanged: bulk tag, move, inline edits, cell menu.
- Render the page with sample data in headless Chromium at 1280px and confirm no horizontal
  scroll in the RSVP view with 3 events; check an emulated iPad.
- `npm run typecheck && npm test && npm run build`; `npm run a11y` on the page if it can be reached
  with sample data.

## 10. Answered (2026-11-09)

1. **Group by household by default:** yes, with a "One row per person" switch.
2. **Fold by default:** no. Households start unfolded, with Collapse all.
3. **Views:** RSVP (default), Contact, Catering, **Planning** (tier, side, tags), and Everything.
   §4.3's table now includes Planning.
4. **Phone:** the table keeps scrolling sideways on phones for now; household cards are a later
   spec.
5. **Links menu:** all four (save-the-date link, invitation link, WhatsApp message, QR code).
6. **Event summary bars:** included, as in §4.4.

## 11. Build status (2026-11-09)

Built as §4 describes, with these departures and details:

- **Views (`src/lib/guest-table.ts`).** RSVP, Contact, Catering, Planning, Everything. Everything
  also shows Address. **Links is the last column in every view**, Catering included, so it is
  always in the same place. Grouping is `?rows=people`. Both are switched with
  `history.replaceState`, so no reload; Clear filters keeps them.
- **A household of one is a single row**, not a household row plus a person row. It shows the
  household's own cells, and the household name under the person's when the two differ.
- **Side** is per guest in the data. The household row shows it when everyone shares it, otherwise
  "Mixed" and each person row shows their own.
- **Last name** moved into the name cell (still editable), so it no longer needs a column. Flat
  mode adds a Household column after the name.
- **Faded rows** for people who can't attend are grey text and grey colours, not transparency, so
  they pass WCAG contrast (axe flagged the transparent version). Only the event symbols are faded.
- **Menus** (the event cell's and Links) are fixed-position (`use-fixed-menu.ts`) so the table's
  scroll box no longer clips them on the last rows. They open upward near the bottom of the
  window and close if the page scrolls. If the clipboard refuses, the Links menu shows the text
  selected in a box to copy by hand.
- **Reply bars** count the whole wedding, not the filtered list, so they hold still while the
  table narrows. With filters on, the page loads the guest list a second time, unfiltered. A
  fifth, grey "Can't come" part (not a link: there is no filter for it) holds people flagged
  unable who haven't answered that event.
- **Filter fix in `listGuests`.** With both `rsvp` and `event` set, it now keeps only guests
  invited to that event (one extra read of `v_guest_event_invites`, only then). Before,
  "no answer for the brunch" also listed everyone never invited to the brunch, so a bar's number
  and the list behind it disagreed. The CSV exports use `listGuests`, so they follow.
- **Save the date** shows on the household row only; its Copy link moved to the Links menu.

**Files:** `src/lib/guest-table.ts` (+ test), `src/components/guests/{guests-table, invite-cell,
save-the-date-cell, filter-bar}.tsx`, new `status-mark.tsx`, `household-links.tsx`,
`event-summary.tsx`, `use-fixed-menu.ts`, `src/app/(planner)/guests/page.tsx`,
`src/server/queries/guests.ts`.

**Verified:** typecheck, 1410 unit tests (15 new), `next build` (placeholder env). A temporary
sample page (deleted) rendered the table with 7 households in headless Chromium: at 1280px the
RSVP, Contact, Catering and Planning views and the flat list fit without sideways scrolling,
Everything scrolls with the name pinned; Links and event-cell menus open, take focus, close on
Esc, and aren't clipped on the last row; axe-core reports no violations on the page or with the
Links menu open. **Not verified:** Supabase or real data (no copy, invite or RSVP action has run
from here), a real iPad or phone. On an emulated iPad in portrait (768px) the RSVP view still
scrolls sideways a little (about 150px), as Q4 accepted for small screens.

### Review fixes (2026-11-09)

A code review of the build found ten problems; all fixed, no migration:

- **One guest read.** `listAllGuests` (cached by wedding id) fetches every guest once;
  `listGuests` filters it in memory. The page's bars and household rows no longer cost a second
  read when a filter is on. The per-event "invited" narrowing now uses the cached `listInvites`.
- **`listInvites` reads in pages of 1000**, the API's row cap, so a big wedding isn't cut short.
- **Household rows describe the whole household** (`summariseHouseholds`, computed on the page):
  "1/2" stays "1/2" when a filter shows one of them, the name reads "1 of 2 shown", and a household
  narrowed to one person keeps its household row.
- **Links menu:** the invitation link is built in the browser (Safari refuses a clipboard write
  that waits on the network); invitation ids come from `listInvitationIds`, so they're there before
  any event exists; Tab out closes it.
- **Reply bar links keep only the view and grouping**, so the list holds exactly the number on the
  bar. The "For event" filter shows on a one-event wedding when a bar has set it.
- `eventReplyCounts` uses `isExcludedFromCounts` instead of a copy of the rule; the household
  tooltip no longer claims "(everyone invited)".

Verified again: typecheck, 1411 unit tests, build, and a temporary sample page in headless
Chromium (filtered household row, bar links, invitation link on the clipboard, disabled items with
no invitation, Tab closing the menu). Still never run against Supabase.
