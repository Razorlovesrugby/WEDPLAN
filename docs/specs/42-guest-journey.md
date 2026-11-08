# Feature spec: Design and Invitations — making what guests see, and sending it

**Status: proposal, not built.** Written 2026-11-06. Revised 2026-11-08 three times with the planner's
answers (§11): "the invite is the website"; "invite and invite design are different concepts";
then keep all eight Design tabs, make them work alike, and keep the registry's page settings in
one place, under Registry. **The planner said "update spec
only"**, so nothing here is authorised to build until they say so in a later turn.

**Depends on:** spec 41 (the shell, built; this changes its "Website" entry), specs 14, 21, 22,
27–30 (the household's page, addresses, per-event status, the invitation experience,
save-the-date tracking), spec 28 §7a.4 (**there is no shared wedding page**), spec 35 (the RSVP
form), specs 36/38 (registry page settings and preview).

## 1. What was asked

The invites, save the date and guests "kind of live in weird places." Make what guests receive
easy to find and follow, without losing any control.

## 2. The model this has to match

**The invitation is the website.** There's no shared "wedding site": `/w/<slug>` is a deliberate
404 (spec 28 §7a.4). What a guest opens is **their household's own page**,
`/w/<slug>/<household>`, personalised to that household: their names, their events, their RSVP.
The builder at `/site` is **where that page is designed**.

Each household is sent **two things**: the **save the date**
(`/w/<slug>/<household>/save-the-date`) and the **invitation** (`/w/<slug>/<household>`). Separately,
there's **one registry page** for anyone (`/registry/<slug>`).

**Designing these and sending them are different jobs** (§11 Q6), so they get two places:

| | **Design** | **Invitations** |
| --- | --- | --- |
| The job | Make what guests see | Decide who gets what, send it, follow replies |
| When | Mostly early, in long sittings | Over months, in short check-ins |
| Questions it answers | "Where do I change the photo?" | "Who hasn't replied?" |

## 3. Story

Sam opens **For guests → Design** and switches between **Invitation · Save the date · RSVP
questions · Theme** with the segmented control: changing a photo on the invitation page, the
wording on the save the date. Every tab looks and works the same way: controls on one side, a live
preview on the other, saved the same way. The **Registry** tab opens the registry's own **Page &
address** screen, which already works like that.

Later Sam opens **For guests → Invitations**. At the top are two stages in order: **Save the date →
Invitation**, each with a progress bar ("82 of 94 sent"). Under each are the same three steps:
**Who · Send · Track**.

- **Who** is the households × events grid.
- **Send** copies or emails each household's link.
- **Track** shows one row per household.

An **"Edit design →"** link jumps across to Design. The "two links per household" explainer box
is gone, because the screen shows the order.

## 4. What's there now

- **The invitation page** is designed at `/site` (with `/site/theme`, `/travel`, `/gallery`, the
  extras). Since spec 41 it's the sidebar's **"Website"** entry.
- **Save the date** is designed at `/invitations/save-the-date`. Its own page says: design it here,
  copy each household's link from Guests, and email it from Invitations. That's three screens for
  one job.
- **RSVP questions** are at `/questions`, a tab under Invitations since spec 41.
- **Invitations** (`/invitations`) has a summary line, a stationery panel, and an
  `InvitationsTable` with a save-the-date column and an invitation column per household. It needs
  a boxed paragraph explaining "two links per household".
- **Which households are invited to which event** is set on the invitations screen. The Events
  page tells you so in text instead of letting you do it there.
- **Registry** (`/gifts`, spec 36) has tabs Items · Claims · **Page & address**. Page & address is
  one form (`src/components/registry/settings-form.tsx`) with a live preview (spec 38) that mixes
  two kinds of setting:
  - **design:** title, intro, pictures (hero, thank-you image), "Saying thank you", "What visitors
    see" (show prices, show taken, the no-gifts line, the disclosure line), the Contribute block,
    and "The look" (colours, lettering);
  - **management:** switched on (`enabled`), open to claims (`open`), and "Where gifts should go"
    (recipient, address, courier note).
- **Status filters** already exist as `?status=sent|unsent|opened|silent|std_unsent|unable`, and
  the dashboard links to them. Keep them.
- **The data model already supports all of this.** This spec rearranges screens; **it doesn't
  change the model.**

## 5. The proposal

### 5.1 The sidebar

```
FOR GUESTS
  Design        ← everything guests will see
  Invitations   ← who gets it, sending, replies
  Registry      ← the gift list, claims, delivery
  Inbox
```

"Website" (spec 41) is renamed **Design**. Its href stays `/site`; its `matchPrefixes` gain the
design screens that live under other sections' URLs. Spec 41's longest-prefix rule makes this
work without moving a route:

| Path | Lights |
| --- | --- |
| `/site`, `/site/*` (but not `/site/questions`), `/travel`, `/gallery` | Design |
| `/invitations/save-the-date` | Design (longer than `/invitations`) |
| `/questions` | Design |
| `/invitations` | Invitations |
| `/gifts`, `/gifts/claims`, `/gifts/settings` | Registry |

### 5.2 Design

One segmented control across every Design screen:

**Invitation · Save the date · Registry · RSVP questions · Theme · Travel · Photos · Extras**

| Tab | Route (unchanged unless noted) | What it is |
| --- | --- | --- |
| Invitation | `/site` | The page editor, previewed as a chosen household. Printed stationery's design lives here too. |
| Save the date | `/invitations/save-the-date` | Today's `SaveTheDateEditor`, minus the sending text. |
| Registry | `/gifts/settings` (**a link out**, §5.5) | Opens Registry → Page & address, the registry's one settings screen. The sidebar then lights Registry. |
| RSVP questions | `/questions` | Today's editor. The questions are part of what guests see on the invitation. |
| Theme | `/site/theme` | Today's screen. |
| Travel, Photos, Extras | `/travel`, `/gallery`, `/site/extras` | As spec 41. Content shown on the invitation page. |

**All eight are kept** (§11 Q7). They wrap onto two rows on a phone, which is acceptable for a
section opened mostly on a laptop (spec 41's decision).

### 5.3 Every Design tab works the same way

"The design UI process should be similar" (§11 Q7). Every Design screen uses one frame,
`DesignFrame`:

- **The page title and the Design tabs at the top**, then **controls** on the left (or on top below
  `lg:`) and a **live preview** on the right in `PreviewFrame` (`src/components/preview-frame.tsx`,
  already shared by the site builder and the registry, spec 38). The preview has the same
  phone/laptop switch, and **"view as" a household** wherever the page is personal.
- **One save behaviour, the same everywhere.** Today the screens differ. The build audits each one
  and applies the rule from Q9 (recommended: **a Save button with an "unsaved changes" note**, as
  on the registry, spec 38). The preview reloads after a save.
- **What each tab previews:**

  | Tab | Preview |
  | --- | --- |
  | Invitation | The household's page (already) |
  | Save the date | The household's save the date (it has its own preview today, which moves into `PreviewFrame`) |
  | RSVP questions | The invitation page scrolled to its RSVP form |
  | Theme | The invitation page |
  | Travel, Photos, Extras | The invitation page scrolled to that block (or a note that the block isn't on the page yet, with "Add it") |
  | Registry | Its own screen, which already has a preview (spec 38) |

- Nothing guests see changes; this only changes the planner's editing screens.

### 5.4 Invitations: two stages, three steps

`/invitations` becomes the journey screen. The stage and step are in the URL, e.g.
`/invitations?stage=invitation&step=who`. With no parameters it opens on **the first stage with
work left**, falling back to Invitation.

| Stage | Who | Send | Track |
| --- | --- | --- | --- |
| **Save the date** | Every household (a filter for *sending*, e.g. "not sent yet"; nothing stored) | Copy link / email / mark sent / download links CSV | Sent, opened, not opened |
| **Invitation** | **Households × events grid** (§5.6) | Copy link / email / mark sent / print stationery; RSVP reminder settings | Sent, opened, silent, replied (attending / declined / maybe), can't come |

Each stage header has **Edit design →** linking to its Design tab. The stages are a segmented
control of links (spec 41 §4.3), each with a progress bar; the steps are a second, smaller one.

**One row per household.** Track shows one table for both stages. Each row has the household
name, then a **journey strip** with two cells: save the date (· not sent, ✓ sent, ◉ opened) and
invitation (· not sent, ✓ sent, ◉ opened, ✓✓ replied, ✕ can't come). The current stage's cell
is larger and carries its actions. Rows can be filtered by the existing `?status=` values.

**Send is one sheet.** It covers who it goes to (with a count), which link, and how (**Copy
links**, **Email**, **Download CSV**, **Mark as sent without sending**). It's the same sheet for
both stages.

### 5.5 Registry stays in one place

All of the registry stays under **Registry** (§11 Q8): **Items · Claims · Page & address**, as
today. The Page & address form isn't split. **Design → Registry** is a tab that links to
`/gifts/settings`, so it can be found from both places with one copy. Page & address already has the
controls-plus-preview layout (spec 38); it adopts `DesignFrame` (§5.3) only if that doesn't change
its form.

### 5.6 Who's invited to what: a grid

Invitation → Who is a **grid**: households as rows, events as columns, a tick in each cell. It has
a header checkbox per event ("everyone above the cut"), and the same filters as the guest list.
It writes through the existing invitation-event actions. `/events` keeps editing the events
themselves. Each event gets an **"Invited: 64 households → Edit"** link to this grid instead of the
instruction text.

## 6. What doesn't change — the links guests already have

**No household link, token or public route changes.** This spec only touches couple-only planner
screens and the sidebar data:

- `/w/<slug>/<household>`, `/w/<slug>/<household>/save-the-date`, `/rsvp/<token>`, `/i/<token>`,
  `/m/<token>` and `/registry/<slug>` keep their code, tokens and behaviour. The registry's public
  page is untouched.
- `submitRsvp`, the reminder rules, open tracking, and everything guests see.
- `src/middleware.ts` and `src/lib/public-paths.ts` are untouched. No new route under `/registry`.
- `?status=` filters, so every dashboard number still clicks through.
- **Planner URLs keep working.** `/invitations/save-the-date` and `/questions` stay where they are,
  now lit as Design tabs, so no redirects are needed.

**Re-run the import-reach check** from 2026-11-08: trace every import from the public link pages
and confirm none reaches a file this build changes. `PreviewFrame`, and anything the
save-the-date preview shares with the public save-the-date page, are the ones to watch. Keep the
check as a unit test (§9).

## 7. Data

**No migration.** The save the date goes to every household (§11 Q3); the registry isn't touched.

## 8. Files (expected)

- `src/lib/nav-groups.ts`: "Website" → "Design" with the extra `matchPrefixes`; `nav-groups.test.ts`
  cases for each row of §5.1's table.
- `src/lib/nav-tabs.ts`: `DESIGN_TABS` replaces `WEBSITE_TABS`; `INVITATIONS_TABS` removed (the
  stages replace it); `REGISTRY_TABS` unchanged.
- `src/app/(planner)/invitations/page.tsx`: the stage/step router.
- `src/lib/invitations/journey.ts` (new, pure): stage progress, "first stage with work left", a
  household's strip state. Unit-tested.
- `src/components/invitations/journey-strip.tsx`, `send-sheet.tsx`, `stage-header.tsx`, `event-grid.tsx`.
- `src/components/design/design-frame.tsx` (new): the shared Design layout (§5.3), used by `/site`,
  `/invitations/save-the-date`, `/questions`, `/site/theme`, `/travel`, `/gallery`, `/site/extras`.
- `src/app/(planner)/events/page.tsx`: invited counts and links.

## 9. Test plan

- Unit: `journey.ts`: progress counts match today's summary-line numbers for the same rows;
  "first stage with work left"; strip state for each combination of sent/opened/replied/unable.
- Unit: each `?status=` filter still returns the same households as today.
- Unit: `nav-groups.test.ts`: every path in §5.1's table lights the entry shown.
- Unit: every Design route renders inside `DesignFrame` (a source guard, like spec 36's), so a new
  Design tab can't drift from the shared layout.
- Unit (new, kept): **guest links are out of reach.** It walks the imports from every public entry
  point and fails if one reaches `src/app/(planner)/**`, `src/components/invitations/**`,
  `src/components/shell/**` or `src/components/design/**`.
- Headless Chromium: every Design tab, both Invitations stages × three steps, and Registry's three
  tabs render at 1280 and 390; each Design tab's preview reloads after a save.
- typecheck, test, build.

## 10. Not in scope

- One look shared by the invitation, save the date and registry: spec 44's "Use website theme".
  It would be renamed "Use invitation theme" to match §2.
- Any change to what guests see, or to the registry's public page.

## 11. Answered (2026-11-08)

| Q | Question | Answer |
| --- | --- | --- |
| 1 | Sidebar entry name? | **"Invitations"** for sending and tracking (§5.1). |
| 2 | A "Website" stage? | **No such thing.** "The invite is the website… custom to each household" (§2). |
| 3 | Can a save the date go to only some households? | **Not needed** ("Who cares"). Every household; no migration. |
| 4 | Printed stationery? | Its design is under Design → Invitation; printing is under Invitations → Send. |
| 5 | Households × events grid under Invitation → Who? | **Yes**, with Events linking to it (§5.6). |
| 6 | Merge spec 41's "Website" entry into Invitations? | **No: "invite and invite design are different concepts."** Two entries, **Design** and **Invitations** (§2, §5.1). |
| 6a | Where does the registry's design go? | First "add registry design in a similar location", then **not split: "all registry in the same place"**, under **Registry** (picked from two options). Design → Registry links to it (§5.5). |
| 7 | Keep all eight Design tabs? | **Keep all.** And **"the design UI process should be similar"**: one shared layout and save behaviour across every Design tab (§5.3). |
| 8 | Split the registry's Page & address? | **No** (see 6a). |

## 12. Still open

| Q | Question | Recommendation |
| --- | --- | --- |
| 9 | The one save behaviour for every Design tab: a **Save button with an "unsaved changes" note** (like the registry), or **autosave**? | **Save button.** It's what the registry already does, and a couple editing what guests will see should choose when it changes. |
