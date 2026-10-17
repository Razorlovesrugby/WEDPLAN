# Feature spec: "Our story" as a stack of polaroids

**Status: proposed (2026-10-17). Not built.** Written from the planner's own
write-up of an Instagram reel (a competitor's "Our Story" card stack; the reel
itself was unreachable from this session, so nothing here is read off the
video). Nothing in this spec is authorised to build until §9's questions are
answered and the planner says to build it (`CLAUDE.md`, "Spec requests are not
build authorization").

**Depends on:** spec 14 (the `story` block), spec 23 (blocks and the builder),
spec 27 (Looks, photo sizes and focal points, motion levels, `/api/photo/<id>`),
spec 28 §7 (reorderable repeating rows). All built; none of `0026`–`0037` is
applied to the live project (`docs/HANDOFF.md`).

## 1. What was asked

A pile of polaroid-style photos, one per relationship milestone. The guest taps
or swipes the top photo; it is tossed off the pile with a slide-and-rotate, the
next one is revealed, and the chapter heading, chapter text and photo caption
change with it. Reaching the end loops back to the start. Keyboard and
screen-reader support, reduced motion respected, no layout shift, side-by-side
on desktop and stacked on a phone. The planner's write-up also carries a CMS
data contract, a state diagram, a debounce rule, edge-case rules, performance
targets and a telemetry matrix; §3 says what of those survives contact with
this codebase.

## 2. What is already there (read off the source)

Most of it. **This is a fourth Look on the existing block, not a new block.**

| Asked for | Already in the code | Gap |
| --- | --- | --- |
| A story section the couple configures | `story` block (`src/lib/site/blocks.ts:227`), payload `{ intro, body, milestones[] }` (`block-schemas.ts:117`) | — |
| Chapters in order | `milestones[]` of `{ date, title, body }`, max 20, reorderable in the editor (spec 28 §7) | — |
| A photo and caption per chapter | Spec 14 §4's table promised `image_id` on a milestone; **the zod schema never got it** | Add `image_id`, `image_alt`, `caption` to a milestone |
| Alternate presentations | Looks: `prose` · `milestones` · `magazine` (`src/lib/site/looks.ts:50`), chosen in the inspector, stored as `style.variant` | Add `polaroids` |
| WebP, sized copies, preloading | Every upload re-encoded to WebP at 480 / 960 / 2000 px (`src/lib/site/assets.ts`), served via `/api/photo/<id>`, `SiteImage` with `srcset` | — |
| Cropping to a 4:5 frame | Focal point per photo (spec 27 D1, `photo-picker.tsx`) | — |
| Reduced motion | `prefers-reduced-motion` handled in `globals.css`; the planner's Still / Gentle / Cinematic level (`src/lib/site/motion.ts`) | Decide what Still does to the toss (Q4) |
| Fallback colour on a failed image | Theme palette tokens | — |

So: **one payload extension (JSONB, no migration), one Look, one client
component, and three fields per milestone in the editor.**

## 3. The planner's write-up, against this codebase

Kept, in substance:

- Tap/click, swipe, Enter / Space / → to advance; an `aria-live="polite"` region
  announcing the chapter title. **Plus ← and a visible Previous button**: the
  write-up's "reverse navigation" edge requirement, promoted to normal.
- Animate only `transform` and `opacity`; small fixed tilts per card.
- 4:5 frame with explicit dimensions; zero layout shift.
- Loop at the end (Q2 picks how it reads).
- Fewer than two chapters with photos: a still polaroid, no interaction.
- Failed image: the frame stays, tinted from the **site's palette** (not a
  hardcoded `#ECE7E1`, which would be wrong on the Evening preset), caption
  intact.
- Side-by-side from `lg` (1024 px), one column below.

Replaced, because the codebase already answers it more simply:

| Write-up | Here | Why |
| --- | --- | --- |
| `section_id`, `chapter_id`, `order_index` | Array position in `milestones[]` | The block is the section; the array is the order. An index field is a second source of truth that can disagree with the first. |
| `media_url`, `thumbnail_url` | `image_id` → `/api/photo/<id>` with `srcset` | Storage paths are derived server-side from checked ids, never stored (`assets.ts`). A stored URL is the thing that rule exists to prevent. |
| `base_rotation_deg` per photo | Derived from the index (e.g. −2.5°, 1.8°, −1°, 2.2°, repeating) | Looks are "pick it and it works, never write CSS" (spec 27 E1). A rotation field is CSS in a form. |
| "chapter one: how we met" as a stored label | "Chapter one" computed from position + the milestone's existing `title` | Reorder the chapters and the numbers follow. The optional `date` shows beside it. |
| AVIF as well as WebP | WebP only | Every image is already WebP; a second format doubles storage for a marginal saving. |
| IntersectionObserver preloading of cards 0–2 | Cards 0–2 `loading="eager"` with the 960 px source; the rest `loading="lazy"` | The browser already does this; no observer code to own. |
| `min-height: 220px` on the text | Every chapter's text rendered into the **same grid cell**, only the active one visible | The cell is as tall as the longest chapter, so switching can never shift the page, whatever the couple writes. A fixed 220 px clips a long chapter or leaves a gap under a short one. |
| `isAnimating` lock, 350–400 ms, clicks discarded | Input during a toss **queues one** advance, finishing the current card fast | Discarded taps feel broken on a phone; a guest tapping twice means "next, next". |
| Swipe down for previous | Not recommended | It fights page scroll. Previous is a button and ←; swipe is horizontal only, with `touch-action: pan-y` so vertical scrolling is never captured. |
| Cap of 8 (or 10 — the write-up says both) | No separate cap. Only the top three cards are painted; the rest are `visibility: hidden` until they reach the top three | The schema already caps milestones at 20. Painting three cards keeps any phone at 60 fps whatever the count, which is what the cap was for. |
| Telemetry matrix (`story_section_viewed`, `story_card_dismissed`, completion, RSVP attribution) | **Not recommended** (Q5) | There is no client analytics anywhere on the guest site, deliberately: `ViewLogger` records one fact, that a household opened its page. Card-level events need a new table, an anonymous write path, and a privacy line on a wedding site. They would measure "dwell time", a KPI for the competitor selling the product, not for the couple. |

## 4. The experience

**Guest, phone.** Under "Our story" the intro line, then the polaroid: a white
frame with the photo cropped 4:5 at its focal point, the caption handwritten-
style beneath it, two more cards peeking out behind at their own tilts. Below
the pile: "Chapter one · 2016", the milestone's title, its body. A small
"1 / 5" with ‹ › buttons. Tap the photo or swipe either way: the card follows
the finger, flies off in the swipe's direction with a spin, slides to the back
of the pile; the next card straightens and lifts; the text below cross-fades.
On the last card the counter reads "5 / 5 · Start again ↺" and the next tap
reshuffles to chapter one.

**Guest, desktop.** The same, the pile on the left and the chapter on the right,
vertically centred; a slight lift and pointer cursor on hover.

**Couple.** In the inspector, the Our story block's Look picker gains
**Polaroids**. Each milestone row gains a photo (the existing picker, with its
focal point), a caption, and alt text. If the Look is Polaroids and some
milestones have no photo, the inspector says so ("2 chapters have no photo —
they'll show as a plain card with the caption") rather than skipping them.

**Without JavaScript / printed.** The server renders chapter one, its photo and
text, with the controls. Hydration adds the rest. Printing (`@media print`)
lays every chapter out flat as the Prose look does.

## 5. Changes

### 5.1 Payload (no migration)

```ts
// block-schemas.ts — story.milestones[]
z.object({
  date: optionalText,
  title: trimmed.min(1).max(200),
  body: optionalText,
  image_id: uuid.optional(),   // new
  image_alt: optionalText,     // new
  caption: optionalText,       // new — under the photo; max ~80
})
```

Additive; every saved block still parses. The publish-time photo-ownership
check that `photo_band` / `page_break` go through must cover the new
`image_id`s too (`photo-access.ts`).

### 5.2 The Look

`looks.ts`: `{ id: "polaroids", label: "Polaroids", description: "A pile of
photographs to flip through, one per chapter." }`, plus a glyph in
`look-glyph.tsx`. `Story` in `content.tsx` gains the branch; like the other
Looks it **falls back** — fewer than two milestones means the Prose look.

### 5.3 The component

`src/components/site/polaroid-stack.tsx` (client). Pointer events for drag,
CSS transitions for the toss; no animation library. State is one index plus
an in-flight flag. Pure pieces in `src/lib/site/polaroids.ts`, unit-tested:
rotation for an index, which cards are painted for an index and count, next /
previous with wrap, the swipe decision (distance > 30% of width **or** velocity
> 0.5 px/ms, and horizontal more than vertical).

### 5.4 Motion

| Setting | Behaviour |
| --- | --- |
| Gentle / Cinematic | The toss as described |
| Still (Q4) | Recommended: still a pile, but the top card cross-fades rather than flies |
| `prefers-reduced-motion` | Cross-fade, always — the guest's setting beats the planner's |

Cards remain tappable and buttons work under every setting; only the movement
changes.

### 5.5 Budget

The guest-page JS grew 7 kB gz in spec 27. This should add **under 2 kB gz**;
it ships only on pages whose story block uses the Look (dynamic import).

## 6. Accessibility

- The pile is a `role="group"` with `aria-roledescription="photo stack"` and a
  label ("Our story, chapter 2 of 5"); it is focusable. Enter / Space / → next,
  ← previous.
- Previous / Next are real `<button>`s with labels, not just icons — tapping the
  photo is not discoverable for everyone, and the buttons are what a switch
  user or screen-reader user will use.
- One `aria-live="polite"` region announces "Chapter 2 of 5: Falling in love".
  Each photo carries its alt; hidden cards are `aria-hidden`.
- Focus stays on the pile while advancing.

## 7. Edge cases

| Case | Behaviour |
| --- | --- |
| 0 milestones | Prose look (just `body`) |
| 1 milestone | One still polaroid, no controls, default cursor |
| A milestone without a photo | A plain palette-tinted card with the caption (or title) set large |
| Long body | The shared grid cell grows to fit it; nothing shifts on change |
| A photo deleted after publishing | Same as a failed load: tinted frame, caption intact |
| Width style "narrow" | Never side-by-side; there isn't room |
| `intro` / `body` | Intro above the pile; `body` (Q3) |
| In the editor preview | Works as on the live page; clicking the photo **advances** rather than selecting the block (the block has a frame to click for that, spec 27) |

## 8. Considered and not recommended

- **Analytics** — §3, Q5.
- **Per-card rotation, colour or frame controls** — Looks don't take CSS.
- **Autoplay** — a pile that moves on its own steals the reading pace from the
  guest and is a WCAG 2.2.2 problem.
- **A new block type** — two "story" blocks would split the couple's content,
  and the Look picker already exists for this.
- **3D perspective flips** — `translate3d` + `rotate` is enough for the depth
  shown; real perspective adds GPU cost on older phones for little.

## 9. Open questions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Should the photos added to milestones also appear in the **other** story Looks (a small photo beside each milestone in Prose / Milestones)? | No, not in this spec — keeps it to one Look. Easy follow-up. |
| 2 | At the end: loop straight to chapter one, or show a "Start again ↺" card/cue first? | The cue on the last card's counter, then loop on the next tap. |
| 3 | Where does the story's long `body` go in this Look? | Above the pile with the intro, as a paragraph. If it's long, the planner can move it into a chapter. |
| 4 | Under the planner's **Still** motion level, does the pile still toss? | No — cross-fade, same as reduced motion. Still has meant "no movement" everywhere else. |
| 5 | Any engagement tracking (the write-up's telemetry matrix)? | None (§3). If wanted later, the most it should be is one "reached the last chapter" count per household on the guest list. |
| 6 | Should swiping **right** go back (like a photo viewer) or also forward (like tossing a card, as in the reel)? | Either direction tosses forward; back is the button and ←. Matches the reel, and a toss is a toss. |
| 7 | Caption style: the site's body font in italic, or a handwritten face? | Body italic. A script face is a new font file on every guest page for one line of text. |

## 10. Shape of the build (once answered)

1. Schema: three milestone fields, the photo-access check, tests.
2. `src/lib/site/polaroids.ts` + unit tests.
3. `PolaroidStack` component, the Look, the glyph, the fallbacks.
4. Editor: photo / caption / alt on milestone rows; the "no photo" note.
5. Motion and reduced-motion; print styles.
6. Look at it: sandbox Chromium on a harness at 390 px and 1280 px, with
   touch emulation, keyboard only, and a screen reader's accessibility tree.

## 11. Test plan

- Unit: rotation determinism, painted-card window, wrap, swipe threshold,
  schema accepts old and new milestones.
- `npm run typecheck`, `npm test`, `npm run build`. No migration, so
  `verify-migrations.sh` is unaffected.
- Browser (sandbox Chromium): no layout shift across all chapters (Performance
  panel CLS), vertical scroll unaffected by a vertical drag on the card,
  keyboard path, reduced-motion emulation.
- **Not verifiable from a sandbox:** 60 fps on an iPhone 11 or a mid-range
  Android, and real in-app browsers (Instagram, Messenger) where guests will
  open the link. Those need the planner's phone.
