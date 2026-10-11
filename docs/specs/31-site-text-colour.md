# Feature spec: Changing the text colour on the invitation website

**Status: proposed (2026-10-11) — asked for as a spec. Nothing is built.** Per
`docs/specs/README.md` and `CLAUDE.md`, answering the questions in §6 is content
for this file, not authorisation to build; the build starts when the planner
says to build it.

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
- **Does not reach:** words over a photograph (those are `onphoto` plus the
  spec-30 treatments — their legibility depends on the picture, not on the
  palette). Offering a colour there is Q4.
- **The `ink` background style** ("Ink" band, the dark `bg-ink` blocks) keeps its
  own text colour (`paper`), because that pair is chosen to contrast with each
  other. Changing the text colour must not make text on a dark band vanish; the
  tests in §5 pin this.

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
5. Save-the-date, per Q3. Then HANDOFF, this file's Build status, the README index row.

## 5. Test plan

- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (unchanged —
  regression only), `npm run build`. Say which ran, and **say whether it was
  opened in a browser** — it has not been for anything in this area.
- Unit: `resolveTheme` with no `text_colours` returns today's tokens exactly (the
  guarantee that no existing site changes); a valid override merges; an invalid
  hex or a non-string falls back per field; `saveTheme` refuses a 3.0:1 text
  colour and accepts a 4.6:1 one **on each of the eight palettes** (including the
  two dark ones, where `ink` is the light colour).
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
| 1 | **Which text?** All of it as one colour, or the three roles in §3.2 (text, secondary, links)? | **Three roles**, with Text first and the other two tucked under "More". One colour for everything would flatten the hierarchy `muted` exists to make. |
| 2 | **Should buttons and borders change too?** Option (a) override `ink` as it is, or (b) a separate `text` token (§3.1)? | **(b).** The request is about text. (a) is half a day cheaper and makes a pale text choice produce a pale button. |
| 3 | **The save-the-date.** Follow the site's text colour, or keep its own? | **Follow the site** when its palette is "match site"; a save-the-date that picks one of the six palettes by name keeps that palette's own colours. |
| 4 | **Words over a photograph.** Leave them as they are, or offer a colour there too? | **Leave them.** Their legibility is the spec-30 treatments' job, and a colour picker there is the easiest way to make a cover unreadable on a particular photo. |
| 5 | **Free colour or curated?** Custom hex alongside the swatches, or swatches only? | **Both**, because the gate in §3.3 is what makes a free field safe, and "I want exactly our invitation's green" is the likeliest ask. |
| 6 | **Per block too?** A text colour for one block (a quote in a different colour) as well as site-wide? | **Site-wide only for now.** A per-block key is a closed-set style key with the full ripple spec 30 documents (type, key list, schema, inspector, two pinned tests) and nobody asked for it. |

## 7. Left out on purpose

- **Fonts, sizes and weights.** Typography is its own pairing control already.
- **Background colour** and creating palettes from scratch. This spec is text
  only; the rail deliberately offers curated palettes.
- **Automatic text colour from the photo or paper.** Real work, new failure
  modes, and the contrast gate covers the case that matters.
- **The invitation email's colours and the link-preview (Open Graph) image.**
  They render outside the site's CSS and have their own styling.
- **A "readable" override.** The gate has no escape hatch, on purpose.
