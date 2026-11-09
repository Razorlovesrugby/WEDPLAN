# Feature spec: The guest table — less sideways scrolling, status at a glance, links on the row

**Status: questions answered (2026-11-09), branch `claude/pensive-euler-natrmu`. Nothing built.**
No migration expected. All six questions in §8 are answered (§10, every recommendation taken, plus
a Planning view). Not yet authorised to build.

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
