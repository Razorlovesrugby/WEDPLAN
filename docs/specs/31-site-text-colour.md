# Feature spec: Changing the text colour on the invitation website

**Status: proposed (2026-10-11) — asked for as a spec. Nothing is built.** Per
`docs/specs/README.md` and `CLAUDE.md`, answering the questions in §6 is content
for this file, not authorisation to build; the build starts when the planner
says to build it.

## Added — 2026-10-11 (planner's follow-up)

*"I want also a toggle to match the same across all the sections and then each
block can have different if needed, especially with the ability to add pictures
as backgrounds."*

This reverses two of the original recommendations (**Q1** was "one colour is
enough to start", **Q6** was "site-wide only, no per-block") and pulls the
photograph question (**Q4**) back in, because a block with a picture behind it is
exactly where a different text colour is needed. §3.7 is the new design; §3.4,
§5, §6 and §7 are updated to match. §3.1–§3.3 (the site-wide half) stand.

**Depends on:** spec 14 §5 (themes and palettes), spec 24/30 (the rail — theme,
palette, typography), spec 23 (block styles), spec 29/14 §12.1 (the
save-the-date, which has its own palette setting). All built. This spec needs
**no migration** as proposed (§3.5) — confirm against `0025` and the theme
writer before saying so in a build status.

## 1. What was asked

*"Can we write a spec to be able to change the color of the text on the invites
website."*

Nothing more was said, so the first job of this spec is to say what "the text"
can mean here, because today the answer is "no, not directly" — and the nearest
thing that exists is much bigger than what was asked.

## 2. What the code does today (read off the source)

- **A site's colours are five tokens, chosen as a set.** `PaletteTokens` in
  `src/lib/theme/contrast.ts` is `ink`, `paper`, `muted`, `line`, `accent`. The
  planner picks one of eight curated palettes (Ivory, Sage, Dusk, Claret, Slate,
  Ink, Midnight, Ember) from the rail (`src/components/site/editor/rail.tsx`).
  Text is **`ink`** (headings and body), **`muted`** (times, captions, help
  text) and **`accent`** (links, and the fill of buttons).
- **There is no way to change just the text.** The only way to move `ink` is to
  pick a different palette, which moves the page's background and everything else
  with it. A `custom` palette (all five hex values) still renders if a wedding
  already has one saved, but **the rail dropped the custom-hex editor** in
  session 30 on purpose (HANDOFF: `validatePalette` is the thing standing between
  a planner and a page a guest cannot read in a car park). It is still reachable
  only at `/site/theme`, which `/site` no longer links to.
- **Every colour pair that is text is gated.** `validatePalette` blocks a save if
  `ink`, `muted` or `accent` on `paper` is under 4.5:1 (WCAG body text), or if
  `paper` on `accent` is, because a button's label is also `paper`. `line` on
  `paper` is advisory only.
- **`ink` is not only text.** In the site's components it is `text-ink` 56 times
  but also `bg-ink` / `border-ink` / `ring-ink` 26 times — selected reply buttons,
  the filled button, rules at partial opacity (`rgb(var(--site-ink) / 0.25)` in
  `globals.css`). **So "change ink" changes more than text**, and a planner who
  wanted slightly warmer writing would get differently coloured buttons and
  borders too. This is the one real design decision in the spec (§3.1).
- **Text over a photograph is a separate system.** On a Photograph background
  the words use the fixed `onphoto` colour (`tailwind.config`, a cream), never
  `text-ink` — HANDOFF session 33: *"text on a photograph uses the fixed
  `onphoto`/`scrim` colours, never `text-paper`/`bg-ink`"*. Spec 30 then made the
  photo untouched by default with four "Text over photo" treatments. A site-wide
  text colour therefore **does not reach words over a photo**, and that has to be
  said to the planner or it will look like a bug (§3.4).
- **The save-the-date has its own palette** ("match site" or one of the six —
  session 31) and its own renderer (`card.tsx`, `.std-*`). It reads the same
  tokens but chooses them separately, so a site-wide change does not
  automatically reach it.
- **The dark palettes invert the roles.** In Midnight and Ember, `ink` is the
  *light* colour and `paper` the dark one. "A darker text" means the opposite
  thing on those, so the control cannot be worded as "lighter / darker".

## 3. Proposal

### 3.1 The shape: a text-colour override on the theme, not a sixth token

Add an optional override to the stored theme — `site_content['theme'].payload`
gains `text_colours: { ink?: string; muted?: string; accent?: string }` — and
`themeTokens()` merges it over the chosen palette. Absent means "use the
palette's own", so **every existing site renders exactly as it did** and no
backfill is needed.

Two ways to treat the `ink` problem in §2 (this is Q2):

- **(a) Override `ink` as it is.** Smallest change, and it keeps `ink` meaning
  "the dark colour on this site". Buttons, selected states and borders follow it.
  For most choices — a deep green instead of near-black — that looks intended;
  for a pale or pastel text colour it would make a filled button pale.
- **(b) Add a `text` token used by text only**, defaulting to `ink`, and move the
  56 `text-ink` usages (and the `body` colour) onto it. Buttons and rules keep
  `ink`. Cleaner result and the honest meaning of the request, at the cost of a
  token added to the palette type, to `contrast.ts`, the Tailwind config, the CSS
  variables and a sweep of components — and a new thing every future component
  must remember to use.

**Recommendation: (b), but only for headings and body text, not for buttons or
rules.** It is the version that does what was asked. If the sweep turns out to be
larger than the 56 sites suggest, stop and report rather than shipping (a) as if
it were (b).

### 3.2 What the planner can set

Three roles, matching what already exists — not a free-for-all:

| Role | Used for | Default |
| --- | --- | --- |
| **Text** | headings and body | the palette's `ink` |
| **Secondary text** | times, captions, help text | the palette's `muted` |
| **Links** | inline links (and, per Q3, buttons) | the palette's `accent` |

Each role offers a handful of curated swatches **plus a custom hex field**, and a
"Reset to palette" link. The rail is already the place for it (a new "Text
colour" group under Palette).

### 3.3 Readability is a gate, not a suggestion

The project already decided this once: *"Everything that is text is blocking. No
exceptions, including for a custom palette somebody is attached to"*
(`validatePalette`). So:

- Run `validatePalette` on the **merged** tokens before saving. A text colour
  under 4.5:1 against the paper is **refused with the ratio**, in the editor, the
  same way a custom palette is today.
- In the rail, show the live ratio beside each swatch ("6.8:1 ✓", "3.1:1 — too
  faint") and **disable** failing swatches rather than allowing them and
  complaining afterwards. For the custom hex field, show the ratio as they type.
- Because `validatePalette` is already the single check, the guest page, the
  editor and any future caller cannot disagree about what passes.

### 3.4 What it does and doesn't reach

State this in the rail, in one sentence, because it is the first thing the
planner will notice:

- **Reaches:** every block's text on the paper background, the hero when it is
  not full-photo, the household greeting, the RSVP form, the footer.
- **Does not reach, from the site-wide setting:** words over a photograph (those
  are `onphoto` plus the spec-30 treatments — their legibility depends on the
  picture, not on the palette). **Per-block colour does reach them** (§3.7);
  that is the planner's call, made block by block.
- **The `ink` background style** ("Ink" band, the dark `bg-ink` blocks) keeps its
  own text colour (`paper`), because that pair is chosen to contrast with each
  other. Changing the text colour must not make text on a dark band vanish; the
  tests in §5 pin this.

### 3.7 Per-block colour, and a switch to keep everything matched

Two controls, one default.

- **Site-wide: "Same text colour in every section"** — a switch in the rail's
  Text colour group, **on by default**. On, every block uses the site colours
  from §3.2 and any per-block colour is **ignored**. Off, blocks that have their
  own colour use it and the rest still follow the site. Stored as
  `text_colours.match_all` (absent = `true`, so existing sites are unchanged).
  Turning it on **does not delete** the per-block choices — they are ignored, as
  `bgImage` is under a non-photo background — so flipping it back restores them.
- **Per block: "Use the site's text colour"** — a switch in the block inspector
  beside the existing Background control, on by default. Off reveals **Text** and
  **Secondary text** pickers (same swatches and hex field as §3.2, plus a
  "Match the site" reset). Links keep the site's link colour unless Q9 says
  otherwise.
- **Storage:** two new keys on the block's style, `textColour` and `mutedColour`
  (hex). `styleSchema` is `.strict()` and `BLOCK_STYLE_KEYS` /
  `blocks.test.ts` pin the list, so the ripple documented for spec 30 applies
  exactly: `blocks.ts` (type, key list, each block's `styles`), `block-schemas.ts`,
  `block-inspector.tsx`, `render.tsx`, `style-labels.ts` and both pinned tests, in
  one change. Still **no migration** — block styles are JSON.
- **Cascade, written once:** `textColour` on the block > site override
  (`text_colours`) > the palette's own. One function in `src/lib/theme/`
  resolves it, used by the renderer, the editor and the contrast check.

**Contrast depends on what is behind the words, so the gate depends on the
block's background:**

| Block background | Checked against | Strength |
| --- | --- | --- |
| Plain (paper) | the palette's paper | **Blocking**, 4.5:1 — same rule as §3.3 |
| Tinted | the tint (ink at 7% over paper, as drawn) | **Blocking**, 4.5:1 |
| Ink band | the site's ink (the band's ground) | **Blocking**, 4.5:1 |
| **Photograph** | **nothing — the picture is unknown** | **Advisory only** |

A per-block colour is checked against the block's *own* ground, not the page's,
so the same swatch can be available on one block and disabled on another.
Changing a block's background re-checks its colour; if the new ground fails it,
the colour is **kept but flagged** and the block renders with the site colour
until the planner fixes it (never a silently unreadable block).

**Photograph backgrounds — the case the planner named.** Today a Photograph
block forces its words to the fixed pale `onphoto` colour (and spec 30 added four
"Text over photo" treatments: Photo as it is / Darken / Soft text shadow / Panel).
With per-block colour:

- A photograph block's colour pickers **replace `onphoto`** for that block's text
  when set (so a dark navy over a pale print is possible — the real reason to
  want this). Unset keeps `onphoto`, exactly as today.
- There is **no automatic pass/fail** — we cannot read a photograph. Instead the
  inspector shows the existing "Text over photo" choice directly beneath the
  colour, and a one-line hint: *"We can't check this against your picture.
  Look at it on a phone; Darken, Soft shadow or Panel will help if it's hard to
  read."* If the chosen colour is closer to `onphoto` than to dark, suggest
  nothing; if it matches the Panel/Darken treatment's dark ground (it would
  vanish), **warn** — that pairing is checkable against a flat colour.
- The treatments stay independent of the colour; both are style keys.

### 3.5 Storage

No migration expected: the theme is a JSON payload in `site_content`, read by
`resolveTheme` (which already never throws and falls back field by field) and
written by `saveTheme`. `resolveTheme` gains one tolerant reader; `saveTheme`
gains the validation in §3.3. **The `text_colours` object must be added to the
zod schema in the same change** — HANDOFF session 33 records exactly this trap
for block styles (`.strict()` schemas rejecting a new key on every save).

### 3.6 Pure logic lives in `src/lib/`

Per repo convention: the merge and the swatch list go in `src/lib/theme/` and are
unit-tested there, never inline in the action or the component.

## 4. Build order (when authorised)

1. `src/lib/theme/`: the `text_colours` type, `resolveTheme` reader,
   `themeTokens` merge, the curated swatches, and a helper that returns each
   swatch's ratio against the current paper. Unit tests first.
2. If Q2 is (b): the `text` token end to end — `PaletteTokens`, `validatePalette`
   (one new blocking pair), CSS variables, Tailwind config, then the component
   sweep, checking `bg-ink` / `border-ink` usages are untouched.
3. `saveTheme` + its zod schema: accept, validate, persist, refuse with the ratio.
4. The rail group and the live preview — one renderer, as always, so the preview
   needs no special case.
5. Per-block colour (§3.7): the style keys and their ripple, the cascade
   function, the inspector controls, the background-aware gate, and the
   site-wide "same in every section" switch.
6. Save-the-date, per Q3. Then HANDOFF, this file's Build status, the README index row.

## 5. Test plan

- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (unchanged —
  regression only), `npm run build`. Say which ran, and **say whether it was
  opened in a browser** — it has not been for anything in this area.
- Unit: `resolveTheme` with no `text_colours` returns today's tokens exactly (the
  guarantee that no existing site changes); a valid override merges; an invalid
  hex or a non-string falls back per field; `saveTheme` refuses a 3.0:1 text
  colour and accepts a 4.6:1 one **on each of the eight palettes** (including the
  two dark ones, where `ink` is the light colour).
- Cascade: block > site > palette, and `match_all` on ignores a block's colour
  **without deleting it** (turn it off and the block's colour returns).
- Per-block gate: a swatch passes on Plain and fails on the Ink band (and vice
  versa) from the same hex; changing a block's background re-flags a colour that
  now fails and the block renders with the site colour meanwhile; Photograph
  blocks accept any valid hex and never block.
- `styleSchema` accepts `textColour` / `mutedColour` as hex and rejects other
  values; the known-key list in `blocks.test.ts` includes them.
- A pinned test that the `bg-ink` / dark-band text pair does not move when the
  text colour changes (§3.4).
- A source guard that no component outside the sweep reintroduces `text-ink` for
  something that should follow the setting, if Q2 is (b).
- **Browser**, because this is colour and nothing else: Ivory and Midnight, each
  with a green, a navy and a deliberately faint text choice, at 390px and
  1440px; the reply form and selected-button states; a block with the Ink
  background; the hero full-photo look; and a printed page.

## 6. Questions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | **Which text?** All of it as one colour, or the three roles in §3.2 (text, secondary, links)? | **Three roles** site-wide, with Text first and the other two under "More". Per block (§3.7): Text and Secondary only. |
| 2 | **Should buttons and borders change too?** Option (a) override `ink` as it is, or (b) a separate `text` token (§3.1)? | **(b).** The request is about text. (a) is half a day cheaper and makes a pale text choice produce a pale button. |
| 3 | **The save-the-date.** Follow the site's text colour, or keep its own? | **Follow the site** when its palette is "match site"; a save-the-date that picks one of the six palettes by name keeps that palette's own colours. |
| 4 | **Words over a photograph.** *Revised by the follow-up:* per-block colour reaches them. | **Yes, per block only, advisory not blocking** (§3.7). The site-wide setting still doesn't touch them. |
| 5 | **Free colour or curated?** Custom hex alongside the swatches, or swatches only? | **Both**, because the gate in §3.3 is what makes a free field safe, and "I want exactly our invitation's green" is the likeliest ask. |
| 6 | **Per block too?** *Answered by the follow-up: yes.* | Built as §3.7. The ripple cost is accepted. |
| 7 | **What does the "same in every section" switch do to existing per-block colours?** Ignore them (keep, restorable), or clear them? | **Ignore, don't clear** — reversible, and consistent with how `bgImage` survives a background change. |
| 8 | **Default for the switch** on a site that has never set a text colour. | **On.** Nothing changes until the planner turns it off. |
| 9 | **Link colour per block?** Or only Text and Secondary? | **Only Text and Secondary.** A third picker per block is clutter, and links on a custom ground can use the site's accent if it passes; revisit if asked. |
| 10 | **Does the picture-as-background control change?** The planner mentioned adding pictures; the Photograph background and picker already exist (spec 23/27). Is anything about *adding* pictures missing, or is this only about the text over them? | Assumed **only the text over them**. If there is a gap in uploading or choosing the background picture, say what, and it becomes its own section here or its own spec. |

## 7. Left out on purpose

- **A per-block link colour** (Q9), and a **per-block override of anything but
  text** — background colour and picture are unchanged (the Photograph
  background already exists).
- **Fonts, sizes and weights.** Typography is its own pairing control already.
- **Background colour** and creating palettes from scratch. This spec is text
  only; the rail deliberately offers curated palettes.
- **Automatic text colour from the photo or paper.** Real work, new failure
  modes, and the contrast gate covers the case that matters.
- **The invitation email's colours and the link-preview (Open Graph) image.**
  They render outside the site's CSS and have their own styling.
- **A "readable" override.** The gate has no escape hatch, on purpose.
