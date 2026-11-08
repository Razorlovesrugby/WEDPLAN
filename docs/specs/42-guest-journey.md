# Feature spec: Design and Invitations — making what guests see, and sending it

**Status: proposal, not built.** Written 2026-11-06. Revised 2026-11-08 twice with the planner's
answers (§11): first "the invite is the website", then "invite and invite design are different
concepts" and "add registry design in a similar location". **The planner said "update spec
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

Sam opens **For guests → Design** and switches between **Invitation · Save the date · Registry ·
RSVP questions** with the segmented control: changing a photo on the invitation page, the wording
on the save the date, the registry's colours. Every one has a live preview.

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
| `/gifts/design` (new, §5.4) | Design (longer than `/gifts`) |
| `/invitations` | Invitations |
| `/gifts`, `/gifts/claims`, `/gifts/settings` | Registry |

### 5.2 Design

One segmented control across every Design screen:

**Invitation · Save the date · Registry · RSVP questions · Theme · Travel · Photos · Extras**

| Tab | Route (unchanged unless noted) | What it is |
| --- | --- | --- |
| Invitation | `/site` | The page editor, previewed as a chosen household. Printed stationery's design lives here too. |
| Save the date | `/invitations/save-the-date` | Today's `SaveTheDateEditor`, minus the sending text. |
| Registry | `/gifts/design` **(new)** | The registry page's design half (§5.4), with spec 38's live preview. |
| RSVP questions | `/questions` | Today's editor. The questions are part of what guests see on the invitation. |
| Theme | `/site/theme` | Today's screen. |
| Travel, Photos, Extras | `/travel`, `/gallery`, `/site/extras` | As spec 41. Content shown on the invitation page. |

Eight tabs wrap onto two rows on a phone. That's acceptable for a section opened mostly on a
laptop (spec 41's decision). See Q7 for a shorter alternative.

### 5.3 Invitations: two stages, three steps

`/invitations` becomes the journey screen. The stage and step are in the URL, e.g.
`/invitations?stage=invitation&step=who`. With no parameters it opens on **the first stage with
work left**, falling back to Invitation.

| Stage | Who | Send | Track |
| --- | --- | --- | --- |
| **Save the date** | Every household (a filter for *sending*, e.g. "not sent yet"; nothing stored) | Copy link / email / mark sent / download links CSV | Sent, opened, not opened |
| **Invitation** | **Households × events grid** (§5.5) | Copy link / email / mark sent / print stationery; RSVP reminder settings | Sent, opened, silent, replied (attending / declined / maybe), can't come |

Each stage header has **Edit design →** linking to its Design tab. The stages are a segmented
control of links (spec 41 §4.3), each with a progress bar; the steps are a second, smaller one.

**One row per household.** Track shows one table for both stages. Each row has the household
name, then a **journey strip** with two cells: save the date (· not sent, ✓ sent, ◉ opened) and
invitation (· not sent, ✓ sent, ◉ opened, ✓✓ replied, ✕ can't come). The current stage's cell
is larger and carries its actions. Rows can be filtered by the existing `?status=` values.

**Send is one sheet.** It covers who it goes to (with a count), which link, and how (**Copy
links**, **Email**, **Download CSV**, **Mark as sent without sending**). It's the same sheet for
both stages.

### 5.4 Registry: the design half moves to Design

The Page & address form is split into two forms over the same `registry_settings` row:

- **`/gifts/design` (new, under Design → Registry):** title, intro, pictures, saying thank you,
  what visitors see, Contribute, the look, **with spec 38's live preview beside it**. It's rendered
  outside the Registry header and tabs: `/gifts/layout.tsx` gets a sibling route group, or the
  header moves into the three Registry pages. The build picks whichever keeps `requireCouple()` on
  both.
- **`/gifts/settings` (stays, renamed "Delivery & sharing"):** switched on, open to claims, the
  registry link bar and QR, and where gifts should go. It gets a "Design the registry page →" link.
- **Registry's tabs** become **Items · Claims · Delivery & sharing**.
- Each half saves only its own fields. Today's single `saveRegistrySettings` action either takes a
  `part` argument or becomes two actions. The fields, the table and the preview don't change.

### 5.5 Who's invited to what: a grid

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
  page reads the same `registry_settings` columns as today.
- `submitRsvp`, the reminder rules, open tracking, and everything guests see.
- `src/middleware.ts` and `src/lib/public-paths.ts` are untouched. `/gifts/design` is under
  `/gifts`, not `/registry`, so the public-prefix trap from spec 36 doesn't apply.
- `?status=` filters, so every dashboard number still clicks through.
- **Planner URLs keep working.** `/invitations/save-the-date` and `/questions` stay where they are,
  now lit as Design tabs, so no redirects are needed.

**Re-run the import-reach check** from 2026-11-08: trace every import from the public link pages
and confirm none reaches a file this build changes. The registry's public page is the one to
watch, because it shares `src/lib/registry/*` with the settings form. Keep the check as a unit test
(§9).

## 7. Data

**No migration.** The save the date goes to every household (§11 Q3); the registry split reuses
the existing columns.

## 8. Files (expected)

- `src/lib/nav-groups.ts`: "Website" → "Design" with the extra `matchPrefixes`; `nav-groups.test.ts`
  cases for each row of §5.1's table.
- `src/lib/nav-tabs.ts`: `DESIGN_TABS` replaces `WEBSITE_TABS`; `INVITATIONS_TABS` removed (the
  stages replace it); `REGISTRY_TABS` → Items · Claims · Delivery & sharing.
- `src/app/(planner)/invitations/page.tsx`: the stage/step router.
- `src/lib/invitations/journey.ts` (new, pure): stage progress, "first stage with work left", a
  household's strip state. Unit-tested.
- `src/components/invitations/journey-strip.tsx`, `send-sheet.tsx`, `stage-header.tsx`, `event-grid.tsx`.
- `src/app/(planner)/gifts/design/page.tsx` (new); `src/components/registry/settings-form.tsx`
  split into `design-form.tsx` and `delivery-form.tsx`; `src/server/actions/registry*` save by part.
- `src/app/(planner)/events/page.tsx`: invited counts and links.

## 9. Test plan

- Unit: `journey.ts`: progress counts match today's summary-line numbers for the same rows;
  "first stage with work left"; strip state for each combination of sent/opened/replied/unable.
- Unit: each `?status=` filter still returns the same households as today.
- Unit: `nav-groups.test.ts`: every path in §5.1's table lights the entry shown.
- Unit: each registry form saves **only** its own fields (a design save leaves the address alone,
  and the reverse).
- Unit (new, kept): **guest links are out of reach.** It walks the imports from every public entry
  point and fails if one reaches `src/app/(planner)/**`, `src/components/invitations/**`,
  `src/components/shell/**` or the registry's planner forms.
- Headless Chromium: every Design tab, both Invitations stages × three steps, and Registry's three
  tabs render at 1280 and 390; the registry preview still reloads after a design save.
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
| 5 | Households × events grid under Invitation → Who? | **Yes**, with Events linking to it (§5.5). |
| 6 | Merge spec 41's "Website" entry into Invitations? | **No: "invite and invite design are different concepts."** Two entries, **Design** and **Invitations** (§2, §5.1). |
| 6a | Where does the registry's design go? | **"Add registry design in a similar location"**: Design → Registry, split from delivery and sharing (§5.4). |

## 12. Still open

| Q | Question | Recommendation |
| --- | --- | --- |
| 7 | Design has eight tabs. Keep all eight, or show **Invitation · Save the date · Registry · RSVP questions · Theme** and put Travel, Photos and Extras behind a "More" tab? | **Keep all eight.** Every screen is one click away, and it's laptop-first. |
| 8 | Should the registry's "Page & address" become **Design → Registry** plus **Registry → Delivery & sharing**, as in §5.4? | **Yes.** |
