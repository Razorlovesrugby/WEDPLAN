# Feature spec: The RSVP form, in the site's own theme

**Status: round one built (2026-10-15, merged as PR #73). Round two (§6 items 1–8)
built (2026-10-23) on branch `claude/rsvp-form-restyle`, no PR opened.** "Can u
build it" came with none of §7 answered, so **each question took its
recommendation** (see **Answered**). See **Build status — round two** at the end.
**Seen only in headless Chromium with sample data. Never run against Supabase,
never on a real phone, and never with a screen reader.**

## Answered — 2026-10-23 (recommendations taken, not chosen)

| Q | Answer | What it changed |
| --- | --- | --- |
| 1 | **Keep the new copy.** | §3.2 stands. |
| 2 | **Don't ask somebody who isn't coming.** | §6 item 5 built. |
| 3 | **Keep the petals.** | No change. |
| 4 | **Items 1–8.** | Song requests and guestbook (item 9) not touched. |
| 5 | No recommendation was given; **left as "15:00"**, the smallest change. | No change. |

Any of these can still be reversed.

## 1. What was asked

> *"Regarding invited, where people rsvp and answer questions, can we make that more
> visually aligned with the rest of site / make it prettier / I want the UI be cool as"*

Then, after the build:

> *"Can u write a spec for what you did, and can u check if the best you can do"*

## 2. What was wrong (read off the source)

The reply form on a household's page (`/w/<wedding>/<household>`, the `rsvp` block)
was the only part of the guest site still built from the **planner app's admin
classes**: `.card` and `.field` (white boxes), `.btn-primary`, square Yes/No buttons,
native radio buttons, checkboxes and a `<select>` for questions, and `font-serif`
legends. Every other section is set in the couple's own display/label faces and
palette (spec 14 §5, spec 25, spec 27).

It "worked" in dark palettes only because of a patch in `globals.css`
(`[data-site-tone="dark"] .card / .field / .bg-white / .text-white`) that repaints
those admin classes.

## 3. What round one built

No migration, no server change, and **nothing different about what the form submits**:
`submitRsvp` gets the same payload as before. Four files:

| File | Change |
| --- | --- |
| `src/components/rsvp/rsvp-form.tsx` | New markup and classes throughout. New optional prop `eventWhen`. |
| `src/components/rsvp/question-field.tsx` | Choice questions shown as chips; text fields as ruled lines. |
| `src/components/site/blocks/render.tsx` | Passes `eventWhen` (event times formatted on the server). |
| `src/app/globals.css` | New `site-rsvp-*` section, written only against the five theme tokens. |

### 3.1 The pieces

- **"For all of us" answers**: two large rounded cards, each with an icon (a heart
  for yes, a wave for no). They lift on hover, and the selected one fills with
  `ink`. The yes card reads "Yes, I'll be there" when only one person is answering.
- **"— or answer one by one —"**: a divider between the all-of-us cards and the
  per-person cards.
- **One card per person** (`site-rsvp-sheet`): the first letter of their name in a
  ring in the accent colour, and their name in the display face. A plus-one's typed
  name replaces "Your guest" in the heading as they type. The `<legend>` is kept,
  visually hidden, for screen readers.
- **Each event** shows its name and its time, as a label: "Sat 13 Mar, 15:00". The
  time comes from `formatDateTime` in the wedding's timezone. Each event has a
  rounded Yes/No toggle. A selected No is filled with `muted`, not `ink`: a no is
  not a failure.
- **Text fields** (`site-rsvp-input`) are a ruled line to write on, like a paper
  reply card. The label is set in the site's letterspaced label style. A long-text
  answer gets a rounded box.
- **Choose-one, choose-several and yes/no questions** are pill chips, with a ✓ when
  picked. Each chip is a real `<input>` hidden visually, so the keyboard, screen
  readers and `required` all still work. Yes/no questions were a `<select>`; they now
  store the same three values (`"yes"`, `"no"`, `""`). A required yes/no question
  offers no "Not sure yet" chip, just as the select's empty option could never
  satisfy `required`.
- **The send button** is a solid pill with an arrow.
- **The closed and confirmation states** use the same sheet. After a yes, twelve
  petals in the accent colour drift down once behind the tick (CSS only, decorative).
- **Motion:** the per-person cards fade in one after another (70 ms apart). The
  hover lift and the petals are switched off under `prefers-reduced-motion`.

### 3.2 Decisions made without asking — please confirm or reverse

These are copy changes. Nobody asked for them; they went in with the restyle:

| Was | Now |
| --- | --- |
| "Not able to" | "Sadly, can't make it" |
| "Confirm our RSVP" / "Saving…" | "Send our reply" (or "Send my reply" for one person) / "Sending…" |
| — | "Yes, I'll be there" when one person is answering |
| — | Divider text "or answer one by one" |
| — | Event times under each event name |

A comment in `rsvp-form.tsx` (the `token` doc) still says *"Confirm" says nothing was
sent*. It is stale now and should say "Send".

### 3.3 A bug the browser check caught (fixed in round one)

The first version formatted event times **inside the client component**. Node's
`Intl` and Chromium's `Intl` punctuate differently ("Sat, 13 Mar" against
"Sat 13 Mar"), so the page hydrated with a mismatch. The fix: times are formatted
once on the server, in `render.tsx`, and passed in as
`eventWhen: Record<eventId, label>`. **Rule for this form from now on: never format
a date in it.**

### 3.4 Verified

- `npm run typecheck`: clean.
- `npm test`: 1085 passed.
- `next build`: compiled, using placeholder environment variables.
- Headless Chromium, using a temporary page with sample data (three guests, two
  events, five questions of every type):
  - Editorial + Ivory on desktop
  - Card look on a phone
  - Evening + Midnight (dark) on a phone
  - the confirmation in Script + Sage
  - no console errors once §3.3 was fixed

**Not verified:**

- Supabase, so `submitRsvp` never ran.
- A real household page.
- Safari or iOS.
- A real touch screen.
- A screen reader.
- `verify-migrations.sh` was not run; nothing in this change touches SQL.

## 4. Self-review: is this the best it can be?

**No.** It is a clear step up and it is coherent with the site, but reviewing my own
work against the screenshots, the contrast maths and the code turned up the issues
below, most serious first. **None of them are fixed. Each one is listed in §6 as a
proposal.**

### 4.1 Accessibility: placeholder text fails contrast on every light palette

The placeholder is `muted` at 80% opacity on the card. Measured against each palette:

| Palette | Placeholder | `muted` on card | No-toggle text | Accent initial |
| --- | --- | --- | --- | --- |
| Ivory | **3.55** | 5.38 | 5.63 | 5.53 |
| Sage | **3.54** | 5.34 | 5.59 | 5.34 |
| Dusk | **3.53** | 5.33 | 5.58 | 6.32 |
| Claret | **3.67** | 5.61 | 5.88 | 7.25 |
| Slate | **3.65** | 5.57 | 5.84 | 6.60 |
| Ink | **3.95** | 6.22 | 6.54 | 6.54 |
| Midnight | 4.93 | 6.98 | 7.33 | 8.28 |
| Ember | 4.81 | 6.78 | 7.13 | 6.72 |

WCAG AA asks for 4.5:1, and that applies to placeholders. The fix is one line: full
`muted`, no opacity. Everything else passes.

Related: a ruled field's underline is `line` on a near-paper card, about 1.2:1.
That is well under the 3:1 that WCAG 1.4.11 asks for a control's boundary. The old
`.field` box had the same problem, but an underline alone is easier to miss than a
box.

### 4.2 Touch: hover sticks after a tap

The lift and darker border on the big answer cards, chips and toggles are on plain
`:hover`. On a phone, which is most guests, `:hover` stays applied after a tap until
the guest taps somewhere else. The fix is to wrap those rules in
`@media (hover: hover)`.

### 4.3 The Card look puts cards inside a card

With the block's Look set to **Card** (the default for one of the vibes,
`src/lib/site/vibes.ts`), the form is a sheet, and each person is another sheet
inside it. On a 390 px phone that is two borders and two paddings: placeholders are
cut off ("anything t…") and labels wrap onto two lines. Inside the Card look, each
person should be a plain section separated by rules, not a nested card.

### 4.4 It is long on a phone

Three guests, two events and five questions come to about **3,500 px** at phone
width. Every person shows every field, even when they have said no to everything,
and the send button is at the very bottom.

I tried hiding a person's fields when they have said no to everything, and backed
it out: a hidden `required` question would silently block the form from sending.
`submitRsvp` has **no** server-side check for required answers (checked: no
`required` in `src/server/actions/rsvp.ts`). So the safe way to do it is to drop
`required` from a person who is not coming, then hide their fields. That is a
behaviour change, so it is a question for you (§7 Q2).

### 4.5 Smaller things

- **Chips change width** when picked, because the ✓ is added before the text. The
  pills next to it move over. Reserve the space.
- **The browser's "please fill this in" bubble** for a required chip question points
  at a hidden 1 px input, so it can appear in an odd place. A proper fix is our own
  "please pick one" message.
- **The confirmation's calendar box** (`WeekendCalendar`, from spec 27) is still a
  square box with a square button, inside the new rounded card. It should match.
- **Two other guest-facing pieces were not restyled**: `ReplyBanner` (the reply
  that arrives from the email's Yes/No buttons) and the sticky reply bar. They still
  use the older look.
- **Dead code:** the `status === "saved"` line under the button can no longer show,
  because a successful send switches straight to the confirmation. Also, `peer` on
  the chip input is unused.
- **The dark-mode patches in `globals.css`** are no longer used by this form. They
  are still used by song requests and the guestbook, so they stay. Those two would
  be the next things to move onto tokens (§6 item 9).
- **24-hour times** ("15:00") match `formatDateTime` and the other places the site
  shows a time. If NZ guests would rather read "3:00 pm", that change belongs in
  `src/lib/format.ts` for the whole site, not just here.

## 5. Not in scope

- Any change to what is stored, or to `submitRsvp`, apart from what §7 Q2 might
  decide.
- The planner's own screens (`/rsvp`, `/questions`).
- The save-the-date page, which has its own designer and stylesheet (spec 26/31).

## 6. Round two: proposals (not built)

In recommended order. Items 1–4 are small and need no decisions; they are fixes to
round one.

1. **Placeholder contrast.** Use full `muted` (§4.1).
2. **Hover only where hovering exists.** `@media (hover: hover)` around every hover
   rule in the `site-rsvp-*` section (§4.2).
3. **No cards inside the Card look.** Under `[data-look="card"]`, a person is a
   section with a rule above it, not a nested sheet (§4.3).
4. **Tidy-ups.** Reserve the ✓ space on chips, remove the dead "Saved" line and the
   unused `peer`, and fix the stale "Confirm" comment (§4.5, §3.2).
5. **A shorter form for people who aren't coming.** Hide a person's fields (dietary,
   access, questions) once they have said no to every event they are invited to,
   with "Not coming — change" to bring them back. Their `required` is dropped while
   hidden, and nothing they typed is lost. *Needs Q2.*
6. **Field boundaries.** A slightly stronger underline (`muted` at around 40%) so a
   field reads as something to write on (§4.1).
7. **Our own "please answer" message** for a required chip question, shown next to
   the question, instead of the browser's bubble (§4.5).
8. **Matching the pieces around the form.** `WeekendCalendar`, `ReplyBanner` and the
   reply bar get the same rounded, tokens-only look (§4.5).
9. **The other guest forms.** Song requests and the guestbook move onto the same
   `site-rsvp-input` / chip / pill vocabulary, renamed `site-form-*` once more than
   one form uses it. After that, the `[data-site-tone="dark"] .card/.field/.btn` patches can be
   deleted.

Verification for round two, on top of §3.4: a run with VoiceOver on iOS Safari and
a real phone, because the touch and screen-reader findings above cannot be settled
in headless Chromium.

## 7. Open questions

1. **The copy in §3.2.** Keep "Sadly, can't make it", "Send our reply" and the event
   times? Or go back to the old words? *Recommendation: keep.*
2. **People who aren't coming (§6 item 5).** Should a person who has said no to
   everything still be asked their meal and their dietary needs?
   *Recommendation: no. Hide those fields and don't require them. The couple doesn't
   need a meal choice from someone who isn't coming.*
3. **The petals.** Keep them, make them a planner switch, or remove them?
   *Recommendation: keep. They respect reduced motion already, and they appear
   once, only after a yes.*
4. **How much of round two?** Items 1–4 only (the fixes), 1–8 (everything on this
   form), or 1–9 (the other guest forms too)? *Recommendation: 1–8.*
5. **24-hour times** (§4.5). Leave "15:00", or switch the whole site to "3:00 pm"?

## 8. Pick up here (round one)

Open a household's link on a real phone with the branch deployed. Answer "Yes" for
everyone, pick a meal for each person, send, and watch the confirmation. Then switch
the palette to Midnight and do it again. Then answer §7.

## Build status — round two (2026-10-23)

Six files: `globals.css`, `rsvp-form.tsx`, `question-field.tsx`, `reply-banner.tsx`,
`src/lib/rsvp-household.ts` (+ test). No migration, no server change.

| Item | What was done |
| --- | --- |
| 1 | Placeholder is full `muted` (4.5:1 or better on every palette, from §4.1's own numbers). |
| 2 | Every `site-rsvp-*` hover rule is inside `@media (hover: hover)`; the press (`:active`) is not. |
| 3 | `[data-look="card"] .site-rsvp-sheet`: inside the Card look, a person (and "A few last things") is a section under a rule. |
| 4 | Chip tick sits in the chip's left padding, so width never changes. The dead "Saved" line, the unused `peer` and the stale "Confirm" comment are gone. |
| 5 | `isNotComing(responses)` (in `src/lib/rsvp-household.ts`). A person who said no to every invited event sees "Not coming, so there's nothing more to ask. Switch an event to Yes to change that." in place of their fields. The fields **unmount**, so nothing hidden can block the send; what they typed stays in form state and comes back. The plus-one name box still shows. **What is sent is unchanged**: their state, typed text included, still goes to `submitRsvp` as before. |
| 6 | Field underline is `muted` at 75%: the weakest that clears 3:1 on all eight palettes (lowest 3.21, Dusk). Long-text boxes use the same border. |
| 7 | Chip questions no longer carry `required`. `unansweredChips()` (`src/lib/rsvp-household.ts`) runs on send, after the browser has checked the text boxes. If any are unanswered: "Please pick one." / "Please pick at least one." under each question, a count beside the button (`role="alert"`), the first one scrolled to the middle and its first chip focused. Each message goes as soon as it is answered. The legend says "(required)" to screen readers, since the inputs no longer do. People who aren't coming are not counted. |
| 8 | `WeekendCalendar` is rounded **inside the reply panel only** (the Schedule block's copy stays square among square things). `ReplyBanner` uses the sheet, a ruled textarea and the site's `std-button` pill. The reply bar already matched (ink bar, pill action), so it is unchanged. |

**One behaviour change to know about:** a *required* choose-several question was
never enforced before, because checkboxes carried no `required`. It is now: the
form asks for at least one. Text, number and yes/no-as-text questions are still
checked by the browser, as before. `submitRsvp` still checks nothing for required
answers, so a guest with JavaScript off is unaffected either way.

**Verified:**

- Typecheck is clean.
- **1090 unit tests**, five of them new: `isNotComing`, `isChipQuestion` and
  `unansweredChips`.
- `next build` succeeds, using placeholder environment variables.
- Headless Chromium, using a temporary page with sample data (deleted, never
  committed), checked by script rather than by eye:
  - **Not coming:** a person who said no to everything sees the "Not coming" line
    instead of their fields.
  - **Sending with unanswered questions:** shows 3 messages plus the count, stays
    on the form, and focuses the first one (`a-q1`).
  - **Answering one:** removes its message.
  - **On a touch device:** `(hover: hover)` is false, and a tapped card's
    `transform` is `none`.
  - **Chip width** is 86.69 px both before and after picking.
  - **Text kept:** "No nuts" typed, then switched to No (fields hidden), then back
    to Yes, comes back intact.
  - **Full send** in Evening + Midnight reaches the confirmation, with the
    rounded calendar box.
  - No console errors.

  The script check also caught the item 3 selector matching nothing (the outer
  sheet *is* the `[data-look]` element); fixed and re-shot.

**Not verified:**

- `ReplyBanner` was never rendered. It needs a real token and calls a server action
  on mount, so it was checked only by typecheck and build.
- Supabase.
- iOS Safari, a real touch screen, VoiceOver. These are the checks §6 called for,
  and they are still owed.
- `verify-migrations.sh` was not run, as there is no SQL in this change.

**Pick up here:** §8, plus: on a real phone, leave the main course unanswered and
press Send, and check that the page scrolls to it and says so. Then answer No for
one person and check their questions go away.
