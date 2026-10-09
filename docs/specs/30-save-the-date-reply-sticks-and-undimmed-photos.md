# Feature spec: A "can't come" reply that sticks, and background photos shown as they are

**Status: proposed (2026-10-09). Nothing built, no questions answered.** Asked
for as a spec; per `CLAUDE.md` and `docs/specs/README.md` this stops here until
the planner says to build, in words that mean "write code". Answering the
questions in §6 updates this file; it is not a build instruction.

**Depends on:** spec 29 (the "I'm unable to attend" block, `0034`), spec 23 /
27 (photograph backgrounds, the hero), spec 14 §12.1 (the save-the-date). All
built. **`0026`–`0034` are not applied to the live project**, so if the
planner has been testing against a deployment, see Q1 first.

## 1. What was asked

Two unrelated things, one document.

**A.** *"When using the individual save the date link, if you say can't come
and then go back onto the invite, it comes up being able to answer it again.
The answer should persist and the link should open with it showing their
previous response, and the 'undo' button."*

**B.** *"If I add a photo to the background on the website, it doesn't auto
fade it, it should just show the picture as it is."*

## 2. Part A — the reply that doesn't stick

### 2.1 What the code does today (read off the source)

The behaviour asked for **is already what the code is written to do**, which
makes this a diagnosis problem before it is a build problem.

- Declining writes `guests.unable_to_attend_at` / `_via = 'save_the_date'`
  (`declineSaveTheDate`, `src/server/actions/save-the-date-reply.ts`).
- The page (`src/app/w/[slug]/[household]/save-the-date/page.tsx`) is
  `force-dynamic`. On every load it calls `loadUnableToAttend`
  (`src/server/queries/save-the-date.ts`), which splits the household into
  `candidates` (no flag) and `declined` (flagged from this page), and passes both
  to `UnableToAttend`.
- `UnableToAttend` starts in its `done` state — the thank-you, **Undo**, and
  "Someone else can't come either" — whenever `declined` is non-empty
  (`useState(initialDeclined.length > 0 ? "done" : "idle")`).
- Spec 29 §4.2 says so in as many words: *"reloading never presents the question
  again as if unanswered."*

So a plain read says: decline, reload, see the confirmation and Undo. The
planner is seeing something else. **I could not reproduce this** — the app has
never run against a live Supabase project (`docs/HANDOFF.md`), and the guest
block has only been looked at in preview mode, so neither public write has ever
actually executed. What follows are the explanations that fit the report, in the
order I'd check them.

### 2.2 Suspects

| # | Suspect | Fits the report because | How to tell |
| --- | --- | --- | --- |
| 1 | **Testing through the planner's preview** (`?preview=1`, or the **View** button on `/invitations`) | Preview deliberately saves **nothing** (spec 29 §10.10: "the same convention as the view counter and the site preview"). Decline, reload, and the question is back — exactly the report. The only cue is a small "Preview — nothing is saved." line, and only while the block is open. | The address bar ends `?preview=1`. Test again from **Copy link**. |
| 2 | **The browser serving a stale copy on Back** (back/forward cache, or the framework's client-side page cache) | "Go back onto the invite" suggests navigating away and returning, not a fresh reload. A restored page shows whatever state it had when left, or a cached server render from before the decline. | Reproduces with Back but not with a hard reload. |
| 3 | **"The invite" is the formal invitation page, not the save-the-date** | The invitation page (`/w/<wedding>/<household>`) knows nothing about the flag. It was **deliberately** kept out of it (HANDOFF session 35: a flag is "not an `rsvps` row… would show pre-filled on the invitation later"), so it offers the RSVP as if nothing had been said. | Which URL — ends in `/save-the-date` or not. |
| 4 | **The write failed and was not noticed**, e.g. `0034` not applied | An error is shown in red under the block, but a guest who closes the tab never sees it. (If the column were missing the *page* would hide the block entirely, since `loadUnableToAttend` ignores the query error — which is worth fixing on its own: see §2.3.3.) | Check `guests.unable_to_attend_at` for the household in Supabase. |

Suspects 1 and 3 are the likeliest. Neither is a bug in the persistence itself.

### 2.3 Proposal

Do these regardless of which suspect it turns out to be — each is small and
makes the page's answer something you can trust:

1. **Reproduce first.** Build step 1 is the planner (or the build session)
   declining on a real household from a non-preview link, reloading, and going
   Back, and writing down which of the four happens. No code until then.
2. **Make Back as truthful as reload** (suspect 2). Send the page with
   `Cache-Control: no-store` so a restored page can't be a stale render, and in
   `UnableToAttend` refresh from the server on `pageshow` when `event.persisted`
   is true. One effect, a few lines.
3. **Stop swallowing the load error** (suspect 4). `loadUnableToAttend` should
   throw (or the page should render the "something went wrong" state) rather
   than treat a failed query as "nobody here", so a missing column can never look
   like "this household has nothing to say".
4. **Make preview say what it is** (suspect 1). When `preview` is true, the
   idle block says up front — not only once opened — that nothing is saved and
   a reload starts over. One line, same place as the existing note.
5. **Only if Q2 comes back "the invitation page":** a quiet line at the top of
   that household's invitation — *"You told us you can't come. Changed your mind?
   Undo"* — using the existing `undoSaveTheDateDecline`. **Not** a pre-filled
   RSVP, for the reason in spec 29 §4.1. This adds a public write to a second
   page, so it is the one item here that needs its own tests (§5).

Nothing in this part touches the database schema.

## 3. Part B — photographs behind words are dimmed on purpose

### 3.1 What the code does today

There is **no site-wide page background**. "A photo in the background" can only
mean a photograph behind a block's content or behind the cover. Every place
that happens darkens the picture:

| Surface | Where | Treatment today |
| --- | --- | --- |
| A block set to the **Photograph** background | `Background` in `src/components/site/blocks/render.tsx` | A fixed `rgba(18,22,19,0.62)` overlay, and every descendant forced to the pale `onphoto` colour. The inspector tells the planner this is "not a taste call". |
| The hero (full-bleed look) | `SiteHero` in `src/components/site/hero.tsx` | `bg-scrim/45` over the photo, plus a second `bg-scrim/30` layer that is invisible until the scroll hand-over. Editorial's hero: `rgba(18,22,19,0.62)` and a `0.4` second layer. |
| The save-the-date cover | `.std-scrim` in `src/app/globals.css`, drawn by `Cover` in `card.tsx` | A gradient: 38% at the top, 18% mid-photo, **72% at the foot** where the names sit. |
| The scroll hand-over | `.site-cover-dim` / `@keyframes site-cover-photo` in `globals.css` | As a guest scrolls, the photo eases back and a dimming layer fades **in**. Its own switch (`cover_handover`). |

The page-break band, the gallery and the photo-and-text block draw their
pictures with no overlay at all — they already "show the picture as it is".

That darkening is a decision, not an accident: the comments in `render.tsx` and
`hero.tsx` both argue that without it, white text passes contrast against
"whatever the photographer happened to shoot, which is not a guarantee". The
planner is overriding that, which is theirs to do — but it is the reason this
isn't a one-line delete: **undimmed, pale text on a bright photograph can be
unreadable**, and the build has to say what happens then (Q5).

### 3.2 Proposal

One new, closed style key on the block, `dim`, and the photograph is shown
untouched unless it is set:

- `BlockStyle.dim?: boolean` — absent or `false` means **no overlay**; `true`
  restores today's treatment for people who want it. The control is one
  checkbox in the block inspector, **"Darken the photo behind the words"**,
  shown only while the background is Photograph, replacing the explanatory
  paragraph that currently justifies the scrim.
- `Background` in `render.tsx` draws the overlay only when `dim` is true. The
  text colour stays pale either way (see Q5 for what keeps it legible).
- The hero and the save-the-date cover get the same treatment if Q2 says to
  include them; the hero is a block, so it should carry the same key — **to
  confirm at build** whether its style object can, since this was read from
  `hero.tsx`, not from the block catalogue. The save-the-date's config is its own
  JSON row (`site_content['save_the_date']`), so it would need its own field.
- **A closed-set key has a cost, stated in HANDOFF session 33:** `styleSchema`
  is `.strict()` and a style key added to `BlockStyle` without it fails every
  save of that block; there is a compile-time exhaustiveness check and
  `blocks.test.ts` pins the known-key list. Adding `dim` means touching
  `blocks.ts` (the type, the key list and each photograph-capable block's
  `styles`), `block-schemas.ts`, `block-inspector.tsx`, `render.tsx`, and those
  two tests.
- **No migration is expected**: the style lives in the block's JSON. Confirm
  against `0025_site_blocks.sql` before saying so in the build status.

## 4. Build order (when authorised)

1. Reproduce Part A (§2.3.1) and record which suspect it was. Stop and report
   if it is not one of the four.
2. Part A fixes 2–4 (and 5 if Q2 asks for it) — a client effect, a header, an
   error path, a label.
3. `dim` on blocks: `blocks.ts`, `block-schemas.ts`, the inspector control,
   `Background`.
4. Hero and save-the-date cover, per Q2.
5. Handoff, this file's Build status, and the index row in `README.md`.

## 5. Test plan

- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (unchanged,
  as a regression check), `npm run build`. Say which of those, and whether the
  page was opened in a browser, in the build status — never imply the browser
  pass.
- Unit: `styleSchema` accepts `dim: true/false` and rejects other values;
  `blocks.test.ts` known-key list includes it; a `photograph` block with no
  `dim` renders no overlay element, and with `dim: true` renders today's.
- Extend `src/components/save-the-date/unable-to-attend.test.ts` so the three
  standing rules (button press only, intersect with the household's guests,
  write only the two flag columns) still hold if §2.3.5 is built.
- **Browser**, because both halves are things you have to look at: a real phone
  with a real save-the-date link (decline, reload, Back, Undo); and a
  Photograph-background block over one dark and one very bright picture at
  390px and 1440px, to see what Q5's choice actually looks like.

## 6. Questions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | **How were you testing?** The link from **Copy link**, or the **View** button / a link ending `?preview=1`? And on the live deployment, or locally? | This decides whether Part A is a bug at all (§2.2 #1). If it was View, say so and Part A shrinks to the one-line label in §2.3.4. |
| 2 | **Which "invite"?** The save-the-date page (ends `/save-the-date`), or the formal invitation page? | If the invitation page, build §2.3.5 — but as a note with Undo, not a pre-filled RSVP. |
| 3 | **Photographs: which surfaces?** Photograph-background blocks only, or also the hero and the save-the-date cover? | **All three.** "A photo in the background on the website" doesn't distinguish them, and a hero that stays dark while the blocks don't would look like a bug. |
| 4 | **Existing blocks.** Absent means "no overlay", so every Photograph-background block already published loses its dimming the next time it is seen. Keep that, or preserve today's look for blocks that already exist? | **Let them flip.** It is what was asked, there is one site, and a data migration to preserve a look the planner doesn't want is more code than the change. |
| 5 | **Legibility with no overlay.** The words stay pale. Over a bright photo that fails. Options: (a) a soft text shadow when undimmed; (b) nothing — the planner picks the picture and the `dim` checkbox is the remedy; (c) put the words on a small solid panel over the photo. | **(a).** A text shadow doesn't alter the picture, costs one CSS rule, and rescues the common case. Say so in the inspector in one sentence beside the checkbox. |
| 6 | **The scroll hand-over** (the cover photo dimming as you scroll) is separate from the overlay and already has its own switch. Is that what you meant by "fade"? | **Leave it alone** unless you say it is. If it is, the fix is turning the switch off, not code. |

## 7. Left out on purpose

- A **slider** for how dark the overlay is. A checkbox answers "show the picture
  as it is"; a slider is a design tool nobody asked for.
- **Automatic contrast detection** (sampling the photo and choosing pale or dark
  text). Real work, new failure modes, and Q5(a) covers the common case.
- A **site-wide background photo.** It doesn't exist today; nobody asked for it.
- Any change to the **gallery, page break or photo-and-text** blocks. They are
  already undimmed.
- **Notifying the planner** when someone declines — spec 29 Q7 said no.
