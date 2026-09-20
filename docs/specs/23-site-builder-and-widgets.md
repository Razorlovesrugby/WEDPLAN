# Spec 23 — The site builder: blocks, widgets, photos and a live preview

**Status: proposed, the shape decided (2026-09-20 — see "Decided" below).
Nothing is built, schema included.** This is the larger half of one request —
[spec 22](22-per-event-invite-status-and-tracking.md) is the other — and it is
a design project as much as a build. Eight open questions in §11; question 1
(third-party embeds) and question 6 (one page or several) are worth answering
before step 1, the rest can follow the build.

**Depends on:** spec 14 (the theme system, the renderer, `site_content`, the
twelve sections, `site_assets`, the storage bucket) and spec 21 (the household
address and the personalised page), both built. Spec 22 supplies the rule for
which events a given reader may see; this spec renders it.

---

## 1. What was asked

> "Regarding the site page, we need a preview and it to look like those
> website builders, where I can add elements to make it look nice. I want to
> be able to add photos and widgets and so on. These widgets we can brainstorm
> together but the site needs to be as beautiful and great UX as possible."

Plus, from the same message and settled in spec 22: **the site and the invite
are one thing** — one URL carrying the RSVP, the maps, the details, what to
wear and the music.

## 2. What exists today, and what it costs

`/site` is twelve fixed sections. Each has a form generated from a table in
`src/lib/site/editor-fields.ts`; each writes one row of `site_content`
(`block_key` unique per wedding, a JSONB payload, a sort order, a visible
flag); `/w/[slug]` renders them through `resolveSections()` in the wedding's
theme. `/site/theme` picks the preset, the palette (with a live contrast
check) and the monogram.

It is a good content model and a poor building experience. Specifically:

| Want | Today |
| --- | --- |
| See what it looks like while editing | **No preview.** The editor links out to the live site |
| Add a photo | **No upload anywhere.** The hero asks for a storage path, typed by hand. `site_assets` exists; nothing writes to it except guest uploads |
| Two photo bands, or the story below the schedule | Impossible. One row per `block_key`, fixed set, one instance each |
| Anything not on the list of twelve | Impossible without a migration and a code change |
| Rebuild the page without guests watching | Impossible. Every save is live |
| A block that looks different from its neighbours | No per-block styling at all |

The ceiling here is the `unique (wedding_id, block_key)` constraint: the
content model says "a wedding has at most one Story", and a builder says
"a page is a list of whatever you like, in whatever order, as many times as
you like".

## 3. Decided — 2026-09-20

**A block builder with a live preview, not a free canvas.** Blocks are added
from a palette, dragged into order, and styled per block; the preview sits
beside the editor with a phone/desktop toggle. A free canvas — absolute
positioning, put anything anywhere — was considered and declined: it needs a
separate hand-built layout per breakpoint or it falls apart on a phone, which
is where most guests will open this, and it is several times the work for a
worse result on the device that matters.

**Blocks replace sections.** One model for everything on the page. The twelve
current sections become the starting set of block *types*, and every wedding's
existing content migrates into blocks in its current order, losing nothing.

**Draft, then publish.** Edits save to a draft only the planner can see;
guests keep seeing the last published version until Publish is pressed.

**One built page, personalised in place.** The planner builds one page. The
shared address renders the public version of it; a household's address renders
the same page with their name, their events and their RSVP — because the site
and the invite are the same thing.

**Widget families, all four chosen:** photos (hero, gallery, full-bleed
bands), music (song requests and a playlist), map and travel, and dress code /
FAQ / countdown.

## 4. The content model

```sql
site_blocks
  id, wedding_id, type, payload jsonb, style jsonb, sort_order, visible,
  audience, created_at, updated_at
```

- **`type`** is the block kind (`hero`, `gallery`, `schedule`, `song_requests`
  …), not unique per wedding: three `photo_band` rows are a normal page.
- **`payload`** is the block's content, exactly as `site_content.payload` is
  today — the existing payload readers in `src/lib/site/sections.ts` carry
  over unchanged, which is most of why this migration is cheap.
- **`style`** is the small, closed set of per-block presentation choices (§7).
  Closed, not free-form CSS: a builder that can produce an unreadable page has
  failed at the thing it was bought for.
- **`audience`** is `everyone` | `invited` | `public_only` (§6).

**Migration:** one `site_content` row becomes one `site_blocks` row of the
same type, payload and order. `site_content` is left in place and unread by
the app — migrations are append-only, and dropping a table the moment its
replacement lands is how a rollback becomes a data loss.

### Draft and published

`site_blocks` **is the draft**. Publishing writes a snapshot:

```sql
site_revisions
  id, wedding_id, published_at, published_by, blocks jsonb, note
```

The public page reads the newest revision, not the blocks table. This is worth
the extra table for four reasons: the public page becomes one row read rather
than a join and a sort; a half-finished edit cannot leak, ever, by
construction; "what did it look like in March" is answerable; and rollback is
an insert rather than an undo.

The editor shows what is outstanding — "3 unpublished changes · guests are
seeing the version from 4 March" — because a draft system whose state is
invisible is a bug generator.

## 5. The editor

```
┌─ Blocks ──────────┬─ Preview ──────────[▯][▭]─┐
│ ⠿ Hero · photo    │                            │
│ ⠿ Countdown       │        Ray & Olivia        │
│ ⠿ Our story       │        12 June 2027        │
│ ⠿ Photo band      │   ──────────────────────   │
│ ⠿ Schedule        │        [  photo  ]         │
│ ⠿ Map · St Mary's │                            │
│ ⠿ Song requests   │        Our story           │
│ ⠿ FAQ             │        ...                 │
│ + Add a block     │                            │
└───────────────────┴────────────────────────────┘
```

- **Left: the page as a list.** Drag to reorder (`dnd-kit` is already in the
  project — spec 11 uses it for cross-section task drag), show/hide, duplicate,
  delete. Selecting a block opens its form in place, the same generated-form
  approach `editor-fields.ts` already uses, extended with the style controls.
- **Right: the real renderer**, in an iframe, rendering the draft. Not a
  mock-up and not a second implementation — the same components the guest
  gets, which is the only way a preview stays honest as the site changes.
  Phone and desktop toggle; "preview as a household" picks a real household so
  the personalised blocks show real content (and, per spec 22 §9, logs
  nothing).
- **Add a block** opens the palette grouped by family, each with a thumbnail
  of what it looks like in the current theme — not a name in a list.
- **Autosave** the draft, with the publish button as the only deliberate act.

**On a phone:** the editor is expected to be usable for content edits (tap a
block, change words, save) and is not expected to support drag-reordering. The
preview pane becomes a toggle rather than a second column. Question 7 asks how
far to take this.

## 6. Personalisation, in one page

Each block declares its audience, and some block types are inherently
personal:

| Block | On `/w/<wedding>` | On `/w/<wedding>/<household>` |
| --- | --- | --- |
| Hero, story, gallery, FAQ, dress code, map, stays | The same for everyone | The same for everyone |
| Schedule | Every public event | **Only their events**, with per-person lines (spec 22 §6) |
| RSVP | "Find my invitation" | **Their form** |
| On the day | Hidden | **Their events' notes** |
| Coach | Times, not bookable | **Bookable**, their seats |
| Photo uploads | Hidden | **Theirs**, if uploads are open |
| Song requests | Open or hidden — question 2 | **Attributed to them** |

`audience` overrides this per block: `invited` hides a block from the shared
page (a block of details you only want people who are actually coming to see),
`public_only` hides it from the personalised page (a "find my invitation"
prompt is noise to somebody already holding their link).

## 7. Making it beautiful — the rules the builder enforces

A builder is only as good as what it refuses to let you do. The Script theme
and its palettes (spec 14 §5) already carry the type scale, the contrast
validator and the five tokens; the builder's job is to keep every block inside
them.

- **Style is a closed set per block**: width (contained / wide / full-bleed),
  background (paper / tinted / photo), alignment, image shape (natural /
  square / portrait), and density. No colour picker per block, no font picker
  per block — colour and type come from the theme, which is where a
  non-designer's decisions stay good.
- **Photos are cropped to a chosen aspect, not squeezed.** A gallery of five
  phone photos in three orientations is the single most common way a wedding
  site starts looking homemade.
- **Vertical rhythm is the block's, not the author's.** No spacer blocks, no
  "add three empty paragraphs" — spacing is a property of the block sequence.
- **Mobile is the default preview.** The toggle starts on phone.
- **The page tells you when it is thin** ("A hero and an RSVP is a bit bare —
  most couples add the schedule and a photo") and when it is bloated (more
  than ~12 blocks, or three galleries in a row).
- **Starter layouts.** Three, in the current theme, as a starting page rather
  than an empty one: *Classic* (hero, story, schedule, travel, FAQ, RSVP),
  *Photo-led* (full-bleed hero, bands between every section), *One-pager* (the
  short version for a small wedding). Existing content migrates in rather than
  being replaced.

## 8. The widget library

**Shipping (all four families chosen):**

**Photos**
- `hero` — full-bleed or framed, one image, headline and date over it.
- `gallery` — a grid; captions optional; opens a lightbox.
- `photo_band` — one full-width image between sections, for rhythm.
- `photo_text` — an image beside a paragraph, alternating left/right.
- Uploads go to the existing private bucket under `site/`, through the
  AVIF/WebP + blurhash pipeline spec 14 built for the hero, with EXIF stripped
  (as the guest uploader already does — location data in a wedding photo is
  the couple's home address more often than anyone expects).

**Music**
- `song_requests` — guests suggest songs; the planner sees the list, with who
  asked, and can mark them played or ignored. Feeds a real artefact: the list
  you hand the DJ.
- `playlist` — a link card to a shared Spotify/Apple playlist by default; a
  true embed is question 1, because it is a third party on a page full of
  guests' names.

**Map and travel**
- `map` — one venue, a static map image plus "open in Maps", parking and
  arrival notes underneath. Static image rather than an interactive embed for
  the same reason as above, and because it is faster on a phone in a field.
- `travel` — the existing transport options and coach runs, rendered as a
  block rather than a fixed section.
- `stays` — the accommodations list, likewise.

**The day itself**
- `dress_code` — words plus, optionally, a published moodboard (spec 9's
  boards already render publicly).
- `faq` — the existing accordion and its 18-question starter library.
- `countdown` — the existing one.
- `schedule`, `on_the_day`, `rsvp` — the personalised trio from §6.
- `story`, `party`, `things_to_do`, `prose` — today's sections, as blocks.

**Deliberately later, and why:** a guestbook (moderation surface); a seating
lookup (needs a table plan, which does not exist); live weather (a third party
for one line of text); a poll or quiz (fun, unbounded); a hashtag wall (a
third party and a moderation problem); menu choices (belongs with catering
numbers, not the site); registry — **still cut**, spec 14 Q6, and this spec
does not reopen it.

## 9. Schema sketch — not to be built yet

```sql
-- 00NN_site_blocks.sql
create type public.block_audience as enum ('everyone', 'invited', 'public_only');
-- (enum in its own migration file — the 55P04 rule, see supabase/migrations/README.md)

create table public.site_blocks (
  id, wedding_id, type text not null, payload jsonb not null default '{}',
  style jsonb not null default '{}', sort_order integer not null default 0,
  visible boolean not null default true,
  audience public.block_audience not null default 'everyone',
  created_at, updated_at
);

create table public.site_revisions (
  id, wedding_id, published_at, published_by uuid, blocks jsonb not null, note text
);

create table public.song_requests (
  id, wedding_id, household_id, guest_id, title text not null, artist text,
  note text, status text not null default 'new', created_at
);

-- backfill: one site_content row -> one site_blocks row, same order
-- + RLS on all three, keyed to wedding_id
-- + site_assets gains nothing; it already holds what the uploader needs
```

`song_requests` is the only new content table: everything else the widgets
render already has one.

## 10. Build order, if it is authorized

1. **The model.** `site_blocks`, `site_revisions`, the backfill, RLS, SQL
   tests. Renderer reads the newest revision; `/site` still edits the old
   forms. Nothing visible changes — this step is deliberately boring and is
   where the risk is.
2. **The editor shell.** The block list, drag to reorder, add/duplicate/delete,
   the live preview iframe, draft state and the Publish button.
3. **Photos.** Upload, crop-to-aspect, the four photo blocks, the pipeline
   wired to `site_assets`.
4. **The rest of the palette.** Existing sections as blocks (mostly a rename
   and a repeat), then `map`, `dress_code`, `photo_text`.
5. **Song requests**, including the planner's list.
6. **Polish.** Starter layouts, block thumbnails, the thin/bloated hints,
   mobile editing.

Steps 1 and 2 are the feature; without 3 it still does not answer "add
photos", so 3 is not optional. 5 is separable and could ship any time after 2.

## 11. Open questions

1. **Third-party embeds: allowed at all?** Spec 14 §11 says no third party on
   a page full of guests' names, and this spec follows it — playlist and map
   are link cards and static images. A Spotify iframe and a Google map embed
   are what people expect, though. Allow them as an explicit opt-in per block,
   or hold the line?
2. **Who can request a song?** Anyone with the shared site address, or only a
   household with their own link (so every request has a name on it)?
   Recommended: the personalised page only — it is attributable, and it keeps
   the open internet out of the DJ's list.
3. **Do blocks need per-block visibility dates?** "Show the coach block from
   May" is a real want and a small field; it is also a scheduling system in a
   content model.
4. **How many revisions are kept?** Unlimited is a growing JSONB table;
   twenty is a number nobody will hit; either is fine, but the answer decides
   whether "restore" is a documented feature or an accident.
5. **Can a block be personalised by tier?** "The evening-only crowd see a
   shorter page." The cut lines already exist (spec 5). This is powerful and
   is also where a content model starts becoming a rules engine.
6. **One long page, or several?** Everything above assumes the single
   scrolling page spec 14 chose. A builder invites "Our story should be its
   own page", which means routing, nav and a per-page block list. Worth
   deciding now, because it is structural rather than additive.
7. **How much of the editor must work on a phone?** Content edits, yes.
   Drag-reordering and cropping on a 390px screen is a real amount of work for
   a task most people will do at a laptop.
8. **Video?** A hero video is the one thing photo-led wedding sites do that
   this spec's palette cannot. It brings hosting, file size, autoplay policies
   and a mute button — a block of its own, later, if at all.
