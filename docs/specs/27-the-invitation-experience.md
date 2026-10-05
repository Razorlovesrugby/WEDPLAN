# Spec 27 — The invitation as an experience, and an editor you can play with

**Status: built, steps 0–7 (2026-10-05) — never run against a live Supabase
project.** The §15 build order was authorized in words that mean "write code"
("Let's build it") after all eleven §12 questions were answered; see **Build
status** at the end for what exists, where it departs from this text, and what
has and has not been looked at.

**Depends on:** spec 23 (blocks, `site_revisions`, the one renderer), spec 24
(the builder's editing feel — partly built, five questions still open; §11
says how this spec relates to it), spec 21 (a household's own address), spec 22
(who is invited to what, and view tracking), spec 25 (blocks that know things),
and the save-the-date designer from session 31, which is the nearest thing this
repo has to the standard this spec is aiming at.

**Scope, decided before writing:** what a guest *feels* arriving on and
scrolling through their invitation, and what the planner can *do* to shape it
without writing CSS. Not in scope: how invitations are sent and chased
(`/invitations`, WhatsApp, email) — see §13.

---

## Answered — 2026-10-05

Eleven questions, answered in one round. Seven took the recommendation; **one
(Q3) overruled it, and it changes the document.** §7, §11, §12, §14 and §15
below are updated to match; where an older sentence in them contradicts this
section, this section wins.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Opening | **The cover.** A section of the page addressed to the household, not an overlay and not an envelope |
| 2 | Motion default | **Gentle**, with three levels: Still / Gentle / Cinematic |
| 3 | The couple's note to each household | **Out — against the recommendation.** No `couple_note` column and no note field in Guests. **`0032` is therefore not the household note**; see "What Q3 changes" |
| 4 | Looks | **Five blocks × three Looks:** Hero, The weekend, Our story, Gallery, RSVP |
| 5 | A third theme preset | **Yes, one:** a dark "Evening" |
| 6 | Click-to-edit in the preview | **In**, as the centrepiece of the editor work |
| 7 | Photos already uploaded | **New uploads only.** Existing photos keep working at one size |
| 8 | Expiring photo URLs | **The `/api/photo/<id>` redirect route, with the TTL raised to 24h as a stopgap** |
| 9 | The writing helper | **Out** of this spec |
| 10 | Spec 24 | **Folded in as step 0** — see below for exactly what that means |
| 11 | Save-the-date | **Share tokens only** (easing, motion level). It keeps its own `std-*` layout system |

**What Q3 changes.** "Personal" (§1, §7) now rests on three things instead of
four: the household's **names, large, on the cover**; **their weekend** as a
card with one calendar file; and **a reply that remembers what they said**.
The one item cut was the only one a *person* writes, so the personal layer is
now entirely derived from data already in the app — which is cheaper and has
no privacy surface, and also means two households' pages differ only by names
and events. That is a real loss against the word "personal" and the decision
is cheap to reverse: it is one nullable column and one field, and §7 keeps the
privacy reasoning (above all, **never reuse `households.notes`**, the
planner's private text) so it can be added later without re-deriving it.

**What Q10 means, precisely.** Spec 24's §4–§7 become step 0 of the build
here. Its own questions were answered as follows. Where spec 24 stated a
proposal I took it; **where it did not, the answer below is my reading and is
marked "to confirm"** — you did not answer these individually.

| Spec 24 question | Taken as | |
| --- | --- | --- |
| 1 Preview: channel, anchors or both | Both (its stated proposal). The channel is also what click-to-edit (E2) needs, so it is not extra work | |
| 2 Starter content | Sample prose, **with publish refusing any block still carrying untouched starter text** (the third option it describes) | **To confirm** — spec 24 listed options without a recommendation |
| 3 Reordering on a phone | Yes, move up / move down buttons beside the drag handle | **To confirm** — reopens spec 23 Q7 |
| 4 "Preview as a household" picker | Yes (it is E7 here) | |
| 5 The style labels | As proposed ("Plain / Tinted / Dark", "As taken / Square / Tall / Wide") | **To confirm** — they are copy |

### Added after the round — 2026-10-05

Two further instructions, given in the same session, once the greeting's
design was seen:

> "Please make house greeting custom and able to toggle, everything I should
> be able to toggle."

1. **The household greeting is customisable and can be switched off.** Its
   wording is the planner's, built from tokens for the household's names
   (§5, "The greeting"). Previously it was derived and fixed.
2. **Everything this spec adds is a switch.** Not only the greeting: every
   element, effect and personal touch has an on/off, a stated default, and
   leaves no hole when off. This is now a rule (§4) with a complete list
   (§9, E9), and a test that enforces it (§14).

Both are spec content; neither authorizes a build.

---

## 1. What was asked

> "Let's analyze to find ways to make the invites prettier, better UX. And
> make the scrolling and user interaction fun. We also want the editor within
> the website to allow for great customisation and plug and play. Let's explore
> and write a spec. I want elegant, I want smooth, I want personal, I want
> technology forward."

Four adjectives, and they pull against each other in the usual way: *smooth*
and *technology forward* are how a page becomes a 4MB scroll-jacked slideshow
that fails on a 2019 Android in a car park; *personal* is how a shared link
becomes a leak; *great customisation* is how a builder produces an unreadable
page. §4 turns each adjective into a rule that says what it is not allowed to
cost.

## 2. The caveat this spec is written under

**Nothing in the site builder or the guest page has ever been opened in a real
browser against real data**, and `0022`–`0031` are not applied to the live
project (`docs/HANDOFF.md`). Every finding in §3 was read off the source, not
seen. They are solid readings — each cites its line — but this spec is about
*feel*, and feel is exactly the thing a source reading cannot establish.

Two further limits, stated plainly:

- **No reference site was inspected.** No competitor, no template gallery, no
  published invitation was opened for this spec. The design direction is my
  judgement and the web platform's current capabilities, not research. Spec
  14's own caveat about `aisle.wedding` being unreachable from this sandbox
  still holds. If you have invitations you love, screenshots of them are worth
  more than any section of this document.
- **Browser-support claims are written as "check at build time".** The
  scroll-driven and view-transition features in §7 and §8 have been shipping
  across engines unevenly. Every use below is a progressive enhancement behind
  an `@supports` guard, so the page is correct without it — but the table of
  who gets the full effect is a thing to verify on the day, not to trust from
  this file.

**What is different from earlier visual specs:** the sandbox has Chromium, and
session 31 rendered the save-the-date in three layouts at two widths from a
throwaway page fed sample data. That technique works here. So this is the first
spec where the build can *look at what it made* at specific scroll offsets and
viewport widths, even without Supabase. It cannot judge taste — you can.

## 3. What a guest gets today, and what the planner can do about it

### The guest's journey, read off the source

A household's link (`/w/<wedding>/<household>`) renders
`src/app/w/[slug]/[household]/page.tsx`: the nav, the chapter rail, then
`SiteBlocks` — the published blocks in order, through
`src/components/site/blocks/render.tsx`.

| # | What happens | Where | Why it falls short of "elegant, smooth, personal" |
| --- | --- | --- | --- |
| 1 | **Arrival is a normal web page.** The hero, then a single `0.78rem` uppercase line with the household's name | `render.tsx:233-238` | The most personal moment the product has — *this link is for you* — is the smallest text on the screen. There is no greeting, no first names, no sense of an invitation being *opened* |
| 2 | **One effect exists.** Sections fade and rise 12px on scroll-in, once | `globals.css:96-104`, applied to `SiteSection`, `Shell`, `PageBreak` | Spec 14 §5 decided "nothing else moves". That was right for a first build. It means the hero, every photo, the nav, the schedule and the RSVP are static, and every section arrives identically |
| 3 | **Photos are one size, with no placeholder.** Encoded client-side to WebP at up to 2000px, served as a plain `<img loading="lazy">` | `encode-image.ts:21`, `blocks/media.tsx` | A phone downloads a 2000px image to draw 390 CSS pixels, and a slow connection shows an empty box that then pops. No `srcset`, no reserved aspect ratio, no blurred stand-in |
| 4 | **Photo URLs expire after an hour.** `SIGNED_URL_TTL_SECONDS = 3600` | `lib/moodboards.ts:54`, `storage.ts` | A guest opens the link, leaves the tab, comes back after dinner and scrolls: every photo not yet loaded is a dead link. This is a real bug, not polish, and it bites exactly the "open it again later" behaviour an invitation invites |
| 5 | **The gallery has no way to look at a photo.** No enlarge, no swipe | `components/site/gallery.tsx` (no lightbox anywhere in `src/components/site`) | The thing most guests do with wedding photos is open one |
| 6 | **RSVP is the last chapter.** The nav pins an "RSVP" button that jumps to it | `site-nav.tsx` | The one action the whole page exists for is a jump away at all times — good — and then a plain form with no sense of progress, and no change of state once answered |
| 7 | **Personal touches stop at "their events".** Name line, filtered schedule, RSVP | `render.tsx` `personal` branches | Nothing from the couple to *them*. No "we've kept you a seat". No single calendar file for just their weekend (the save-the-date has one for the date alone) |
| 8 | **Two themes.** Script and Editorial | `lib/theme/presets.ts` | Six palettes, two typographic pairings, two presets: a small space for "make it ours" |

### The planner's side

| # | What it does | Where | Why it reads as a form, not a design tool |
| --- | --- | --- | --- |
| 9 | **A block's whole range of expression is four enums.** `width`, `background`, `align`, `shape` (+`bgImage`, `embed`) | `blocks.ts:30-55`, `styleSchema` in `actions/site-blocks.ts:44` | "Customisation" is reorder-and-recolour. Nobody can make the schedule look like a timeline, or the story like a magazine spread. Two weddings built from the same blocks look the same |
| 10 | **You cannot see what a block looks like before you add it.** The palette is a list of names and one-line blurbs | `builder.tsx` palette | "Photo text" tells nobody anything |
| 11 | **The preview still remounts on every edit** | `builder.tsx:419` (`key={previewKey}`) — spec 24 §3.1, unbuilt | Edit the footer, watch the hero |
| 12 | **There is no way to click the thing you want to change** | spec 24 §8 deliberately deferred it | The single biggest gap between this and a tool that feels like Squarespace |
| 13 | **No autosave, no undo, delete is `window.confirm`** | spec 24 §6, §8 | A tool you cannot play with, because play means breaking things |
| 14 | **Three starter layouts** | `STARTER_LAYOUTS`, `blocks.ts:469` | The first screen of the builder is a choice of three arrangements of the same grey blocks |
| 15 | **The preview cannot show a household's page without a hand-typed `?as=`** | `site/preview/page.tsx` — spec 24 Q4 | Half the page is personalised and the planner cannot see that half |

**The shape of the gap:** the architecture is *right* — one renderer, a closed
style set, a draft/published split, a context that knows who is reading. What
is missing is a layer of **expression** on top of it: motion, arrival, looks.
That is good news. None of §5–§9 needs the model rebuilt.

## 4. The four adjectives, as rules

These are the constraints every later section is held to. They are also the
things most likely to be broken by a well-meaning later session, so they are
written as rules and not as taste.

**Elegant means restraint, enforced by the system.** Customisation is a closed
set of *curated* choices — spec 23 §7's rule survives intact: "a builder that
can produce an unreadable page has failed at the thing it was bought for."
"Plug and play" therefore means **pick a Look and it works**, never "write CSS"
or "choose any colour". Anything the planner can reach must be something we
have looked at and would put our name to.

**Smooth means it never blocks and never lies.**
- Content is in the HTML. Motion is an enhancement that can fail without
  consequence: the starting state (opacity 0, a clip, an offset) is applied
  **only inside an `@supports` guard for the feature that undoes it**, exactly
  as `globals.css:96` does now. Getting that backwards is how a page renders
  permanently blank on an older phone.
- **No scroll-jacking, ever.** No scroll-snapping that fights a thumb, no
  pinned sections that hold the page hostage, no wheel interception. Scroll
  position belongs to the guest.
- `prefers-reduced-motion` keeps the fade and drops the movement (the existing
  convention, `globals.css:119`). It is not an afterthought; every motion in §7
  states its reduced form.
- **CSS first, JavaScript last.** No animation library. Spec 14 §5 chose
  CSS-only scroll animation "so there is no IntersectionObserver and no
  JavaScript on the critical path of a guest site", and that reasoning is
  stronger now: this page is opened on a phone, on mobile data, often on a
  venue's one bar of signal.

**Everything is a switch** (added 2026-10-05). Anything this spec puts in front
of a guest — an element, an effect, a personal touch — can be turned off by the
planner, has a default we state, and **closes up cleanly when off**: no empty
frame, no orphaned heading, no gap where it was. The cheap way to break this is
to build a feature and add its switch later; the rule is that a feature has no
render path without one. The full list is E9 (§9).

**Personal means *for them*, and the credential stays a credential.** The
household link is a secret (spec 21 §3). So: nothing personal ever renders on
the shared `/w/<slug>` page; the `ViewLogger` and `ReplyBanner` rule that
effects happen from the browser on mount, never during the render, stays
(mail scanners fetch every URL); and **no feature here adds a "share this
invitation" button to a household page**, because forwarding that link
forwards the right to answer for a family. §8 makes the same point from the
other side.

**Technology forward means the platform, not a dependency.** The web has
recently gained almost everything an invitation wants: scroll-linked
animation, view transitions, container queries (already used, `.std-*`),
`text-wrap: balance`, the `<dialog>` element, spring-like easing in plain CSS.
Using them costs bytes in a stylesheet, not kilobytes of library. §9 lists what
was considered and refused, with reasons, because "technology forward" is also
a way to ship a WebGL hero that a third of guests cannot load.

## 5. Part A — The arrival

**The problem (§3 row 1):** the best moment is the smallest text.

**Proposal: the cover.** On a household's page, the first screen is a *cover* —
the invitation's front — not the site's hero with a caption under it. It
carries, large, in the theme's display face:

```
                For Chidi, Ada and Zara          ← the greeting: a template the
                                                   planner writes, off if they
                                                   want (see "The greeting")
                  Ray  &  Olivia
              invite you to their wedding
              Saturday 12 June 2027 · Wells
                         ↓
```

Over the lead photograph (or, with none, the palette's ground), with the
household greeting entering first, then the names, then the date — three beats
a few hundred milliseconds apart. On the shared site the cover is the existing
hero unchanged: **the personal cover is `personal`'s branch inside the hero,
not a second layout**, which is the rule spec 23 §6 set and the reason "the
site and the invite are the same thing" is true in the code.

**Decided in this spec (§12 asks you to overrule it):** the cover is a *section
of the page*, not an overlay. The envelope-and-wax-seal idea — a sealed card
over the page that the guest taps to open — is the most requested thing in
this category and has a real failure mode: an overlay that needs JavaScript to
dismiss is a locked door for a guest on a stalled script, a screen reader, or
a corporate mail previewer, and it puts a tap between the guest and the
information they came for. The cover gives the same *feeling* of being opened
— a tall first screen that is clearly addressed to them, with a scroll-driven
transition into the page (§6) — with none of the lock. If you still want the
envelope after seeing the cover, it is buildable as a `<dialog>` that is
**open in the HTML and removed by script**, so no-JS readers never meet it;
§12 question 1.

**Specifics:**
- `100dvh`, not `100vh` — mobile browser chrome makes `vh` a lie, and a cover
  that overflows by the URL bar is the first thing a phone shows.
- A **focal point** per hero photo (§8): the crop that keeps a face in the
  frame at 390px *and* at 1440px.
- The cover is also what the Open Graph image already is for the household
  link (`opengraph-image.tsx`) — the preview in WhatsApp and the first screen
  should look like they belong together. A one-line check, not a build item.
- Reads the existing hero payload; adds `cover_line` ("invite you to their
  wedding" by default) and the greeting's fields (below) to the hero block.
  **Each line of the cover — greeting, cover line, date, place, "a line about
  why", the scroll cue — has its own switch** (E9). No new block.

### The greeting

**What it is.** The line addressed to the household at the top of their page.
It appears **only on a household's own page** (`ctx.personal` set), never on the
shared site and never in any metadata — §7's rule, unchanged.

**It is the planner's wording, not ours.** A single text field on the hero
block, built from tokens the renderer fills in:

| Token | Becomes | Example |
| --- | --- | --- |
| `{names}` | The household's members' first names, joined (`listNames`, spec 22) | `Chidi, Ada and Zara` |
| `{household}` | The household's display name, which is already editable in Guests | `Okonkwo family` |

| Template | Renders as |
| --- | --- |
| `For {names}` *(default)* | For Chidi, Ada and Zara |
| `Dear {names}` | Dear Chidi, Ada and Zara |
| `Dear {household}` | Dear Okonkwo family |
| `Welcome, {names}` | Welcome, Chidi, Ada and Zara |
| `Just for you` *(no tokens)* | Just for you |

Choosing between *first names* and *the household name* is therefore choosing
a token, not a second setting. A template with no token is allowed — "Welcome"
is a legitimate greeting — and renders the same for everyone.

**Switch.** `greeting` on/off, on the hero block, **default on**. Off means the
line is not rendered and the cover closes up around the names. This is separate
from the template: switching it off keeps your wording, so switching it back on
does not mean retyping it.

**Rules the renderer holds, so the planner cannot make it look wrong:**
- **Plain text, 80 characters at most.** No HTML, no markup, escaped like every
  other free text on this site. Unknown tokens (`{nickname}`) are rejected at
  save with the allowed ones named, never rendered raw.
- **A household with no named guests** falls back to `{household}` for
  `{names}`, rather than rendering "For ".
- **A very large household** (more than five first names) falls back to
  `{household}` as well — "For Chidi, Ada, Zara, Ruth, Tobi, Kemi and Femi"
  is a sentence, not a greeting. The threshold is one constant.
- **A template that renders empty** after substitution hides the greeting
  rather than leaving its space.
- It is set in the display face at the cover's size; length never changes the
  layout, only wraps (`text-wrap: balance`).

**What the planner sees while editing.** The preview with no `?as=` is the
*shared* site, which by rule has no greeting — so a planner switching the
greeting on would see nothing and conclude it was broken. The builder therefore
**previews as a real household by default** (the first on the list, with a
visible "Previewing as the Okonkwos · change" control, E7), and says so beside
the greeting field: "Only guests with their own link see this."

**What it does not do:** there is still no per-household override — one
household cannot have different wording from another. That was the couple's
note (cut, Q3) and would need a column; the template plus the household's
editable display name covers the cases that are not a one-off.

## 6. Part B — A scroll with a point

**The problem (§3 row 2):** one uniform 12px rise.

The aim is not "more animation". It is that **scrolling does something
informative**: the hero hands over to the page; a schedule draws itself in
time order; a photo arrives like a print being laid on a table. Each motion
below says what it communicates and what happens without it.

All of these are CSS `animation-timeline: view()` or `scroll()`, inside the
existing `@supports (animation-timeline: view())` pattern. **No new JavaScript.**

| Motion | What it says | Technique | Without support / reduced motion |
| --- | --- | --- | --- |
| **Cover hand-over** | *You have arrived, now read.* The cover photo scales ~1.00→1.06 and the scrim deepens as it leaves; names drift up slower than the page (a light parallax) | `scroll()` timeline on the cover; `transform` + `opacity` only | Static cover. Reduced: no scale, scrim fixed |
| **Chapter arrivals, three kinds** | Not every section should arrive the same way. *Rise* (today's), *Fade*, *Reveal* (a `clip-path` wipe on a photo or heading, an inch of travel) | `view()` timelines, `animation-range: entry 0% entry 40%` | Content visible. Reduced: fade only |
| **The itinerary draws itself** | *Time moves down the page.* A hairline grows between events as each enters; the time labels settle in sequence | `view()` on the list; `scaleY` on a pseudo-element | The line is fully drawn, statically |
| **Photo arrival** | A photo on a band or in `photo_text` rises and un-crops (scale 1.04→1) as it enters | `view()`; GPU-only properties | Plain image |
| **A reading hairline** | A 2px accent line at the top of the viewport fills with scroll progress | `scroll()` on the document, `scaleX` | Absent |
| **The nav condenses** | The sticky nav shrinks and gains its blur only after the cover leaves, so the cover is clean | `scroll()` timeline on a sentinel | Always the condensed form |
| **Stagger** | A group (events, FAQ rows, party members) enters 40–60ms apart rather than as a slab | `animation-delay` from a `--i` index set at render | No stagger |
| **Hover and press, everywhere** | Buttons and rows answer a finger or a cursor | `transition` on `transform`/`background`; `:active` scale 0.98 | Instant state change |

**Easing is part of the design.** One easing token set in `globals.css`, shared
with the save-the-date's `std-rise`: a soft ease-out for entrances and, for the
few places that want weight (the RSVP confirmation, §8), a `linear()` function
easing that approximates a spring — plain CSS, no library.

**A motion level first, and a short list of switches behind it (E9) — not a motion editor.** The planner gets one control, "How
much should it move?", with three answers: **Still** (no scroll animation at
all; the page is a quiet document), **Gentle** (chapter arrivals, hairline,
nav — the default), **Cinematic** (adds the cover parallax, photo un-crop, the
drawn itinerary, stagger). It is stored on the theme as `motion`
(`"still" | "gentle" | "cinematic"`) and emitted as `data-motion` on the site
root, so the *stylesheet* decides what each level means, in the same way
`data-site-theme` already does (HANDOFF session 30). A fourth level later is a
stylesheet. Per-block overrides are §10 E4 and are deliberately limited.

**Hard limits.** Animate `transform` and `opacity` only (composited; no layout
or paint on scroll). Never animate `width`, `top`, `box-shadow` or a filter on
scroll. Nothing runs when the tab is hidden. Total added CSS is budgeted in §11.

## 7. Part C — Personal

**What a guest should see that nobody else does:**

1. **Their names, large, first** (§5). `listNames` already exists and spec 22
   already guarantees an event is shown only to the people it is *for*.
2. ~~**A note from the couple, to them.**~~ **Cut by Q3 (2026-10-05).** The
   idea — "Nana — we've saved you the seat by the window", one short text per
   household, rendered under the cover in the couple's voice — is kept below
   as a worked-out design so it can be added without starting over, but it is
   **not part of this build.**
3. **Your weekend, in one card.** Their events, with times, as a card they can
   screenshot — and **one `.ics` with all of their events**, not just the date.
   `buildAllDayIcs` and the `/api/public/save-the-date/<slug>` route are the
   pattern; this is the timed, multi-event version. Built from the events'
   own timestamps through the wedding's timezone, never `new Date()` on a
   date-only string (the trap HANDOFF session 31 documents).
4. **A reply that feels like a reply.** Today the form is a form. The change:
   - a **sticky reply bar** on phones that appears once the cover has left and
     reads **"Reply · by 1 May"** (the lock date is already in context,
     `render.tsx:369`), and after they have answered reads **"You're coming —
     Chidi & Ada · Change"**. State carried by the page, not a toast that
     vanishes;
   - **big tap targets and one question per household member**, not a grid;
   - on submit, a **view transition** morphs the form into a confirmation card
     (§4: a progressive enhancement; without support it swaps instantly);
   - the confirmation names what they said back to them, and offers the
     calendar file. This is the moment of delight the page is for, and it is
     an ordinary DOM change plus one transition, not a confetti cannon.

**What must not happen.** The greeting (and, if it is ever added, a household
note) render only when
`ctx.personal` is set. They never render in the shared site, in Open Graph
metadata, in the print stylesheet's *shared* output, or in `generateMetadata`'s
description — the household link's preview already names only the couple and
the date (`page.tsx:44-51`), and that discipline is the privacy model. The note
is guest-facing text the planner writes, so it needs a length limit and the
same plain-text rendering every other free text on this site gets (no HTML).

**The migration, kept for later — not to be built under this spec.** One
column on `households`:
`couple_note text` with a length check. **`households.notes` already exists and
is the planner's private scratch text; the guest-facing note must be a separate
column, and must never be derived from `notes`**, because a private note
("Uncle Pete — keep away from the bar") rendered on his own invitation is the
bug this sentence exists to prevent. RLS is the table's existing
`wedding_id` policy; `supabase/tests/` gains an assertion from the second
account that it cannot read or write the first's.

## 8. Part D — Photographs, done properly

This is the least glamorous part and, on a phone, the one a guest feels most.

**D1. Responsive sizes.** At upload, `toWebp` already produces one 2000px
blob. It should produce **three** (about 480 / 960 / 1920 on the long edge),
stored under predictable path suffixes in the same private bucket, with the
renderer emitting `srcset` + `sizes`. A phone then downloads ~60KB for a band
instead of ~400KB. Existing photos stay single-size and keep working; they are
re-encoded only if the planner re-uploads (§12 question 7). **No server-side
image library is introduced** — there is no `sharp` in `package.json` and
adding a native dependency to a Vercel build for this is the wrong trade; the
browser already does the encoding.

**D2. A placeholder that is not a blank box.** Store a tiny dominant colour (7
hex characters) or a ~16px base64 blur per asset at upload, and paint it as the
`<img>`'s background until it decodes. Reserve the aspect ratio from the stored
width/height (`EncodedImage` already returns both) so nothing jumps. This is a
plain `background` and `aspect-ratio` — no hydration, no library.

**D3. The expiring URL (§3 row 4).** Two options, a decision for you in §12
question 8, and a recommendation:
- *Short fix:* raise the TTL for site assets to 24 hours. One constant. A
  household page opened in the evening works at breakfast. It does not fix a
  tab open for a week.
- *Real fix:* serve site photos through a route (`/api/photo/<id>`) that checks
  the asset belongs to a published block and **redirects to a freshly-signed
  URL**. The HTML then carries a stable URL that never expires, the CDN can
  cache the redirect briefly, and the bucket stays private. It is more work
  and it is the right shape. Either way, `site_assets` ids are already never
  exposed as storage paths (`styleSchema` comment), so the route does not widen
  what a guest can reach.

**D4. A focal point.** One pair of numbers per photo (`focal_x`, `focal_y`,
0–1), set by clicking the picture in the picker, emitted as `object-position`.
Spec 23 deferred a crop UI because a crop is a large piece of work; a focal
point is the 10% of it that matters — the difference between a bride's face and
her shoulder at 390px. Stored on `site_assets`.

**D5. A lightbox.** Native `<dialog>`, a swipe/arrow/escape-closable viewer for
the gallery and for `photo_text`/`photo_band` photos. No library. `loading="lazy"`
stays; the dialog preloads the neighbour. The existing keyboard conventions
(Escape closes, as `SiteNav` already does) apply.

## 9. Part E — The editor: plug and play

The model — blocks, a closed style set, draft and revision — is right and
stays. What is added is the layer that makes it *playable*.

### E1. Looks

A **Look** is a curated variant of a block's layout, chosen from a small set,
shown as a **thumbnail rendered from the planner's own content**. It is stored
as one more key in `site_blocks.style` — `variant` — so **no migration**. The
renderer switches on it; the stylesheet does the rest, as `data-site-theme`
already does for presets.

| Block | Looks (first cut) | What the planner is choosing |
| --- | --- | --- |
| Hero / cover | Full-bleed · Framed card · Split (photo beside names) · Type only | The first impression |
| The weekend | List · Timeline (the §6 drawn line) · Cards | How the itinerary reads |
| Our story | Prose · Milestones · Magazine (pull-quote and photo) | How you tell it |
| Gallery | Grid · Masonry · Filmstrip (a horizontal scroll with `scroll-snap`, **non-blocking**) | How photos sit |
| RSVP | Inline form · Card with progress | How the reply feels |

Three Looks per block, five blocks, is fifteen designed things; they are the
single largest design cost in this spec and they are the whole difference
between "customisable" and "a form with a picture beside it". Which blocks come
first is §12 question 4. A block with no `variant` renders exactly as today, so
every existing site is untouched.

**Why not free-form styling:** because that is the failure spec 23 §7 named,
and every previous session that touched this repo repeated it. A Look is a
decision we have already looked at in the planner's palette and fonts; the
combinatorial space is small enough to *test* (§14).

### E2. Click the preview to edit it

The deferred half of spec 24 §8, and the centrepiece of "plug and play". A
planner clicks the schedule in the preview and the inspector opens on it;
hovering outlines each block with its name; the block list highlights the one
in view.

It needs the **return channel** spec 24 §4 deliberately left unbuilt: the
renderer tags each block's outer element with `data-block-id`; the preview page
mounts a small client component that (a) listens for a same-origin refresh
message from the builder, replacing the `previewKey` remount (spec 24 §4), and
(b) posts the id of a clicked block back. **The shared renderer does not learn
it is being previewed** — it only emits an attribute, which is harmless on a
public page — and that property is what keeps the preview honest. Click targets
inside interactive blocks (the RSVP form, a link) are ignored while the planner
holds nothing; a "select" mode toggle is the escape hatch if that proves
fiddly. This is the item most worth deciding on deliberately (§12 question 6).

### E3. Vibes and page templates

Today's three starter layouts become **templates**: a named bundle of *layout +
theme preset + palette + type pairing + motion level + Looks + starter
content*. "Garden party", "Evening", "Modern" — each one opens a *finished,
beautiful* page populated with the planner's own names, date and photos where
they exist and tasteful placeholder where they do not. The first screen of the
builder becomes a choice between three real-looking pages rendered from the
actual renderer, not three arrangements of grey blocks.

A **Vibe** is the same bundle applied to an existing site as a one-click
restyle that keeps all their words: palette, type, motion and Looks change;
blocks and content do not. It is undoable (E6). **A third theme preset** — a
dark, evening-feeling one — is the natural way to make the first Vibe visibly
different from the second; it is a stylesheet plus a row in `presets.ts`, per
the HANDOFF's account of how presets work. §12 question 5.

### E4. Motion controls

The page-level level from §6 is in the Theme section of the rail. Per block, a
single **Entrance** choice — *Match the page · Rise · Fade · Reveal · None* —
because "this photo should be still" and "this one should make an entrance" are
the two things somebody actually wants. Stored as `style.enter`. No timing
fields, no easing picker, no keyframes.

### E5. Adding a block is a drag, and arrives with content

Dragging a palette entry onto the preview shows an insertion line; dropping
creates the block **with starter content** (spec 24 §5, unbuilt), so the first
thing the planner sees is what the block looks like when full. `@dnd-kit` is
already a dependency and is already the builder's drag mechanism, so this is
reuse. The palette gains the thumbnails §3 row 10 asks for.

### E6. Play without fear

Autosave (spec 24 §6), an **undo toast on delete** instead of `window.confirm`
(a soft delete on the draft: one `deleted_at` column on `site_blocks`, or an
in-memory undo stack — the first survives a refresh, the second is no schema),
and "Saved · just now" in place of the Save button. Spec 24 §8 priced undo as a
piece of work in its own right; it is in this spec because **"plug and play" is
not credible without it**.

### E7. See it as them, on a phone

The `?as=<household>` picker (spec 24 Q4) in the preview toolbar — **and the
preview opens as a real household by default**, labelled as such, because the
greeting, the weekend card and the reply bar exist only there and a default
preview of the shared site would show none of them, a real
**phone toggle** on a narrow editor (spec 24 §3 row 6), and an "Open on my
phone" QR that encodes a household's own link with `?preview=1` so the planner
can scroll their own invitation with their own thumb. That last one is small
and is the closest thing to a proof that the motion feels right.

### E8. An optional writing helper

A "help me say this" affordance on text fields — draft the story paragraph,
the FAQ answers, the dress-code description in the couple's tone from a few
prompts. It is the most *technology-forward* item and the one with the most
conditions: it needs an API key and a cost model; **it must never be sent guest
names, addresses or dietary notes**, only what the planner types into that one
field; and it adds a third party to the planner's workflow (not the guest's —
§4's guest-side no-third-party rule is untouched). Listed so it is a decision
and not an omission; recommended **out** of this spec (§12 question 9).

### E9. Everything is a switch

The rule from §4, made concrete. **Where each switch lives:** *Page* switches
are in the rail's Theme section; *Block* switches are in that block's inspector;
*Per block* is the style area every block already has. **Default** is what a
new or unchanged site gets, which is also what an existing site renders until
somebody touches it — **every new switch's off-by-default or on-by-default
value is chosen so that an existing published site looks the same the day this
ships.**

| Switch | Where | Default | When off |
| --- | --- | --- | --- |
| Greeting (and its wording) | Hero block | On (household pages only) | Names alone; the cover closes up |
| Cover line ("invite you to their wedding") | Hero block | On | Names, then the date |
| Date / Place / "a line about why" | Hero block | On if there is text | Line not drawn |
| Countdown | Hero block | As today | Not drawn |
| Scroll cue (the ↓ on the cover) | Hero block | On | Not drawn |
| Cover hand-over (parallax, deepening scrim) | Page → Motion | By level | Static cover |
| Section arrivals | Page → Motion | By level | Sections simply present |
| Itinerary draws itself | Page → Motion | Cinematic | Line fully drawn |
| Photo arrival (un-crop) | Page → Motion | Cinematic | Plain image |
| Reading line | Page → Motion | Gentle and up | Not drawn |
| Condensing nav | Page → Motion | Gentle and up | Always the condensed form |
| Stagger | Page → Motion | Cinematic | Group arrives together |
| Entrance on one block | Per block | Match the page | That block is still |
| Chapter rail (Editorial) | Page → Layout | As today | Not drawn |
| Section numbers (`04 · ATTIRE`) | Page → Layout | As today | Heading alone |
| Weekend card | Guests' pages | On | Not drawn |
| Calendar button on it | Weekend card | On | Card without the button |
| Sticky reply bar | Page → Layout | On | The form alone, as today |
| Reply-by date inside it | Reply bar | On when a lock date exists | Bar says "Reply" |
| Lightbox | Gallery block, photo blocks | On | Photos are not enlargeable |
| Every block | Block list (already exists) | Visible | Hidden, and renumbers |
| Every block's audience | Block inspector (already exists) | Everyone | As chosen |

**How the motion switches are stored without becoming a settings screen:** the
page's `motion` is a level plus a short list of *overrides*, not eight
independent booleans. The level sets every effect's default; an override turns
one effect off (or on) from there. So "Gentle, but no reading line" is
`{ level: "gentle", off: ["reading_line"] }`, and a new effect added later
ships with a level default and needs no migration of anyone's saved theme.
In the rail this is one control, "How much should it move?", with a "Customise"
disclosure listing the effects as checkboxes — **the three-level control is the
primary thing and the checkboxes are the escape hatch**, so a planner who just
wants it calmer never has to read eight checkboxes.

**What is deliberately not a switch:** the things that are *correctness*, not
decoration. Reduced-motion handling (it follows the guest's system setting, not
the planner's taste), the `@supports` guards, the privacy rules (§4 — the
greeting cannot be forced onto the shared site), and the scrim over a
photograph that makes text legible. A switch that can produce an unreadable or
leaking page is the failure spec 23 §7 named.

## 10. What was considered and not recommended

| Idea | Why not, now |
| --- | --- |
| **Envelope / wax-seal overlay** | A tap standing between a guest and the information, and a lock for no-JS and previewers. The cover (§5) gives the feeling without the lock. Revisit as a `<dialog>` open-by-default (§12 q1) |
| **Autoplay video hero** | A 4MB+ file on mobile data, autoplay quirks on iOS low-power mode, a signed-URL private-bucket video with the §8 expiry problem. A short **muted loop of ≤2MB** is the version that could earn its place; a candidate for a later spec once the photo pipeline exists |
| **WebGL / 3D / Lottie** | Large dependencies for a page whose job is "when, where, will you come". The compositor-only CSS in §6 gets most of the way |
| **Autoplaying music** | Universally disliked; browsers block it anyway. The `playlist` block is the right home for a song |
| **A "share this invitation" button on a household page** | Forwards the credential. A *separate* "tell a friend about the site" on the **shared** page is fine and out of scope here |
| **A weekend companion PWA** (offline schedule and map, add to home screen) | Genuinely useful at a venue with no signal and a real next step. But it caches a personalised page on a device that may be shared, needs a service worker lifecycle that nobody has run, and is a feature, not a polish. Own spec after this one |
| **Per-block colour, font or CSS controls** | The failure mode spec 23 §7 names |
| **A free-form drag canvas** | Spec 23 §3's first decision, and still right: absolute positioning needs a layout per breakpoint |
| **Parallax on every photo** | Cinematic only, and only the cover. Parallax on a long page is where "elegant" turns to "carnival" |

## 11. What it costs, and the budgets it is held to

**Data model**
- **One migration, `0032`:** `site_assets` gains `focal_x`, `focal_y`
  (numeric, nullable), `colour` (text, nullable), and the variant-widths
  convention (D1, D2, D4). The table already carries `wedding_id` and RLS.
  The household note that would have been `0032` is cut (Q3); the numbering
  here assumes nothing else lands first.
- No other schema. Everything else lives where it already lives.
- **Hero block payload** gains `greeting` (boolean), `greeting_text`,
  `cover_line` (+ its switch), and a switch per cover line (E9). These are
  payload keys, not columns: **no migration**, but `BLOCK_SCHEMAS` and
  `BLOCK_FORMS` must list them or the inspector cannot write them and the save
  path rejects them. The greeting is validated server-side — plain text, 80
  characters, known tokens only — in the action, not the form.
- `site_blocks.style` gains `variant` and `enter`. **`styleSchema` is
  `.strict()`** (`actions/site-blocks.ts:44-55`): a key it does not list is
  rejected, so *the build must add the keys to the schema and to `BlockStyle`
  together*, or every save of a styled block fails with "That isn't a style this
  block offers". Same trap in the revision snapshot path (`site-blocks.ts:488+`).
  A test (§14) asserts the two stay in step.
- The theme gains `motion` (`{ level, off[] }` — E9) and (if E3 lands) `vibe`, plus the page-level layout switches (chapter rail, section numbers, reply bar); stored in the existing
  `site_content['theme']` row. `resolveTheme` already "never throws and falls
  back field by field" — the new keys follow that rule, so a theme saved last
  month still renders.

**Budgets** (checked in the browser pass, not asserted here)
- **No new runtime dependency.** If the build wants one, it asks first.
- **Added guest-page JavaScript ≤ ~10KB gzipped** in total across the
  lightbox, the reply bar and the view-transition hook; the scroll motion adds
  none.
- **Added CSS ≤ ~12KB gzipped** across the motion layer and the Looks.
- **Largest contentful paint on a throttled mid-range phone profile no worse
  than today's** — and better on any page with a hero photo, because of D1/D2.
- **Layout shift of 0** from images (aspect ratios reserved).

**Accessibility**
- Every motion has a reduced form (§4); `Still` removes scroll animation
  entirely.
- Focus is never trapped except inside the lightbox `<dialog>`, which closes on
  Escape and restores focus.
- The sticky reply bar must not cover a focused field (use `scroll-padding` and
  test it with the on-screen keyboard open — the classic mobile bug).
- Contrast gates in `theme.test.ts` apply to every new palette/preset
  combination; a Look that puts text on a photograph keeps the scrim rule.

**The things most likely to be undone by accident** (kept here so they get said
once, and so a later session reading this file meets them before editing):
1. The `@supports` guard on every motion's *starting state*.
2. **One renderer.** A Look, a motion and a cover are branches inside
   `render.tsx`/`hero.tsx`, never a second layout for the preview.
3. Container-query units for anything the editor shows in a phone frame
   (HANDOFF session 31, "don't simplify them to Tailwind breakpoints").
4. Effects on mount, from the browser (`ViewLogger`, `ReplyBanner`) — never
   during the server render.
5. Nothing personal on the shared page or in any metadata.

## 12. Open questions

**All eleven answered 2026-10-05 — see "Answered" at the top of this file.**
The three spec 24 answers marked "to confirm" there are the only things still
open, and none of them blocks steps 1–3.

## 13. Related, and not in this spec

You said earlier "I want to work on the invites section" and gave two examples:
the hero photo (fixed — see below) and making invites *easy to use*. This spec
is the design half. **How an invitation is *sent and chased*** — copy link,
the WhatsApp message, the bulk email, a "send me the three households who
haven't opened it" view, a reply reminder — is a different set of screens
(`/invitations`) with a different set of questions, and the save-the-date
column built in session 31 is the model for it. It deserves its own spec
(**28**) rather than half a section here. If you want it, say so and it is next.

**The hero photo bug** was fixed and pushed on
`claude/fix-hero-photo-preview` before this spec: `SiteHero` dropped signed
URLs because it only accepted same-origin paths. It is unmerged and unopened in
a browser; this spec's §5 rebuilds the same component, so merging that first
avoids a conflict.

## 14. Test plan

The pure parts are most of what this adds, and all are unit-testable:

- **The Look registry is total.** Every `(block type, variant)` the catalogue
  offers has a label, a thumbnail source and a renderer branch; adding one
  without the others fails the test. Same discipline as the style label map in
  spec 24 §9.
- **`styleSchema` accepts exactly what `BlockStyle` declares** — and a revision
  snapshot round-trips every variant and `enter` value.
- **`resolveTheme` never throws on a theme saved before `motion` existed**, and
  falls back field by field.
- **The greeting:** `listNames` over one, two, three and zero first names, a
  household of one adult, non-Latin names. **The template renderer:** every
  token on its own and combined; no token; an unknown token is rejected, not
  rendered; a household with no named guests falls back to `{household}`; more
  than five names falls back; a template that renders empty hides the greeting;
  HTML in the template is rendered as text; 81 characters is refused.
- **Every switch (E9) is in a registry** carrying its label, location and
  default, and the test is total over it: for each switch, render the block or
  page with it off and assert the markup contains no element it owns and no
  empty wrapper where it was. Adding an effect without registering its switch
  fails the build. Also asserts **no switch's default changes what an existing
  published site renders** — the "looks the same the day this ships" rule.
- **The motion model:** `{level, off[]}` resolves every effect, an unknown
  effect in `off` is ignored rather than throwing, and a theme saved before
  `motion` existed resolves to Gentle.
- **The weekend `.ics`:** event times in the wedding's timezone, an all-day
  event, DST boundaries, a household invited to one event of three (spec 22's
  `v_guest_event_invites` is the source of truth).
- **`srcset` and `sizes` builders; the focal-point clamp** (0–1, NaN, absent).
- **The motion level resolver:** `still` emits no animation class at all;
  unknown values fall back to `gentle`.
- **SQL** (`supabase/tests/`): `site_assets` focal/colour constraints
  (0–1 range, nullable), and that the second account can neither read nor
  write the first's values.

**Then, for the first time in this feature's life, look at it.** `npm run
typecheck`, `npm test`, `./scripts/verify-migrations.sh`, `npm run build` — and
a Chromium pass in this sandbox using the session-31 technique: a throwaway
page rendering the real components from sample data, screenshotted at scroll
offsets 0 / 25 / 50 / 75 / 100% at 390px and 1440px, once per motion level.
That verifies *what the CSS does*. It does not verify Supabase, signed URLs or
anything a real phone's compositor does, and the handoff for the build must say
so in those words.

**The measure that matters is already in the database.** `invitation_views` and
`v_household_rsvp` give *sent → opened → replied* per household. If this spec
works, the "Opened, but nothing back yet" count on `/invitations` shrinks and
time-to-reply falls. That is a better verdict than any screenshot, and it is
available from the first real wedding that uses it.

## 15. Build order, if it is authorized

Each step ships alone, each ends with the Chromium pass, and the first three
are the version of this spec that delivers most of the feeling for the least
risk. If the whole thing is too much, **stop after step 4**.

0. **Prerequisites.** Merge the hero fix. Spec 24 §4–§7 (preview keeps its
   place, starter content, autosave, labels), per Q10 and the table above.
1. **Foundations.** Easing tokens, `data-motion`, the motion level on the
   theme, the `@supports` pattern for every animation, reduced forms. Chapter
   arrivals (three kinds), the reading hairline, hover/press. No schema.
2. **Photographs.** D1 (variants, new uploads), D2 (placeholder, reserved
   ratio), D3 (the URL route, with the 24h stopgap first), D5 (lightbox).
   `0032`. *This is the
   step a guest on a phone notices most and it is the least glamorous.*
3. **The arrival.** The cover (§5), the cover hand-over, the nav condensing,
   focal point (D4).
4. **Personal.** Greeting, the weekend card and its `.ics`, the sticky reply
   bar and the confirmation. (The household note is cut — Q3.)
   — *the cut line —*
5. **Looks** (E1) for the first blocks, and the itinerary draw (§6).
6. **The editor:** click-to-edit and the return channel (E2), drop-to-add (E5),
   undo (E6), preview-as-household and the phone toggle (E7).
7. **Templates and Vibes** (E3), per-block entrance (E4), the dark "Evening"
   preset (Q5).

## 16. Done when

- A household's link opens on a phone to a cover addressed to them by name,
  and the weekend's events, their reply and their calendar file are each one
  thumb-reach away.
- The page is correct, complete and readable with JavaScript off, with reduced
  motion on, and in a browser that supports none of the scroll features.
- A planner can change a block's Look, restyle the whole site with a Vibe,
  click anything in the preview to edit it, and undo a delete — without ever
  seeing a field named after a CSS property or a payload key.
- Every number in the budgets in §11 has been measured, or the handoff says it
  has not.
- **The handoff says which claims were *looked at* (a screenshot at a stated
  width and scroll offset) and which were only typechecked and built.** This
  repo has been burned by that distinction before.

---

## Build status — 2026-10-05

**Steps 0 to 7 are built.** `npx tsc --noEmit`, `npm test` (852), 
`./scripts/verify-migrations.sh` (455 assertions, up from 444) and
`npm run build` pass. **None of that is the claim "it works against a real
project"**: no part of this has run against a live Supabase project, a real
phone, or a real photograph. What was looked at is listed under *Looked at*,
and what was not under *Never looked at*.

### Done

| Step | What exists | Where |
| --- | --- | --- |
| 0 | Hero photo shows in the preview (the reported bug). Autosave in the inspector, starter content when a block is added, plain-English style controls, the preview keeping its place across edits; the zod schemas moved out of the `"use server"` file so tests can reach them | `block-schemas.ts`, `starter.ts`, `style-labels.ts`, `use-autosave.ts`, `builder.tsx`, `block-inspector.tsx` |
| 1 | Motion layer: easing/duration tokens, `data-motion` + `data-fx` on the page root, theme `motion {level, off[], on[]}` and `layout` switches, seven effects (cover hand-over, itinerary draw, section arrivals, reading line, nav condense, photo arrival, stagger), the switch registry, and the rail's Motion and Page sections | `motion.ts`, `switches.ts`, `globals.css`, `reading-line.tsx`, `stagger.ts`, `rail.tsx` |
| 2 | Photographs: three sizes from one browser decode, average colour, focal point, `/api/photo/<id>` stable redirect (planner session, or published/approved only), 24h signed-URL TTL, `SiteImage` with a reserved aspect ratio, a native `<dialog>` lightbox | **`0032_site_asset_images.sql`**, `supabase/tests/15_site_asset_images.sql`, `encode-image.ts`, `site-image.ts`, `photo-access.ts`, `/api/photo/[id]`, `site-image.tsx`, `photo-viewer.tsx` |
| 3 | The cover: the household's name set large, a greeting they can word (`{names}` / `{household}`), every cover line its own switch, tall cover, scroll cue, the hand-over, the focal-point picker, "Previewing as" a real household | `greeting.ts`, `cover.ts`, `hero.tsx`, `photo-picker.tsx` |
| 4 | Personal: the weekend as one `.ics` (credentialed by the household's address segment, no new token), add-to-Google, a sticky reply bar, a reply that remembers and answers back, a view-transition helper | `ics.ts`, `weekend.ts`, `/api/public/weekend/[slug]/[household]`, `reply-state.ts`, `reply-bar.tsx`, `view-transition.ts` |
| 5 | Looks: hero ×4, weekend ×3, story ×3, gallery ×3, RSVP ×2 (the §E1 table's own count); a per-block entrance; the itinerary draw | `looks.ts`, `look-glyph.tsx`, `content.tsx`, `invited-events.tsx`, `gallery.tsx`, `rsvp-form.tsx` |
| 6 | The editor: click the preview to select, hover/selected outlines, scroll-to, undo for delete (hide, then delete after 8s), drag a block from the palette onto the preview with an insertion line | `preview-bridge.tsx`, `preview-messages.ts`, `builder.tsx` |
| 7 | Evening (a dark Editorial-family preset), Midnight and Ember palettes, `data-site-tone`, four Vibes, three templates on the empty builder, Vibe undo | `presets.ts`, `vibes.ts`, `src/server/site/vibes.ts`, `site-vibes.ts` |

### Where it departs from the text above

1. **Look thumbnails are schematic.** §E1 asks for thumbnails rendered from the
   planner's own content. `look-glyph.tsx` draws shape miniatures instead; the
   live preview re-renders with their real words when one is picked. A test
   asserts every registered Look has a miniature.
2. **RSVP has two Looks and the hero four**, as the §E1 table lists them — not
   "three each" as Q4's shorthand says. The hero's fourth, *Type only*, is what
   a hero with no photograph falls back to.
3. **A Vibe is not stored.** §11 allowed a `vibe` key on the theme; there is
   none. A Vibe is *applied* (theme, palette, motion, each block's Look) and
   the rail marks the one whose preset and palette match. Undo restores a
   snapshot held in the browser for 12 seconds — **it does not survive a
   reload**; the draft history (revisions) is the long-term undo, as it
   already was.
4. **Templates are the three starter layouts plus a Vibe**, not new block sets:
   Garden party → `classic`, Modern → `photo_led`, Evening → `short`.
5. **Hover/press is on guest-site buttons only.** The §6 table says "buttons
   and rows"; rows (event, FAQ) have no press state.
6. **The save-the-date shares only what Q11 said**: its `std-rise` now uses the
   shared `--ease-out`, and a site on *Still* no longer plays the rise. It
   keeps its own layout system.
7. **Photo placeholder is preview-only.** In the builder, a photo block with no
   photograph draws a placeholder; on the guest page it draws nothing, as before.
8. **The household note is cut (Q3), so `0032` is the photo columns.** Nothing
   reads `households.notes` anywhere new.
9. **Dark palettes put `ink` = light and `paper` = dark**, so every component
   reading the tokens inverts for free and `validatePalette` checks the same
   four pairs. Text *on a photograph* and its scrim are the one exception —
   fixed colours (`onphoto`, `scrim`) — because `text-paper` over a photo goes
   dark-on-dark in a dark palette.
10. **Spec 24's "to confirm" answers** (Answered, Q10 table) are still
    unconfirmed by the planner; steps built on them took the stated reading.

### Looked at, in this sandbox's Chromium, on a throwaway harness

Hero photo and its placeholder; the builder rail and inspector at 1400px; the
preview bridge (click-to-select, scroll-to, links ignored); computed styles for
every motion at each level, with reduced motion, and with a per-effect override;
the lightbox; the cover in Editorial and Script; every Look; the weekend panel;
the reply bar's visibility and the reply flow (server action **mocked**);
per-block entrance; undo and the deferred delete; drop-to-add and its insertion
line; Evening, Midnight, Script on Ember; the Vibes section, its undo toast and
the empty-builder templates (server actions **mocked**).

### Never looked at

- **Anything against a live Supabase project:** `0032` has not been applied to
  one; signed URLs and their 24h lifetime; uploads with variants; `/api/photo/<id>`
  with a real session or a real published revision; the `.ics` route; saving,
  publishing, applying a Vibe, or restoring one (the SQL paths in
  `src/server/site/vibes.ts` have never executed — only its pure helpers have
  tests).
- **A real phone.** The sticky reply bar with the on-screen keyboard open; the
  lightbox's swipe; scroll-driven motion on a real compositor; a browser
  without `animation-timeline` (the guards are `@supports`, untested in one).
- **The full screenshot matrix §14 asks for** (0/25/50/75/100% scroll × 390 and
  1440px × each motion level). What was looked at is the list above.
- **Largest contentful paint and layout shift** (§11): no throttled profile
  was run and there are no real photographs to run it against.
- Dark Evening printed; the Midnight palette on a household page with real
  photos.

### Budgets (§11)

| Budget | Measured | |
| --- | --- | --- |
| Added guest-page JS ≤ ~10KB gz | **+7 kB** first-load on `/w/[slug]` and on the household page (121→128 kB, 122→129 kB, from `next build` before and after); shared chunks 102→103 kB | within |
| Added CSS ≤ ~12KB gz | **+3.4 kB** (9,814 → 13,177 bytes, `gzip -9` of the compiled sheet; includes the planner app's) | within |
| No new runtime dependency | none added | met |
| LCP no worse than today's | not measured | **unknown** |
| Layout shift of 0 from images | aspect ratios reserved by `SiteImage`; not measured | **unverified** |

### To do next

Apply `0032` to the live project, then open `/site` and a household link **on a
phone** — that is the check this build can't make. The likeliest places for
something to be wrong are the ones nobody has seen: signed URLs behind
`/api/photo`, what a half-set focal point does to a saved block, and the
`.ics` on a real calendar app.
