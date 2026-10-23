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

## Answered — 2026-10-23, later: "Make sure that all of the changes are optional and toggleable"

Two questions were put, and answered:

| Question | Answer |
| --- | --- |
| Which changes get a switch? | **Literally everything**, readability and phone fixes included. This was chosen over "design choices only", which was the recommendation. |
| Where do the switches live? | **On the RSVP block** (recommended). The petals and the person-by-person arrival go in the existing **Motion** list, so the Still level turns them off. |

Built the same session; see **Build status — switches**. This goes against the rule in
`switches.ts` that correctness is not a switch. The planner asked for it explicitly, so
each fix's switch says plainly what turning it off costs.

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

## Build status — switches (2026-10-23)

**How it is stored.** It follows `lightbox`: the RSVP block's style gains `rsvpOff`,
the list of features switched **off** (`src/lib/site/rsvp-features.ts`,
`RSVP_FEATURES`). When nothing is off the key is absent, so every existing block keeps
everything on. **There is no migration**, because block style is already JSON. The
style schema accepts only names from the list. `BLOCK_STYLE_KEYS` gained `rsvpOff`
(the compile-time guard insisted).

**Where the planner finds it.** In the site editor, on the RSVP block, there is a
"Reply form" panel with three groups of tick boxes: How it looks, Readability and
phones, What it asks. Each box says what happens when it is off. A switch that
depends on another (`steady_chips` and `own_required_check` need `chips`;
`readable_text` needs `ruled_fields`) dims, and says it has no effect while the one
it needs is off. All of them are also in the site's switch registry, as `rsvp.<name>`.

| Switch | Off puts back |
| --- | --- |
| `answer_cards` | Plain square "all of us" boxes |
| `person_cards` | A `.card` per person with a serif legend; events as plain rows |
| `divider` | No "or answer one by one" line |
| `event_times` | Event name only |
| `pill_toggles` | Small square Yes/No buttons |
| `ruled_fields` | Boxed `.field` inputs with plain labels |
| `chips` | Native radios, tick boxes and the yes/no `<select>`, all with the browser's `required` (`ClassicChoice` in `question-field.tsx`) |
| `pill_button` | Square `btn-primary` on the left |
| `soft_panels` | Square confirmation, closed note and Card frame; hairline progress bar |
| `new_wording` | "Not able to", "Confirm our RSVP", "Saving…" |
| `readable_text` | Placeholder `muted`/80%, field lines in `line`, red-700 error text |
| `touch_hover` | Hover everywhere, phones included |
| `flat_card_look` | Cards inside the Card layout |
| `steady_chips` | Tick inline; the chip grows when picked |
| `skip_not_coming` | Everyone is asked everything |
| `own_required_check` | Chips carry `required`; the browser warns; a required pick-several is not enforced |
| `round_calendar` | Square calendar box in the confirmation |
| `banner_style` | The email-reply banner's older square look. Read from the page's RSVP block in `/w/[slug]/[household]/page.tsx` |

The motion effects are `reply_arrivals` and `reply_petals`. They are in Gentle and
Cinematic, which keeps them on wherever they showed before, and **off under Still,
which they ignored until now**. Each can also be switched on its own under
Motion → Customise.

**How the stylesheet reads it.** The form's root carries `data-rsvp-off="…"`. The
fix-type switches are rules in `globals.css` that apply only when their name is in
that attribute. The petals and arrivals use `[data-fx~="reply_petals"]` and
`[data-fx~="reply_arrivals"]`.

**Verified:**

- Typecheck is clean.
- **1097 unit tests**, seven of them new in `rsvp-features.test.ts`. They check:
  - an absent or unknown value reads as all on;
  - only what is off is stored;
  - the schema accepts the list and rejects unknown names;
  - every switch says what happens when it is off and is in the registry.

  One existing test (`motion.test.ts`) was changed: Gentle's effect list now
  includes the two reply effects.
- `next build` succeeds, using placeholder environment variables.
- Headless Chromium, using a temporary page with sample data (deleted, never
  committed). Every switch was checked on and off by script:
  - **All off** is the original form: 9 native radios, a `<select>`, 10 boxed
    fields, "Confirm our RSVP", "Not able to", no divider, no times, `.card`
    fieldsets, Tom asked everything, and the browser blocks the send. A screenshot
    matches the pre-spec form.
  - **All on** is unchanged from round two.
  - `readable_text` changes the placeholder colour.
  - `touch_hover`: a tapped card on touch is lifted only when the switch is off.
  - `steady_chips`: chip width stays at 86.69 px when on; it goes from 81.9 to
    99.0 px when off.
  - `flat_card_look`: the inner card's border is 0 px when on, 1 px when off.
  - `round_calendar`: the calendar box's corners are 12 px when on, 0 when off.
  - Under the Still motion level, the petals don't show.
  - `own_required_check` off hands the check to the browser.
  - `skip_not_coming` off asks Tom everything.

**Not verified:**

- **The editor panel itself was never rendered**: it needs a signed-in planner and
  the database.
- `setBlockStyle` saving `rsvpOff` has never run against Supabase.
- The banner switch was checked by typecheck only.
- **One test run had a single failure that I could not reproduce or identify.** It
  ran while the dev server was being stopped. Eight runs since have all passed.

## Fix — the form over a photograph background (2026-10-23)

**Reported by the planner while testing:** "doesn't work with a photo background."

**Cause.** A block with a Photograph background forces its fixed cream (or the
block's own text colour) onto **every** descendant, using `[&_*]:text-onphoto` in
`Background()`, `render.tsx`. That is right for words on a photo. But the reply form
draws its own light cards, fields and buttons, so its words went cream on cream:
measured, `rgb(251 248 243)` text on a card of about the same colour. The classic
look (all switches off) broke the same way on its white `.card`s.

**Fix.**

- `Background()` now forces the colour on every descendant **except** what is inside
  a `data-own-ground` element:
  `[&_*:where(:not([data-own-ground]):not([data-own-ground]_*))]`. The `:where()`
  keeps the specificity exactly what `[&_*]` had, so no other block on a photo
  changes. The wrapper also gains `data-ground="photo"`.
- `RsvpForm`'s four roots (form, confirmation, closed, closed classic) carry
  `data-own-ground`.
- Under `[data-ground="photo"]`, they take the theme's `ink` and drop the photo's
  text shadow.
- In the Inline layout over a photo, the form becomes one sheet, so nothing is left
  half on the picture. The people inside it become sections, as in the Card layout.
  This follows the `flat_card_look` switch.

**Verified:**

- Headless Chromium, on a temporary page that mirrors `Background()`'s photo markup,
  with a gradient standing in for the photograph:
  - text inside the form is the theme ink: `rgb(43 39 36)` on Ivory and
    `rgb(239 232 218)` on Midnight;
  - the section heading and intro outside the form stay cream, and keep the shadow
    under "Soft text shadow";
  - all switches off is also readable;
  - selected Yes and a picked chip are paper on ink;
  - the confirmation is ink on its sheet.
- 1184 unit tests and `next build` pass on top of the latest `main`.
- The compiled CSS was checked to contain the new selector.

**Not verified:**

- A real photograph, or a real site.
- The "Panel" photo-text treatment: the form now sits as a light sheet inside that
  dark panel. It should be readable, but it was not looked at.

