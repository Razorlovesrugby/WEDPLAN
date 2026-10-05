# Spec 27 — The invitation as an experience, and an editor you can play with

**Status: proposed, not built.** Nothing in this document is authorization to
write code. Per [`docs/specs/README.md`](README.md) and `CLAUDE.md`, nothing
beyond this file is built until the §12 open questions have answers **and**
you say to build it, in words that mean "write code".

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
                For Chidi, Ada and Zara          ← listNames(first names)
                                                   (spec 22's helper exists)
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
- Reads the existing hero payload; adds optional `cover_line` ("invite you to
  their wedding" is the default) to the hero block's fields. No new block.

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

**A motion level, not a motion editor.** The planner gets one control, "How
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
2. **A note from the couple, to them.** "Nana — we've saved you the seat by
   the window." One short text per household, written on the household's page
   in Guests, rendered in the cover or just beneath it, in the couple's voice
   (the display face, italic). **This needs a migration** (`0032`, one nullable
   column) and is therefore the one schema change in the spec — see below and
   §12 question 3. It is the single most *personal* thing on this list and the
   cheapest to build.
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

**What must not happen.** The household note and the greeting render only when
`ctx.personal` is set. They never render in the shared site, in Open Graph
metadata, in the print stylesheet's *shared* output, or in `generateMetadata`'s
description — the household link's preview already names only the couple and
the date (`page.tsx:44-51`), and that discipline is the privacy model. The note
is guest-facing text the planner writes, so it needs a length limit and the
same plain-text rendering every other free text on this site gets (no HTML).

**The migration, so it is reviewable now.** One column on `households`:
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

The `?as=<household>` picker (spec 24 Q4) in the preview toolbar, a real
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
- `households.couple_note` — one nullable text column, `0032`. The only
  migration. Everything else lives where it already lives.
- `site_assets`: `focal_x`, `focal_y` (numeric, nullable), `colour` (text,
  nullable), and the variant widths convention. **A second small migration
  (`0033`)** if D2/D4 are in. Both are on a table that already carries
  `wedding_id` and RLS.
- `site_blocks.style` gains `variant` and `enter`. **`styleSchema` is
  `.strict()`** (`actions/site-blocks.ts:44-55`): a key it does not list is
  rejected, so *the build must add the keys to the schema and to `BlockStyle`
  together*, or every save of a styled block fails with "That isn't a style this
  block offers". Same trap in the revision snapshot path (`site-blocks.ts:488+`).
  A test (§14) asserts the two stay in step.
- The theme gains `motion` and (if E3 lands) `vibe`; stored in the existing
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

Nothing is built until these have answers.

| # | Question | Proposal | Why it is yours |
| --- | --- | --- | --- |
| 1 | **Opening: cover (§5), `<dialog>` envelope, or neither?** | Cover. Revisit the envelope after you have scrolled the cover | It is the single most visible taste call, and the lock-in-no-JS cost of the envelope is real but not obvious |
| 2 | **Default motion level, and are three levels right?** | Gentle by default; Still / Gentle / Cinematic | It is *your* guests' device mix and your sense of "fun" vs "calm" |
| 3 | **The household note: yes, and authored where?** | Yes. A field on the household page in Guests (beside the address panel) | A new column and a new thing a planner must write 80 times — or leave blank, and the page should look finished either way |
| 4 | **Which blocks get Looks first, and how many?** | Hero, The weekend, Our story, Gallery, RSVP — three each | Fifteen designs is a lot; you may want five Looks on two blocks instead |
| 5 | **A third theme preset (a dark "Evening")?** | Yes, one | It is a new face on every guest's phone |
| 6 | **Click-to-edit in the preview (E2): in?** | Yes — it is the centrepiece | It needs the return channel spec 24 deferred as "several times the work of everything else"; I think it is the item that most changes how the builder feels, but it is the riskiest to ship |
| 7 | **Photos: new uploads only, or backfill existing ones?** | New uploads get variants; existing photos re-encode only on re-upload | A backfill needs a server-side image library this repo does not have |
| 8 | **Expiring photo URLs: 24h TTL, or the redirect route?** | The route, with the TTL raised as a stopgap | The route is more work; the TTL alone is an afternoon |
| 9 | **The writing helper (E8): in or out?** | Out of this spec | Third party, API key, cost, and a privacy line to hold |
| 10 | **Spec 24 (the builder's editing feel): fold it in?** | Yes — treat its §4–§7 as step 0 here and answer its five questions in the same reply | It overlaps heavily (autosave, preview scroll, starter content, labels, phone), and building two specs' worth of editor separately would mean touching `builder.tsx` twice |
| 11 | **Does the save-the-date adopt the same motion and arrival?** | Share the *tokens* (easing, motion level) only; keep its own `std-*` layout system | It already has its own animation and a deliberate container-query design; unifying the layout would be a rewrite of something that works |

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
  household of one adult, non-Latin names.
- **The weekend `.ics`:** event times in the wedding's timezone, an all-day
  event, DST boundaries, a household invited to one event of three (spec 22's
  `v_guest_event_invites` is the source of truth).
- **`srcset` and `sizes` builders; the focal-point clamp** (0–1, NaN, absent).
- **The motion level resolver:** `still` emits no animation class at all;
  unknown values fall back to `gentle`.
- **SQL** (`supabase/tests/`): the `couple_note` column is unreadable and
  unwritable from the second account; a household with no note renders no note;
  `site_assets` focal/colour constraints.

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
   place, starter content, autosave, labels) per question 10.
1. **Foundations.** Easing tokens, `data-motion`, the motion level on the
   theme, the `@supports` pattern for every animation, reduced forms. Chapter
   arrivals (three kinds), the reading hairline, hover/press. No schema.
2. **Photographs.** D1 (variants, new uploads), D2 (placeholder, reserved
   ratio), D3 (the URL fix), D5 (lightbox). `0033` if D2 is in. *This is the
   step a guest on a phone notices most and it is the least glamorous.*
3. **The arrival.** The cover (§5), the cover hand-over, the nav condensing,
   focal point (D4).
4. **Personal.** Greeting, household note (`0032`), the weekend card and its
   `.ics`, the sticky reply bar and the confirmation.
   — *the cut line —*
5. **Looks** (E1) for the first blocks, and the itinerary draw (§6).
6. **The editor:** click-to-edit and the return channel (E2), drop-to-add (E5),
   undo (E6), preview-as-household and the phone toggle (E7).
7. **Templates and Vibes** (E3), per-block entrance (E4), a third preset.

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
