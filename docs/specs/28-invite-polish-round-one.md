# Feature spec: Invite polish, round one — the planner's first findings

**Status: proposed, not built (2026-10-05).** The planner went through the
invitation and the `/site` editor and came back with fifteen findings. This
spec groups them, says what is actually behind each one (read off the
source, not guessed), proposes how each should feel to use, and lists what
only the planner can decide. **Nothing here is authorized to build.** Per
`docs/specs/README.md` and `CLAUDE.md`, answering the §11 questions updates
this file; building waits for an explicit "build it".

**Depends on:** spec 14 (public site), 21 (household pages), 22 (per-event
invites), 23 (blocks), 24 (the rail), 25 (dress codes, coach-by-event, song
votes, gift funds), 27 (the invitation experience, the preview harness). All
built, none applied to the live project in full.

## 1. What was asked, verbatim and grouped

| # | Finding | Group |
| --- | --- | --- |
| 1 | Adding a coach run fails: *Could not find the 'event_id' column of 'coach_runs' in the schema cache* | A — live database |
| 2 | Can't add a dress code: *Could not find the table 'public.dress_codes' in the schema cache* | A — live database |
| 3 | "Add to calendar" gives a not-found error | B — bug |
| 4 | The preview gets smaller as I select a section further down the page | B — bug |
| 5 | I can't see what the RSVP section looks like in the preview | B — bug |
| 6 | Remove the letter monogram in the hero | C — layout |
| 7 | Toggle off the main top menu bar | C — layout |
| 8 | Event descriptions belong in the main "You're invited to" section, so I don't need "On the day" again at the bottom | C — layout |
| 9 | "On the day" needs to split into date sections | C — layout (solved by 8) |
| 10 | Gifts: no target / amount contributed; a **Contribute** button opening a popup with bank details that can be copied | D — rework |
| 11 | Song votes: a button to click and upvote other people's suggestions | D — rework |
| 12 | Replace the default song suggestion with something funny | D — rework |
| 13 | Re-order the questions in the Questions section | E — editor |
| 14 | Edit the title of any section; they're fixed today | E — editor |

Plus §9: eight things found while reading the code that the planner did
not list but will hit.

## 2. The caveat this spec is written under

Same as every spec since 12: **this app has never run against the live
Supabase project in full, and the invitation has never been opened by a
real guest on a real phone.** Findings 1–3 are almost certainly that gap
showing, not new bugs.

One more, specific to this session: the only Supabase project this session's
connector can see is `arm15lite_PROD`, whose migration history belongs to a
different app entirely (rugby club tables). **WEDPLAN's live migration state
could not be checked from here.** Everything in group A below is inferred
from `docs/HANDOFF.md`, which says `0026` onward have not been applied.

## 3. Group A — the live database is behind the code

**Findings 1 and 2 are the same cause.** Both the missing column and the
missing table are created by `supabase/migrations/0026_dress_codes_and_travel.sql`
(`dress_codes`, `dress_code_notes`, `events.dress_code_id`,
`coach_runs.event_id`, `v_coach_runs` recreated). The app code that writes
them (`src/server/actions/attire.ts`, `saveCoachRun` in
`src/server/actions/travel.ts`) is correct for a database that has `0026`.

**What to do:** apply every unapplied migration, in order, `0026` →
`0032`. Not just `0026` — `0027` (guest participation: song votes,
guestbook), `0030` (gift funds), `0031` (save-the-date views) and `0032`
(site asset images) are behind it, and each is the likely cause of the
next "could not find…" the planner would otherwise report one at a time.
`/api/health` already reports which migrations it can see (session 19), so
check it before and after.

This is not a code change and it is not in this spec's build. It is the
first thing to do, and every finding below should be re-checked after it,
because some of them (finding 3 especially) may disappear.

## 4. Group B — bugs

### 4.1 Add to calendar is not found (finding 3)

**What is there.** The "Add the weekend to your calendar" button
(`src/components/site/weekend-calendar.tsx`) links to
`/api/public/weekend/<slug>/<household address>`. That route
(`src/app/api/public/weekend/[slug]/[household]/route.ts`) returns a bare
404 in four cases: the wedding slug doesn't resolve; the household address
doesn't resolve; **the household has no invitation token** (has never been
issued an invitation); or the household is invited to no events.

**The likely cause.** The planner clicked it **in the preview**. The
preview (`/site/preview`) previews as the first household alphabetically
(`buildPreviewPersonal`, `src/server/queries/site-render.ts`), builds a
real address for that household, and the button links to the real public
route — which then 404s because that household has never been sent an
invitation. A guest on their own page always has a token, so the live page
is probably fine. Unverified: it could also be missing migrations.

**Proposed fix.** In the preview, the calendar button should still be
visible (it is part of what the planner is designing) but should not
pretend to be a working link to the live route. Two options; §11 Q3:

- (a) **Preview-only download** — the button in the preview hits a
  planner-authenticated `/site/preview/weekend.ics?as=<household>` that
  builds the same `.ics` from the previewed household's events. The planner
  can actually open it in their calendar and check it. *Recommended.*
- (b) The button shows a small toast — "In the preview, this downloads
  the weekend for the household you're previewing as. It works on their
  live page." — and does nothing else.

The public route itself keeps its bare 404 (no information leak about
which slugs exist), but should also be checked after group A.

### 4.2 The preview shrinks as you select blocks further down (finding 4)

**What is there.** The preview is an iframe laid out at the device width
(1280px desktop, 430px phone) and scaled with a CSS transform
(`PreviewFrame` in `src/components/site/editor/builder.tsx`). The scale is
`min(preferred, (available − 40) / width)`, where `available` is the
wrapper's width as measured by a `ResizeObserver`. The preview can only get
smaller if its column gets narrower.

**Cause: not yet known.** It needs reproducing before anybody guesses at a
fix. Candidates, to rule in or out in the Chromium harness spec 27 used:

1. Something in the selected block's inspector forces the grid's first
   track or the page wider than the viewport, squeezing the
   `minmax(0,1fr)` preview track.
2. The rail's scroll container stops containing its content
   (`lg:max-h-[calc(100vh-62px)] lg:overflow-y-auto`), so the whole page
   grows a scrollbar and loses ~15px — small, and repeated per selection
   only if the page also keeps growing.
3. The selection scrolls the outer page rather than the iframe, and what
   looks like shrinking is the preview's `78vh` box moving out of view.

**Proposed behaviour, whatever the cause:** the preview's size depends
only on the window and the Phone/Desktop toggle. Selecting, scrolling,
adding or removing a block never changes it. The preview column is
sticky, so it stays in view however long the rail gets. §11 Q4 asks for
what the planner saw.

### 4.3 The RSVP section can't be seen in the preview (finding 5)

**What is there.** The preview builds the household it previews as with
`token: null` and `rsvp: null` (`buildPreviewPersonal`). The RSVP block's
renderer only draws the form when both are present; otherwise it draws
*"We haven't sent your invitation yet — it's on its way, and this is where
you'll reply when it arrives."* So **in the preview the RSVP block always
says that**, whatever the planner does to it. The same `token: null`
hides the song-vote button (finding 11), the coach seat booking and the
guest photo uploader in the preview.

**Proposed fix: a preview household that behaves like a real one, but
can't write.** `buildPreviewPersonal` loads the household's actual
guests, events, questions and any existing answers — the same data
`resolveInvitation` assembles for a real guest — and passes a
**preview flag** instead of a token. Every interactive guest component
renders fully and fully clickable, but its submit is inert:

- The RSVP form can be filled in, toggled, scrolled — exactly what a guest
  sees, including the questions, the per-event Yes/No and the reply bar.
  Pressing **Send** shows "This is a preview — nothing was sent." in the
  same place the real confirmation appears, so the planner sees that too.
- The song-vote button, coach booking and photo uploader appear and
  respond locally, with the same "preview — nothing saved" note on
  submit.

No server action is reachable from the preview with a fake token, because
there is no token: the guard is the absence of credentials, not a check
somebody can forget. §11 Q5 asks whether the preview should show the
household's real answers or a blank form.

## 5. Group C — layout changes

### 5.1 The monogram in the hero (finding 6)

**What is there.** The two-initial monogram (`src/components/site/monogram.tsx`)
is drawn from the theme's `monogram` flag in **three** places: above the
names in the hero (Script-family heroes; the Editorial hero has none), at the
left of the top menu bar, and in the footer. The flag is real and
switchable — but **only on `/site/theme`, which `/site` stopped linking to
in session 30** (`docs/HANDOFF.md`: "the only place `heroStyle`, the
monogram and an existing custom palette can be edited"). So the planner
had no way to find it.

**Proposed fix.** A **"Show your initials"** switch in the rail's Page
group, beside the other layout switches, with a one-line note of where
they appear. §11 Q6: one switch for all three places, or the hero on its
own.

### 5.2 Turn off the top menu bar (finding 7)

**What is there.** The sticky menu bar (`src/components/site/site-nav.tsx`)
is drawn on the shared page whenever any block has a nav entry. There's
no switch. **It is also not drawn in the preview at all** — the preview
page renders `SiteBlocks` but not `SiteNav` — so the planner can't see
it while editing, only on the live page.

**Proposed fix.**

- A new layout switch, `layout.top_nav`, "Menu bar at the top", default
  on, in the same Page group as the chapter rail and reply bar
  (`src/lib/site/switches.ts`). Off means the bar is not drawn; nothing
  else on the page moves.
- **Render the menu bar in the preview**, so the switch visibly does
  something when flipped. Inside the iframe it is sticky to the iframe,
  which is what a guest gets.
- Check the household page too: if it draws its own bar, the switch
  covers both.

With the bar off, a guest on a phone still has the reply bar for RSVP
(spec 27). On desktop there's no shortcut to RSVP; §11 Q7.

### 5.3 Event notes in "You're invited to", not a second section (findings 8 and 9)

**What is there.** Each event has a `guest_note` (the "description" the
planner writes per event: parking, timings, what happens when). It is
rendered **only** by the separate `on_the_day` block, as a flat list
(`src/components/site/on-the-day.tsx`) — no date headings, so a
three-day weekend reads as one run-on list. Meanwhile the "You're invited
to" block (`schedule` → `InvitedEvents`) **already groups events by date**
and shows each event's time, venue, address, who it's for, the shuttle
and the dress code — everything except the note.

**Proposed fix: one change that answers both findings.**

- Draw each event's `guest_note` inside its row in "You're invited to",
  under the venue and above the shuttle line, in the same body type.
  Because that block is already grouped by date, the notes are grouped
  by date for free — finding 9 needs no separate work.
- Long notes: the first ~3 lines show, with **"More"** to expand in
  place. A guest scanning the weekend sees the shape; one who wants the
  parking details taps.
- The `on_the_day` block becomes **deprecated in the palette** (the same
  treatment `countdown` got in spec 25: still renders, can't be added).
  On a page that also has "You're invited to", it **renders nothing**, so
  nobody reads the same notes twice. The rail shows it greyed with
  "Now part of You're invited to — you can delete this", and a one-click
  delete.
- The **shared** page's schedule (no household) keeps showing no notes,
  as today: `on_the_day` was invited-only by default, and a note can carry
  a gate code. §11 Q8.

## 6. Group D — reworking three features

### 6.1 Gifts: a Contribute button and copyable bank details (finding 10)

**What is there.** `0030_gift_funds.sql` gives each fund a name, a blurb,
an optional target, an amount "raised so far" (the couple types it in),
and an optional `contribute_url` that the button links out to. The block
(`src/components/site/gift-funds.tsx`) draws a progress rule and
"$1,200 / $5,000". There is no field for bank details anywhere.

**Proposed experience.**

- **On the page:** each fund is its name and blurb, and nothing about
  money — no target, no total, no bar. Under them, one button:
  **Contribute**.
- **The popup** (a dialog on desktop, a bottom sheet on a phone):
  - A warm one-liner the couple writes — default *"Thank you — truly. If
    you'd like to, here's where to send it."*
  - **Account name**, **account number** (displayed in the NZ
    `12-3456-7890123-00` grouping, so it can be read aloud or typed into
    a banking app by sight) and a **reference**. Each value has its own
    **Copy** button; pressing it changes to **Copied ✓** for two seconds.
    One **Copy all** below copies the three as labelled lines for a
    guest pasting into a note.
  - The reference is pre-filled per household — their surname, e.g.
    *"Okonkwo gift"* — so the couple can tell who sent what. On the
    shared page it falls back to a line asking the guest to put their
    name in the reference.
  - If clipboard access is blocked (older iOS webviews, some in-app
    browsers), the values are selectable text and the button says
    "Select and copy" — the popup never depends on the Clipboard API to
    be useful.
  - Esc, the close button and tapping the backdrop all close it, and
    focus returns to the Contribute button.
- **In the editor** (`/site/gifts`): the target and raised fields
  disappear. Bank details are entered once (see §11 Q9 on whether
  that's per wedding or per fund), with live validation of the account
  number's shape.

**Schema.** New columns (or a small table) for the bank details — a new
numbered migration, never an edit to `0030`. `target_minor` and
`raised_minor` stay in the database (append-only; dropping a column the
couple typed into is a data loss) but are no longer read by the page.
`contribute_url` stays as an optional second button, "Or give online".

**Bank details are private information on a public page.** §11 Q10.

### 6.2 Song votes, made obvious (finding 11)

**What is there.** Voting is already built (spec 25, `0027`):
`song_votes`, `voteForSong`, one vote per household per song enforced by
the database, and a star button with a count in
`src/components/site/song-list.tsx`. Three things stop the planner (and
guests) seeing it:

1. **The button only appears with a token** — on a household's own page.
   On the shared page and **in the preview** there's a bare count and no
   button. That's why the planner didn't find it.
2. The button is a `☆ 14` star, which reads as a rating or a favourite,
   not as "vote this up".
3. A suggestion from the **shared** page waits for the couple's approval
   before it's listed, so a guest testing it sees their song vanish.

**Proposed experience.**

- The button becomes an explicit **▲ 14** upvote pill with the label
  "Vote" on wider screens; pressed, it fills and reads **▲ 15 Voted**.
  Pressing again takes the vote back. Optimistic, as now.
- The list is ordered by votes, ties by newest, as now — but a song
  the guest just voted for **doesn't jump** while they're looking at it;
  the list re-sorts next time the page loads. (A row moving out from
  under a thumb is how people vote for the wrong song.)
- A guest's own suggestion from their personal link appears at once with
  **"Your suggestion"** on it, and their vote already on it.
- On the shared page, the vote button shows but opens a one-line note:
  *"Voting is on your own invitation link."* — rather than not existing.
  §11 Q11.
- In the preview it's drawn and clickable, nothing saved (§4.3).

### 6.3 The default song suggestion (finding 12)

**What is there.** The "suggest a song" form's placeholder is *Dancing
Queen* / *ABBA* (`src/components/site/song-requests.tsx`). Placeholders
are greyed hints in empty fields, never submitted.

**Proposed.** A small set of joke placeholders, one picked at random
per page load, so it stays funny the second time somebody looks.
Candidates for the planner to choose from (§11 Q12):

- *Macarena* — Los del Río ("we will not be playing this")
- *Never Gonna Give You Up* — Rick Astley
- *Mr Brightside* — The Killers (the one everybody requests anyway)
- *Achy Breaky Heart* — Billy Ray Cyrus
- *The Chicken Dance* — the DJ's nemesis
- Or a line in the couple's own voice: *"Anything but Wonderwall"*

The form's intro line ("Tell us what will get you dancing.") is already
editable per block; this doesn't change that.

## 7. Group E — the editor

### 7.1 Re-order the questions (finding 13)

**Which questions?** Two things in the app are called questions:

- the **Questions block** on the invitation (the FAQ — "Can I bring a
  plus one?"), edited in the block inspector, and
- the **RSVP questions** on `/questions` (dietary, song request, etc.),
  which already have Move up / Move down.

This spec assumes the FAQ block, because that's the "Questions section"
on the invitation; §11 Q13 confirms.

**What is there.** The FAQ's questions are a repeating list in the block
inspector (`src/components/site/editor/block-inspector.tsx`). Rows can be
added and removed, **not moved**. The same is true of the other three
repeating blocks (Who's who, While you're here, Our story's moments).
The order matters: with no "Show open" ticked, the first six are the ones
guests see open.

**Proposed experience.**

- Each row gets a **drag handle** (⋮⋮) on its left and, for keyboard
  and touch, **↑ / ↓** buttons that appear on hover/focus. Same pattern as
  the block list in the rail, so it's already familiar.
- Rows **collapse to their first line** (the question) when not being
  edited, so twenty questions fit on screen and dragging is practical. Click
  to expand.
- A thin divider after the sixth row labelled **"Guests see these open ↑"**
  when nothing is ticked "Show open" — so reordering visibly changes what
  matters.
- Undo (spec 27) covers a reorder.
- One implementation, applied to all four repeating blocks.

**A bug this fixes along the way:** rows are keyed by their position
(`key={index}`), so removing row 2 of 5 can leave row 3's half-typed text
showing in row 2's inputs. Reordering would make that much worse; rows
need a stable id.

### 7.2 Edit any section's title (finding 14)

**What is there.** Most headings are fixed in code (`BLOCKS[type].heading`
in `src/lib/site/blocks.ts`): "Questions", "What to wear", "Getting there",
"Will you be there?" and so on. A few are hardcoded differently per
context — "The weekend" on the shared page vs **"You're invited to"** on a
household's page; "Will you be there?" vs **"RSVP"** on the shared page.
Only four block types (Words, Photo and words, Map, Playlist) take a
heading from their own content today. The menu bar's labels and the side
chapter list read the same fixed headings.

**Proposed experience.**

- Every block that draws a heading gets a **Title** field at the top of
  its inspector. The field shows the current default as its placeholder
  (*"Questions"*), so an untouched block is unchanged and the planner can
  see what they're replacing.
- **Clicking the heading in the preview** focuses that field (spec 27's
  click-to-edit already selects the block; this goes one step further). The
  preview updates as they type.
- Clearing the field goes back to the default. A separate **"No title"**
  switch hides it entirely, for a block that speaks for itself.
- The custom title flows everywhere the heading is used: the menu bar,
  the chapter list down the side, and the reply bar's label for the RSVP
  block.
- The small `04 · QUESTIONS` label above the heading: §11 Q14.

For "You're invited to" and "RSVP", where the default differs by page, the
custom title is used on both. Leaving it blank keeps both defaults.

Stored in the block's own `payload` (`heading`), which is how the four
blocks that already have it work — no migration.

## 8. What was considered and not recommended

- **Dropping the gift target/raised columns.** Append-only migrations,
  and the data is the couple's. Stop reading them instead.
- **Letting the shared page vote.** `song_votes.household_id` is NOT NULL
  by design (spec 25): a vote needs a household. Anonymous votes would be
  trivially stuffed.
- **A separate "preview renderer" for the RSVP.** Spec 23's rule — one
  renderer, never two — stands. §4.3 passes a flag into the same
  components instead.
- **Fixing the shrinking preview by pinning its width in pixels.** Masks
  the cause. Reproduce first.

## 9. Things the planner didn't list but will hit

1. **The live migration state can't be verified from this session**
   (§2). Whoever applies `0026`–`0032` should do it against the right
   project and check `/api/health` after.
2. **The preview has no menu bar** (§5.2) — so neither the menu bar
   nor its monogram has ever been seen while editing.
3. **Every guest-interactive block is dead in the preview** (§4.3): RSVP,
   votes, coach booking, photo upload. Fixing finding 5 fixes all of them.
4. **The preview's default household is whoever sorts first
   alphabetically.** If that's a household invited to only one event, the
   planner is designing against an unrepresentative page. Proposal: a
   visible "Previewing as: Okonkwo household ▾" picker above the preview
   (`?as=` already works), defaulting to the household invited to the most
   events.
5. **Repeating rows keyed by position** (§7.1) — a latent typing bug
   today, not just a reorder blocker.
6. **Two blocks of the same type share an HTML id.** Blocks render
   `id={block.type}`, and Our story, What to wear, Photo gallery and Map
   can appear more than once — so a second "What to wear" has the same
   anchor as the first and the menu bar skips it. Matters more once
   titles are custom (§7.2): two differently titled sections, one menu
   entry. Fix: anchor by block id.
7. **Once `0026` is applied**, the coach run editor's "which event"
   picker and the per-event dress code have never been exercised. Check
   edit and delete, not just add.
8. **Bank details and the reference on a phone**: test the popup in
   Safari on iOS and in the Instagram/Facebook in-app browsers, which is
   where a lot of invitation links get opened and where clipboard access
   is most often blocked.

## 10. Build order, if authorized

0. **Apply `0026`–`0032` to the live project** and re-test findings 1–3.
   Not code; the planner or whoever holds the project does this.
1. **Preview fidelity** — §4.3 (interactive-but-inert guest blocks),
   §5.2's menu bar in the preview, §9.4's household picker, §4.1's
   preview calendar. Everything after this is easier to judge.
2. **Reproduce and fix the shrinking preview** (§4.2).
3. **Layout switches** — monogram (§5.1), menu bar (§5.2).
4. **Event notes into "You're invited to"** and deprecate On the day (§5.3).
5. **Section titles** (§7.2) with the anchor fix (§9.6).
6. **Reorderable repeating rows** (§7.1) with stable keys.
7. **Songs** — upvote button, placeholder (§6.2, §6.3).
8. **Gifts** — migration, popup, editor (§6.1). Last because it's the only
   one with a schema change and the most open questions.

Each step is independently shippable.

## 11. Open questions for the planner

Each has a recommendation; "go with the recommendations" is a valid
answer.

1. **Migrations.** Will you apply `0026`–`0032` yourself (SQL editor /
   CLI), or do you want the WEDPLAN Supabase project connected to a
   session so it can be done and checked from there? *(The project this
   session can see is a different app.)*
2. **Where did finding 3 happen** — the preview, or a household's live
   link? *(Recommendation assumes the preview.)*
3. **Calendar in the preview:** a real preview `.ics` download (a), or a
   "works on their live page" note (b)? *Recommend (a).*
4. **The shrinking preview:** Phone or Desktop view? Roughly how wide is
   your window? Does it shrink a little with every selection, or jump
   once? A screenshot before/after would settle it.
5. **RSVP in the preview:** show the previewed household's real answers
   if they've replied, or always a blank form? *Recommend real answers —
   it's what they'd see coming back to change their reply — with a
   "Show blank" toggle.*
6. **Initials switch:** one switch that removes them from the hero, menu
   bar and footer, or the hero only? *Recommend one switch.*
7. **With the menu bar off, on desktop:** nothing (the page is a single
   scroll), or keep a small floating "RSVP" button? *Recommend nothing;
   the chapter list down the side already gets you around.*
8. **Event notes on the shared page** (no household link): show them, or
   household pages only as today? *Recommend household only — a note can
   hold a gate code.*
9. **Bank details: one set per wedding, or per fund?** One account is
   simpler and most couples have one; per-fund allows "honeymoon goes to
   this account". *Recommend one per wedding, with funds kept as named
   things to give towards.* Related: do you still want multiple funds at
   all, or just one Contribute button for the whole block?
10. **Who sees the bank details?** Anyone with the public page, or only
    on a household's own link? *Recommend household links only; the
    shared page's popup says "the details are on your invitation link".*
11. **Shared-page vote button:** shown with "voting is on your own link",
    or hidden as now? *Recommend shown.*
12. **The placeholder song:** pick from §6.3, write your own, or rotate
    through several? *Recommend rotating 4–5.*
13. **Which "questions"** — the Questions (FAQ) block on the invitation,
    the RSVP questions on `/questions`, or both? *Assumed the FAQ block;
    `/questions` already has Move up/down — say if that one needs drag too.*
14. **Custom titles and the small `04 · QUESTIONS` label above them:** should
    that label follow the custom title, stay as the fixed category, or
    also be editable? *Recommend: stays fixed (it names the job), and the
    existing "Numbers above headings" switch removes it.*
15. **Anything to add to this round** before it's built, or anything here
    to cut?

## 12. Done when

- Coach runs and dress codes can be added, edited and deleted on the live
  project.
- In the preview: the RSVP form, song votes, coach booking, calendar
  button and menu bar all appear and respond, and nothing they do is saved.
- The preview stays the same size whatever is selected.
- Initials and the menu bar can each be switched off from the rail.
- Event notes appear under their event, grouped by date, in "You're
  invited to", and On the day no longer repeats them.
- Gifts show no money figures; Contribute opens the bank details popup
  and each value copies on desktop Chrome, iOS Safari and one in-app
  browser.
- Songs can be upvoted from a household link, with an obvious button.
- FAQ (and the other repeating) rows can be dragged and moved by keyboard.
- Every titled section's title can be changed, and the menu bar follows.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build` pass — and, separately stated, whether it was opened in
  a real browser against the live project.
