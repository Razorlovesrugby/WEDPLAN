# Spec 25 — Blocks that know things

**Status: built, 2026-09-21.** All seven questions answered and the build
authorized the same day. See "Build status" below for what exists, the six
things the build corrected or discovered, and what was left. §19 keeps the
questions as they were asked; "Answered" is the authoritative record of what
they were answered with.

**Depends on:** spec 23 (the block catalogue, `site_blocks`, `site_revisions`,
the shared renderer), spec 22 (`v_guest_event_invites`, which decides whose
events a reader sees), spec 21 (the household address, which is the identity
this spec's participation rules turn on), spec 14 (the theme system,
`transport_options`, `coach_runs`, `accommodations`, `site_assets`). All built.

**Sits beside [spec 24](24-builder-editing-feel.md), not on top of it.** Spec 24
is about the *builder* feeling like a tool. This is about the *blocks* being
worth building with. Either can go first; §18 says why this one probably
should.

---

## 1. What was asked

> "I want the actual blocks to have a purpose."

…followed by fifteen screenshots of `aisle.wedding` — a real wedding site for
a June 2027 wedding in Merano, built on a competing platform. This spec is
mostly a reading of those screenshots against what we have.

**A caveat inherited from spec 24 §2 and worth repeating:** our own site has
never been opened in a browser. Every comparison below is between aisle's
rendered pages and our source. The gaps are structural — they are about what
data a block can reach, not about how it looks — so they survive that caveat
better than spec 24's do. But nobody has seen ours.

---

## Answered — 2026-09-21

All seven, four of them put to the planner directly and four answered as
recommended. The build was authorized in the same message.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Dress-code guidance shape | **Labelled notes, defaulting to "For her" / "For him".** A new code is pre-filled with those two, so the common case matches the reference exactly; the labels are content, and a couple can rename them, delete one, or add "For the wedding party". The schema carries no gender binary |
| 2 | Typefaces for Editorial | **Fraunces for display, Inter for labels, EB Garamond stays as body.** Both new faces are SIL Open Font License and subset cleanly. Fraunces is variable with optical sizing, which is what gets genuine display contrast at headline sizes without falling apart small. Keeping EB Garamond halves the new font payload and matches the reference, whose body is a serif |
| 3 | Moderation | **A household link publishes; the shared page queues.** §10's model as written. Spec 21 minted `slug_suffix` as a credential, so a reader holding one is an invited guest and not a stranger |
| 4 | Song voting from the shared page | **Add yes, vote no.** Anyone with the site address can suggest a song and see the list; voting needs a household link, because without identity "one vote each" is a cookie and a cookie is a suggestion. The same rule governs the one-song limit |
| 5 | Existing weddings and Editorial | **Default for new weddings only.** Script stays available and nothing already chosen changes. Answered in the round that scoped this spec |
| 6 | Does hiding a block renumber the rest | **Yes, computed.** The page always reads 01 to N with no gaps. Numbers are positional, never stored |
| 7 | "On the day" once the schedule carries the note | **Stays on by default.** The event gets the note as well, not instead; a planner who wants those notes collected in one place keeps that, and anyone who does not can hide one block |

Questions 5 to 7 were taken as settled rather than asked again: 5 was answered
when the spec's scope was chosen, and 6 and 7 had a clear proposal in §8 and §6
with no cost to being wrong — both are one-line changes if the planner disagrees
once they can see it.

---

## Build status — 2026-09-21

`npm run typecheck`, `npm test` (582, up from 541), `./scripts/verify-migrations.sh`
(388 assertions, up from 356), `./scripts/verify-migrations-single-tx.sh` and
`npm run build` all pass.

### Done

| Part | What exists | Where |
| --- | --- | --- |
| A | `dress_codes`, `dress_code_notes`, `events.dress_code_id`, `coach_runs.event_id`, `arrival_points`, four nullable columns on `transport_options`, and the backfill out of `site_blocks` payloads | `supabase/migrations/0026_dress_codes_and_travel.sql` |
| A | The record logic, all pure and unit-tested — `resolveDressCodes`, `eventDressCode`, `coverageLabel`, `visibleDressCodes`; `formatDuration`, `formatCostRange`, `groupByArrival` | `src/lib/site/dress-codes.ts`, `travel.ts` (+ tests) |
| A | The tag and the shuttle INSIDE the event, drawn by one component both schedule renderers call | `src/components/site/event-inline.tsx` |
| A | The attire section — each code, the events it covers, its labelled notes, its boards | `src/components/site/attire.tsx` |
| A | Arrival points with typed legs, falling back to the old flat list when a wedding has none | `src/components/site/arrivals.tsx` |
| A | The hero absorbs the countdown and gains "a line about why"; `countdown` deprecated but still renders | `blocks.ts`, `render.tsx` |
| A | `sectionNumbers()` and the `NN · LABEL` eyebrow, computed from position | `blocks.ts`, `section.tsx` |
| A | `/site/attire` — codes, notes, and coverage as tickboxes over events | `src/app/(planner)/site/attire/`, `attire-editor.tsx` |
| A | Arrival points, leg duration/cost, and the coach-run event picker on `/travel` | `travel-editor.tsx`, `src/server/actions/travel.ts` |
| B | `song_votes` (household NOT NULL), `guest_notes`, and `song_requests`'s composite unique | `supabase/migrations/0027_guest_participation.sql` |
| B | The rule, as one function both write paths call | `src/lib/site/participation.ts` (+ tests) |
| B | The public song list with votes, and the guestbook | `song-list.tsx`, `guestbook.tsx`, `src/server/actions/songs.ts`, `guestbook.ts` |
| B | `/site/guestbook` — the queue, defaulting to what is actually waiting | `src/app/(planner)/site/guestbook/`, `guest-note-list.tsx` |
| C | Fraunces and Inter, self-hosted, latin + latin-ext; `siteFontClasses()` loads them only for Editorial | `src/lib/fonts/` |
| C | Three type roles — `.site-heading`, `.site-label`, and the `display`/`label` Tailwind families | `globals.css`, `tailwind.config.ts` |
| C | Editorial available and the default for new weddings, with existing ones pinned to Script first | `presets.ts`, `supabase/migrations/0028_editorial_default.sql` |

### Six things the build corrected or discovered

1. **`v_coach_runs` would not have seen the new column.** The view lists its
   columns explicitly (0017's own note, taking 0014's lesson about `r.*`
   expanding at definition time), so `coach_runs.event_id` was invisible to
   every reader. `0026` recreates it with `event_id` **appended**, because
   `create or replace view` may only add columns at the end.

2. **An undefined CSS custom property invalidates the whole declaration.**
   `font-family: var(--font-display), var(--font-script)` does NOT fall back to
   the second entry when the first is undefined — the property is thrown away
   at computed-value time and the heading renders in the browser default. The
   fallback had to go *inside* the `var()`. Getting this wrong would have
   silently unstyled every Script-theme heading.

3. **The theme default could not simply be flipped.** `resolveTheme(null)`
   returns `DEFAULT_THEME`, so every wedding that had never opened the theme
   editor was rendering Script *by fallback*, not by choice. Changing the
   constant would have restyled all of them overnight — the opposite of
   "nothing existing changes". `0028` pins them explicitly first; the constant
   moved only after that.

4. **An existing test counted the whole fixture.** `10_site_blocks.sql` §8
   asserted "2 song requests in this wedding" — true only while the seed had
   none. Spec 25's seed adds two, so those three assertions are now scoped to
   the rows that test inserts, which is what they always meant.

5. **The migrations README had gone stale at `0019`** while the directory held
   files through `0025` — precisely the failure its own warning describes.
   Brought up to date through `0028`, with a note saying it went stale so
   anybody who applied by hand between sessions 23 and 29 knows to check.

6. **A dress code covering only events a household cannot see is a
   disclosure.** Not in the spec, found while wiring the renderer: printing
   "For Farewell Brunch" on the page of a household not invited to the brunch
   names a party nobody told them about. `visibleDressCodes()` drops those and
   narrows the coverage line; a code covering nothing at all is kept, because
   that is general guidance rather than a leak.

### Not done, and worth knowing

- **Nothing has been opened in a browser**, and Part C is typography. A
  passing build says nothing whatsoever about whether Fraunces at 96px sits
  well over Inter at 0.7rem, or whether the numbered eyebrow reads as
  structure or as clutter. This is the part most likely to want an hour and a
  screen.
- **`0026`, `0027` and `0028` are not applied to the live project** — nor are
  `0022` through `0025` from the three sessions before. They apply in order.
- **No catalogue search for songs** (§11). Plain title and artist fields; a
  music API is a third party and spec 23 Q1's rule governs it.
- **The backfill only sees draft blocks.** A wedding whose schedule block was
  created after `0026` ran keeps its per-event dress-code string, and
  `DressCodeTag` falls back to rendering it — so nothing is lost, but those
  strings are not records and do not appear in the attire section.
- **`accommodations` gained nothing.** No price, no room balance: payments are
  out (§16) and that has not quietly changed.
- **No Editorial-specific hero.** `defaultHero: "full"` is declared and the
  hero component honours the three existing styles, but nothing was built to
  make a full-bleed Editorial hero look different from a full-bleed Script one
  beyond the faces.

## 2. The diagnosis: four rules aisle follows and we do not

**1. Every section is a job, not a topic.** Its page is ten numbered steps —
`02 · YOUR REPLY`, `04 · ATTIRE`, `06 · THE PLAYLIST`, `09 · LEAVE A NOTE`,
`10 · WITH LOVE`. The number means the page is a sequence a guest moves
through. Ours is a bag of topics in whatever order the planner dragged them.

**2. The content is a record, not prose.** "Casual Summer" is a named thing
that knows which events it covers, carries guidance per audience, and links a
moodboard. An airport is `MXP · 3 HOURS TO THE VENUE` with typed legs beneath
it (`TAXI · 30 MINUTES · 40–55`). A song is a catalogue entry with an author
and a vote count. Ours are `{ intro, body }` and a free-text `detail`.

**3. The answer appears where the question is asked.** The shuttle time and
the dress code sit *inside* the Welcome Dinner entry — `↳ 6.15PM CASTEL
FRAGSBURG`, then `CASUAL SUMMER`. Nobody scrolls to a travel section and
cross-references it against a schedule. Ours puts those in three different
blocks in three different places on the page.

**4. What guests give back is visible.** `ADDED BY MARIT · ☆ 14`. `NOTES FROM
OTHER GUESTS`. A form nobody sees the result of is a form people stop filling
in.

Rule 3 is the one that costs the least and changes the page most, which is why
Part A leads with it.

## 3. What we already have that nothing reads

This is the part worth sitting with. The app holds nearly all of this data
already; the site is a second place to type it by hand.

| Already in the database | What the site does with it |
| --- | --- |
| `events` — name, `starts_at`, `venue`, `address`, `is_public` | The schedule block renders it. This one works |
| `events.guest_note` (spec 21) | Renders, but in a separate "On the day" block, not under the event |
| `coach_runs` + `coach_stops` — labels, `departs_at`, per-stop `pickup_at` | Renders as one "The coach" block. **No run knows which event it serves** — there is no `event_id` |
| `transport_options` — kind, name, detail, url | Renders as a list. `0017_public_site.sql:26` deliberately has **no duration and no cost columns** |
| `accommodations` — name, address, url, `distance_label`, `image_id` | Renders as links |
| Per-event dress code — **already exists**, as a string inside the schedule block's own payload (`BLOCK_SCHEMAS.schedule.events[].dress_code`) | Rendered as a line on the event. **Completely disconnected from the `dress_code` block**, which is a separate `{ intro, body, board_id }` |
| Moodboards (spec 9), publicly shareable | One optional `board_id` on the dress-code block |
| `song_requests` with a `new/approved/played/ignored` ladder | Planner-facing only, by decision (spec 23 Q2) |
| `site_assets.approved_at` — a review-before-public gate for guest photos | Works. **This is the moderation pattern Part B reuses rather than inventing** |

The per-event dress code is the sharpest example. The data to do what aisle
does is *already being typed*, into a payload field, next to a block that
renders unrelated prose about the same subject.

---

# Part A — blocks that read the wedding

## 4. Dress codes become records

**Today:** a `dress_code` block holding `{ intro, body, board_id }`, and,
separately, a free string per event inside the schedule block's payload. Two
places, no relationship, and the string is re-typed for every event.

**Proposed:** a `dress_codes` table. A code has a name, one or more blocks of
guidance, and optionally a published moodboard. An event points at one.

```sql
dress_codes      id, wedding_id, name, board_id, sort_order, …
dress_code_notes id, wedding_id, dress_code_id, label, body, board_id, sort_order
events           + dress_code_id
```

**Why `dress_code_notes` rather than `for_her` and `for_him` columns.** Aisle
splits every code into FOR HER and FOR HIM. Two columns would be the direct
translation and it would hardcode a gender binary into the schema of a product
whose guest list does not have one. A repeating labelled note costs the same
to build, renders identically when the labels happen to be "For her" and "For
him", and lets a couple write "For everyone", "If you are in the wedding
party", or "A note on the cobblestones" instead. The default content can be
her/him; the *schema* should not be. §19 question 1.

**Two renderings from one record** — this is the whole point:

- **Inside each schedule event:** the code's name as a small letterspaced tag,
  exactly where a guest reading about the Welcome Dinner wants it.
- **In the attire block:** each code in full — its name, *the events it applies
  to* (a reverse lookup, not a typed list), its notes, its moodboard link and
  inspiration images.

**The migration is the risky part.** The existing per-event strings live
inside `site_blocks.payload`, not on a table, so the backfill has to walk
JSONB: distinct `dress_code` strings per wedding become `dress_codes` rows,
and `events.dress_code_id` is set from the matching entry. A wedding with
"Formal summer" and "formal Summer" gets two rows, and that is correct — the
planner merges them, we do not guess. Blocks and revisions keep their old
payload field untouched, so a rollback still renders.

## 5. Travel gains typed legs

`0017_public_site.sql:24-28` says, in as many words:

> No cost and no duration columns. At this distance a guest wants a sentence
> and a phone number; the comparison table a destination wedding needs would
> be five empty columns here.

That reasoning was scoped, and the scope was "not a destination wedding."
Aisle's example is a destination wedding in Italy, and the comparison table is
exactly what it needs. **So this is reopened on its own terms, not overturned:
every new column is nullable and the renderer draws only what is filled.** A
wedding down the road still gets a sentence and a phone number.

```sql
arrival_points     id, wedding_id, code, name, region, minutes_to_venue, sort_order
transport_options  + arrival_point_id, duration_minutes, cost_low, cost_high
```

- `code` is the big display token — `MXP`. Optional: not every arrival point
  is an airport.
- `minutes_to_venue` renders as "3 HOURS TO THE VENUE", formatted, not typed.
- **Cost is integer minor units, NZD** — the platform rule from
  `docs/wedding-platform-spec.md`, and spec 18 made the currency question moot.
  `cost_low`/`cost_high` render as a range, or as one figure when they match,
  or not at all when both are null.

## 6. The schedule composes

Under each event, in the schedule block, rendered inline:

1. **The coach runs serving it.** This needs `coach_runs.event_id` — a run
   currently knows its direction, label and departure time, but not what it is
   a shuttle *to*. Nullable: a run that serves the whole weekend stays
   unattached and keeps rendering in the coach block as it does now.
2. **The dress code tag** (§4).
3. **`events.guest_note`** (spec 21), which today renders in a separate "On the
   day" block.

That third one deserves a note: it does not mean deleting `on_the_day`. A
planner who wants their notes collected in one place should keep being able to
have that. The event gets the note *as well*, and §19 question 7 asks whether
the standalone block defaults to on or off once the schedule carries it.

**What this does not do:** it does not compute anything. No travel-time
arithmetic, no "leave by" calculation, no timezone cleverness beyond what the
wedding's own timezone already does. It puts three existing facts next to the
event they belong to.

## 7. The hero absorbs the countdown

Aisle's hero carries the names, the date, the place, a line of purpose, **and
the countdown** (`DAYS 263 / HOURS 5`), as one composed unit. Ours are two
blocks the planner stacks and hopes sit well together — and spec 23 gives
`countdown` its own `max: 1` and its own background control, so it can be
separated from the hero by anything.

**Proposed:** `countdown` becomes a switch on the `hero` block.

**The `countdown` block type stays in the catalogue.** Removing it would be a
data-loss bug, not a cleanup: `toBlock()` in `src/server/queries/site-blocks.ts`
drops any entry whose `type` is not in `BLOCK_TYPES`, so a published revision
from last month would silently lose its countdown when somebody viewed it.
Deprecated in the palette, still rendered, still in the enum of types.

## 8. Sections get a number and a job-label

Every navigable block gains an eyebrow: `04 · ATTIRE`.

- **The number is computed**, from position among navigable blocks — reuse
  `NOT_IN_NAV` from `blockNavItems`, which already knows a photo band is not a
  destination. Hiding a block renumbers the rest, so the page always reads 01
  to N with no gaps. §19 question 6 asks whether that is right.
- **The label is the block's job**, not its type name: `YOUR REPLY` rather than
  "RSVP", `ATTIRE` rather than "What to wear" (which is the *headline*). One
  default per `BlockDef`, overridable per block.
- **It needs Part C's label type role** to look like anything. Without it the
  eyebrow renders in the body face and reads as a stray line. Part A is
  shippable without Part C, but this section is the one place they are coupled.

## 9. The blocks that stay text boxes, and why that is fine

`story`, `prose`, `party`, `things_to_do` have no data behind them and should
not pretend to. How you met is prose. Who is standing up with you is a list
somebody types. "While you're here" is local knowledge no database has.

The failure this spec is correcting is not "a block contains words" — it is "a
block contains words *about data the app already holds*." Dress code, travel
and the schedule are that. The four above are not, and inventing a
`recommendations` table so "While you're here" can feel structured would be
the exact over-engineering `CLAUDE.md` warns about.

---

# Part B — what guests give back, and who reads it

Two things spec 23 deliberately cut are reopened here, both for the same
stated reason: **moderation**.

> Deliberately later, and why: a guestbook (moderation surface) … — spec 23 §8
>
> nothing a guest types is rendered back onto the public page — the list is
> planner-facing. — spec 23 Q2

Both stay cut unless §10's model is accepted, because without it this spec is
asking a couple to police their own wedding site in the weeks before a wedding.

## 10. The moderation model: a household link is not a stranger

Spec 21 established that `households.slug_suffix` is a credential — five random
characters, minted once, redrawn only by `reissueInvitation`. Somebody reading
`/w/ray-and-olivia/okonkwo-4f7ak` holds an invitation. Somebody on
`/w/ray-and-olivia` is the internet.

**So: contributions from a household's own page publish immediately;
contributions from the shared page queue for review.**

That is not a compromise, it is the correct rule, and it makes the moderation
load approximately zero for the common case — a guest who was sent a link and
used it. The queue only ever holds submissions from people who found the
public address, which is precisely the set worth looking at.

It also reuses machinery rather than inventing it: `site_assets.approved_at`
is already exactly this gate for guest photo uploads, and `song_requests` is
already born with a `new / approved / played / ignored` ladder that nothing
public reads.

§19 question 3 is whether the planner wants that auto-publish, or whether
everything queues.

## 11. The song list, rendered back

Spec 23 built `song_requests` with the status ladder, the optional `asked_by`
name, automatic attribution from a household page, and the RSVP rate limit.
**Reopening Q2 is therefore cheaper than it sounds:** the public list is a
filtered read of a table that exists.

- **The public list shows approved requests only**, with `asked_by` when it is
  set and the request is approved. A name on a public page is a small abuse
  surface; the gate is what makes it safe.
- **Votes** need a new `song_votes` table, one row per household per song.
- **Voting requires a household link.** Without identity, "one vote each"
  is a cookie, and a cookie is a suggestion. The shared page can *add* a song
  and *see* the list; it cannot vote. Same rule for aisle's "one song each"
  limit. §19 question 4.
- **No catalogue search.** Aisle's "Search a song or artist…" is a music API —
  a third party, which spec 23 Q1 governs, on a page that may be a household's
  private address. Plain title and artist fields for now; the embed rule in
  §3a of that spec is the place to revisit it.

## 12. The guestbook

```sql
guest_notes  id, wedding_id, household_id, guest_id, author_name, body,
             status, created_at
```

`status` is text with a check constraint, matching `song_requests` rather than
introducing an enum (and therefore not needing its own migration file under
the 55P04 rule). Published notes render newest-first under the form, as aisle's
`NOTES FROM OTHER GUESTS` does.

The planner's screen is `/site/guestbook`, built from the same component shape
as `song-list.tsx`, which already does approve/ignore over a status ladder.

A 500-character limit, as aisle has. It is a guestbook, not a comment section,
and the constraint is what makes people write the good version.

---

# Part C — Editorial becomes the default theme

## 13. What aisle's type actually is

**There is no script face anywhere on that page.** The elegance is entirely
from contrast between a high-contrast serif display and small letterspaced
uppercase metadata. We ship Pinyon Script (a formal cursive, display only) and
EB Garamond — the traditional stationery register, a different aesthetic.

`src/lib/theme/presets.ts` already declares the preset for this, unbuilt:

> **`editorial`** — "Magazine. High-contrast serif display, grotesque body,
> wide margins, hairline rules." `available: false`, `defaultHero: "full"`.

That is close, and `defaultHero: "full"` already matches aisle's full-bleed
photo hero. One correction from the screenshots: **aisle's body is a serif, not
a grotesque.** The grotesque in that description should become a second serif
or the preset will read colder than the reference.

**Decided:** Editorial becomes the default for new weddings; Script stays
available and nothing existing changes. The theme lives in `site_content` (the
one row spec 23 kept there), so "default" is a question about new weddings
only — no migration rewrites anybody's choice.

## 14. Three type roles, not two

The system currently has `script` (display) and `body`. Aisle's needs a third:

| Role | Used for | Today |
| --- | --- | --- |
| Display | Names, section headlines | `script` — Pinyon |
| Body | Paragraphs, event names, the italic secondary voice | `body` — EB Garamond |
| **Label** | `04 · ATTIRE`, `FOR HER`, `5.00PM`, `CASUAL SUMMER`, `3 HOURS TO THE VENUE` | **Does not exist.** §8's eyebrow has nowhere to live |

**Fonts must be self-hosted.** `src/lib/fonts/index.ts` is explicit about why:
a third-party font request from a guest site leaks every visitor's IP, costs a
render-blocking round trip on a phone, and breaks a CI box with no egress. So
choosing faces means shipping woff2 subsets (latin + latin-ext) into
`src/lib/fonts/`, under a licence that permits it.

I cannot identify aisle's display face from a screenshot, and it reads as a
commercial licence. Open-licence faces in the same register: **Fraunces**
(variable, optical sizing, high contrast at display sizes), **Bodoni Moda**,
**Playfair Display** (the obvious one, and the most used). For the label role:
a grotesque or mono at heavy tracking — **Inter** or **JetBrains Mono** both
subset cleanly. The choice, and its licence, is §19 question 2.

**Palettes are unaffected** but must still pass. Aisle's is a warm off-white
paper, near-black ink and a deep green accent — close to our `sage` on a
warmer paper. `validatePalette` and `theme.test.ts` assert every palette on all
four text pairs, and any new token set has to clear them.

---

## 15. Schema sketch — not to be built yet

```sql
-- 0026_dress_codes_and_travel.sql   (Part A)
create table public.dress_codes (id, wedding_id, name, board_id, sort_order, …);
create table public.dress_code_notes (id, wedding_id, dress_code_id, label, body,
                                      board_id, sort_order, …);
alter table public.events         add column dress_code_id uuid;
alter table public.coach_runs     add column event_id uuid;
create table public.arrival_points (id, wedding_id, code, name, region,
                                    minutes_to_venue, sort_order, …);
alter table public.transport_options
  add column arrival_point_id uuid,
  add column duration_minutes integer,
  add column cost_low integer, add column cost_high integer;  -- NZD minor units
-- backfill: distinct schedule-payload dress_code strings -> dress_codes rows
-- + wedding_id and composite FKs on every new table, RLS in the same migration

-- 0027_guest_participation.sql      (Part B)
create table public.song_votes (id, wedding_id, song_request_id, household_id, …);
create table public.guest_notes (id, wedding_id, household_id, guest_id,
                                 author_name, body, status, created_at);
-- status is text + check, matching song_requests — no new enum, so no 55P04 split
```

Every new table takes `wedding_id`, composite foreign keys, and a row in the
RLS `tenant_tables` array in the same migration — `docs/HANDOFF.md` section 5,
rule 1. No new enum type, so neither migration needs splitting.

## 16. What this spec deliberately does not do

**No payments.** "Pay for your room · €420" and "Contribute · $740 / $1,200"
are a payment processor, refunds, reconciliation against spec 6's budget, and
money moving between guests and a couple. That is a feature the size of the
budget module and it is not a block. `accommodations` has no price column and
this spec does not add one.

**No registry.** Spec 14 Q6 cut it and spec 23 §8 says it "does not reopen it."
Aisle's `05 · OUR WISHES` — contribution goals with progress bars — is a
registry with a softer name. It may well be worth building; it is not being
smuggled in under this spec's cover.

Both were put to the planner explicitly and left out of this scope.

## 17. Test plan

Pure logic, unit-tested in `src/lib/`:

- `eventDressCode(event, codes)` and its reverse, `eventsUsingCode(code, events)` —
  the two renderings of one record, including an event with no code and a code
  with no events.
- `formatDuration(minutes)` — "3 HOURS TO THE VENUE", "30 MINUTES", "2 HOURS 30".
- `formatCostRange(low, high)` — both, one, neither, and equal. Integer minor
  units in, NZD out, no float anywhere.
- `sectionNumbers(blocks)` — numbering over hidden blocks, non-navigable blocks,
  and duplicates.
- `canPublishImmediately(household)` — §10's rule, as one function both the
  song path and the note path call, because two copies of that rule is how one
  of them quietly stops gating.

SQL, in `supabase/tests/`:

- RLS on all four new tables, with a second account (the house rule).
- The dress-code backfill: two events sharing a string get one row; differing
  case gets two; a wedding with no schedule block gets none and does not fail.
- `song_votes` uniqueness per household per song.
- A `guest_notes` row defaults to `new` and is invisible to an anonymous read.

Then `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
`./scripts/verify-migrations-single-tx.sh`, `npm run build` — and a browser.
Part C is typography; a passing build says nothing whatsoever about it.

## 18. Build order, if it is authorized

**Part A first, and within it §6 first.** Putting the shuttle and the dress
code inside the event is the change a guest notices, it needs one nullable
column (`coach_runs.event_id`) plus §4's table, and it is the proof that rule 3
is worth the rest.

1. `0026`, the backfill, RLS, SQL tests. Nothing renders differently yet.
2. §4 and §6 — dress codes as records, the schedule composing. The payoff.
3. §5 — arrival points and typed legs.
4. §7 and §8 — the hero/countdown merge, section numbering.
5. **Part C** — Editorial, the label role, the fonts. Do it here rather than
   last: §8's eyebrow has nowhere to live until the label role exists, and
   every screen built after this point gets designed in the theme that ships.
6. `0027` and Part B — the moderation rule first, as one shared function, then
   the song list and the guestbook on top of it.

Steps 1–4 are Part A and ship alone. Part B is independent of all of it and
could go first if the planner would rather have participation than structure.

**Against spec 24:** that spec makes the builder pleasant to use; this one
makes it worth using. If only one gets built, this one — a page that answers a
guest's question beats a page that was comfortable to assemble. But spec 24's
§7 English pass is an afternoon and would make building *this* less annoying,
so taking that one item first is not a detour.

## 19. Open questions

Nothing is built until these are answered.

| # | Question | Why it is the planner's |
| --- | --- | --- |
| 1 | **Dress code guidance: labelled notes, or fixed "for her"/"for him"?** §4 proposes labelled notes with her/him as default *content*, so the schema carries no gender binary. | It is a product stance, and the default labels are yours |
| 2 | **Which typefaces for Editorial?** Must be self-hostable and licensed for it. Candidates in §14; I cannot identify aisle's and it looks commercial. | Taste, and a licence someone has to hold |
| 3 | **Does a household link publish without review?** §10's model. The alternative is that everything queues and somebody reads it. | It is your site and your weekend being spent moderating |
| 4 | **Song voting from the shared page?** Proposal: adding yes, voting no — a vote without identity is a cookie. | A real restriction guests will notice |
| 5 | **Existing weddings and Editorial.** Proposal: default for new weddings only, nothing existing changes. Confirm, or switch everyone. | Nobody's live site should change under them without you saying so |
| 6 | **Does hiding a block renumber the rest?** Proposal: yes, computed, so the page always reads 01 to N. The alternative is stable numbers with gaps. | Either is defensible; it is how you want the page to read |
| 7 | **Once the schedule carries the per-event note, does the "On the day" block default to off?** It stays available either way. | Whether you want those notes collected in one place as well |
