# Feature spec: The music section — a live chart guests play with

**Status: built (2026-10-10) — asked for as a spec, questions answered, then
"Yea build plz" as its own turn.** All six steps of §10, on branch
`claude/spec-31-music-section`; no PR opened. See **Build status** at the end
for what departs from the text above. **Never opened in a browser, never run
against Supabase, and Apple's API was unreachable from the build session.**

## Answered — 2026-10-10

| Q | Answer | What it changed |
| --- | --- | --- |
| 1 | **Check every ~15 s** (polling). | §4.1 A1 stands. |
| 2 | **Slide into place**, with the 3 s hold. | §4.2 stands; reopens spec 28 §6.2's frozen order. |
| 3 | **Unlimited votes, as now** — one per household per song. | §5's vote budget is **dropped**: no trigger, no "3 of 5 left". |
| 4 | Asked "scale by guests", then on clarification: **unlimited, flat.** | Household size doesn't matter. No per-guest voting. |
| 5 | **Do-not-play list, played on the night, couple's pick.** Duplicate catch was in regardless. | §6 items 1–4 in; **voting closes** (5) and **rounds** (6) out. |
| 6 | **Counts only** for guests. | Who voted is shown on `/site/songs` only. |
| 7 | **Block editor.** | Do-not-play list and refusal line go on the block payload. Couple's pick is a per-song toggle, set on `/site/songs` (it is a fact about a row, not a block setting). |
| 8 | **Song search with album art — in this spec**, against the recommendation. | New §7a; §8's "not recommended" entry removed. |
| 9 | Default heading **"Request a song"** (still editable per block). | New blocks only; existing blocks keep whatever heading they have. |
| 8a | **Artwork only** — no 30-second previews. | No audio from Apple ever reaches a guest's browser. |
| 8b | **Can't find it? Type it in.** | Search is the main path; today's title/artist fields remain as the fallback, shown without artwork. |

**Depends on:** spec 23 (`song_requests`, the Song requests block), spec 25
Part B (`song_votes`, the public list), spec 28 §6.2–6.3 and §7a.4 (the ▲ vote
pill, the placeholder, and the removal of the shared page). All built. **None
of `0026`–`0034` is applied to the live project**, and the song list has never
run against Supabase or been opened on a real household page — only in
preview, where nothing saves (`docs/HANDOFF.md`).

## 1. What was asked

> *"Let's write some specs for the invites. Especially the music section. I
> want it to be interactive, i.e. can see what's been suggested. I want a live
> ranking, maybe even voting, a way to make it fun."*

## 2. What is already there (read off the source)

More than the request assumes. Of the four asks, two and a half are built:

| Ask | State today |
| --- | --- |
| See what's been suggested | **Built.** "What everyone's picked" under the form (`src/components/site/song-list.tsx`), approved + played rows, with "Added by …" / "Your suggestion". |
| Voting | **Built.** One vote per household per song, enforced by `song_votes`' unique constraint; ▲ pill, optimistic, tap again to take it back (`voteForSong`). Suggesting a song votes for it. |
| Ranking | **Built, but not live.** `rankSongs` (`src/lib/site/song-rank.ts`): most votes, ties newest first. Computed once, on the server, at page load. |
| Live | **Not built.** Counts and order only change on reload. Spec 28 §6.2 *deliberately* froze the order so a row never moves under a thumb. Nothing in the app uses Supabase Realtime yet. |
| Fun | Only the placeholder joke ("Anything but Wonderwall"). |

Two facts that shape everything below:

- **Every guest page is a household's page now** (spec 28 Q18 — `/w/<slug>`
  is a 404). So every reader holds a token and every reader can vote. The
  "shared page can't vote" rule still exists in code but has no audience.
- **The song tables are closed to `anon`** (`0025`, `0027`): the public page
  reads them through the service role on the server. Anything "live" has to
  either keep that (the server pushes or is polled) or open a read path.

So the work is not "add voting". It is: **make the list move, give it a
shape worth watching, and give guests a reason to come back to it.**

## 3. The experience, end to end

A guest opens their invitation and scrolls to Music. They see:

```
  THE DANCE FLOOR CHART                       updated just now · 23 songs
  ┌──────────────────────────────────────────────────────────────────┐
  │  ♪ NOW PLAYING  [art] September · Earth, Wind & Fire             │
  │  1  ▲1  [art] Mr Brightside · The Killers    🔥     ▲ 14  Voted   │
  │  2  ▼1  [art] Valerie · Amy Winehouse   ♥ Couple's pick  ▲ 12  Vote│
  │  3  NEW [art] Dancing in the Moonlight · Toploader   ▲  9  Vote   │
  ├──────────────────────────────────────────────────────────────────┤
  │  4      [art] Shout · The Isley Brothers             ▲  6  Vote   │
  │  …                                                               │
  └──────────────────────────────────────────────────────────────────┘

  Request a song  [ 🔍 Anything but Wonderwall                     ]
                  [art] Wonderwall · Oasis
                  ↳ "That one's on the do-not-play list. Nice try."
                  Can't find it? Add it anyway

  Do not play:  ~~Wonderwall~~  ~~Chicken Dance~~  ~~Cotton Eye Joe~~
```

While they look, other households are voting; numbers tick and rows glide
into place. They come back a week later and see what moved since.

## 4. Part A — the list moves (live ranking)

### 4.1 How "live" gets to the page

| Option | What it is | Cost |
| --- | --- | --- |
| **A1. Polling (recommended)** | The open song block asks a small server action for `{id, votes, votedByViewer}` every ~15 s while the tab is visible, and once on focus. | No new infrastructure, no change to RLS; same service-role read the page already does. A dozen households watching at once is trivial load. "Live" means within 15 s, which at a wedding is live. |
| A2. Supabase Realtime broadcast | After each vote/suggestion the server broadcasts on a per-wedding channel; clients subscribe with the publishable key. | First use of Realtime in the app. A public channel's name is guessable, so either counts become readable by anyone who guesses it, or we need private channels with a minted JWT — new auth surface for a song list. |
| A3. Realtime on table changes | Clients subscribe to `song_votes` changes. | Needs `anon` read on the tables — reverses `0027`'s deliberate revoke. Not recommended. |

Recommend **A1**, with the endpoint shaped so swapping in A2 later changes
only the transport. Polling stops when the tab is hidden and backs off to
60 s after 10 minutes with no interaction.

### 4.2 Moving without voting for the wrong song

Spec 28 §6.2 froze the order for a real reason. "Live" reopens it; the rule
proposed to keep that reason intact:

- **Counts update in place immediately** (a small tick animation).
- **Rows re-order by animation** (FLIP: each row slides from old position to
  new over ~400 ms), **but never within 3 s of the viewer's own tap or
  scroll inside the list**. Updates that arrive during that window are held
  and applied when it ends.
- A tap is bound to the song id, never to a position, so even a row that
  moves mid-tap votes for the song the guest saw.
- `prefers-reduced-motion`: no slide — the list re-orders in one step, still
  respecting the 3 s hold.

### 4.3 What the chart shows

- **Position numbers**, and a **top three** set apart (a rule under row 3,
  slightly larger type). Not a literal podium graphic — it has to sit inside
  every theme.
- **Movement since your last visit**: ▲2 / ▼1 / NEW beside the position.
  Stored per browser (`localStorage`, the last ranking this viewer saw), so it
  costs no schema and is wrong only in harmless ways (new phone = everything
  reads as unchanged).
- **🔥 Hot**: the song with the most votes in the last 48 h, if it has at
  least 3. Needs `song_votes.created_at`, which already exists.
- **"updated just now · 23 songs"** in the header — the cheapest possible
  signal that the list is alive.
- **Long lists**: top 10 shown, "Show all 23" expands. A guest's own
  suggestions and votes are always findable (expanding scrolls to the first).

## 5. Part B — voting with some stakes

> **Dropped (Q3, Q4).** The planner kept voting as it is: one vote per
> household per song, no limit on songs, household size irrelevant. Nothing
> in this section is built. Kept below as the record of what was offered.

Today a household has unlimited votes (one per song). That makes voting
cheap and the ranking flat — everyone ▲s everything they like.

**Proposed: a vote budget.** Each household gets **N votes** (default 5,
planner-settable on the block, "unlimited" allowed). Spending one on a song
takes one from the budget; taking a vote back returns it. "You have 3 of 5
votes left" under the list; at zero, un-voted pills read "Out of votes" and
explain on tap that you can move one.

- Still one vote per household per song — no stacking all five on one song.
  (Stacking is an option; §9 Q3.)
- Enforced in `voteForSong` by counting the household's rows, **and** by a
  trigger, so the rule is in the database the way spec 25 put
  "household NOT NULL" there. No new table; a budget column on the block
  payload is read by the action.
- The suggester's automatic vote counts against the budget.

**Per household or per guest?** Today a household of four has the same voice
as a single guest. A per-guest vote needs to know *which* guest is holding
the phone, which the household page does not (it asks only at RSVP). Keep
per household; let the budget scale with household size instead
(`budget × attending guests`, falling back to invited guests). §9 Q4.

**No downvotes.** A visible ▼ on someone's suggestion at a wedding is a small
public rejection with their household's name next to it. The couple's
do-not-play list (Part C) is the only "no".

## 6. Part C — things that make it fun

Each is independent. **Q5 chose 1, 3 and 4; 2 was in regardless. 5 and 6
are out.**

1. **The do-not-play list.** The couple write a list of banned songs on the
   block ("Wonderwall", "Chicken Dance", "anything by Nickelback"). It shows
   to guests as a short struck-through list, and a suggestion that matches one
   (case-, punctuation- and "the"-insensitive title match, artist optional) is
   refused with a line the couple can write — default *"Nice try. That one's
   on the do-not-play list."* The placeholder joke becomes a real feature.
2. **"Already on the list — vote for it instead?"** The same normaliser
   catches duplicates: suggesting *mr brightside* when *Mr Brightside* exists
   offers one button that votes for the existing row. Today a duplicate
   becomes a second row and splits the votes, which quietly breaks the
   ranking — this one is close to a bug fix and is recommended regardless.
3. **Couple's pick.** The couple can star up to three songs as "Couple's
   pick" — badged, not ranked differently. Gives the couple a voice on the
   chart without overriding it.
4. **Now playing / Played on the night.** The planner already has a
   `played` status. On the wedding day, marking a song played (from
   `/site/songs`, on a phone) shows **"♪ Played at 9:42 pm"** on the guest's
   chart, and the most recent one as **Now playing** at the top for 5
   minutes. Guests who suggested it see "Your song was played." Needs one
   column, `song_requests.played_at timestamptz` — the wedding's own timezone
   for display, per the platform rule.
5. ~~**Voting closes, and the chart is revealed.**~~ *Not chosen.* An optional close date on
   the block (default: none). After it, pills disappear, the list freezes and
   the header reads "Final chart". Gives the DJ a fixed list and gives
   guests a moment.
6. ~~**A prompt per round**~~ *Not chosen.* — the couple pose a question ("Help us pick the
   last song of the night") with their own shortlist of 3–5 songs, separate
   from the open chart. Fun, but a second voting surface; recommended
   **later**, not now.

## 7. Part D — the couple's side (`/site/songs`)

Today: a flat list, newest first, with approve / played / ignore / delete.

- **Sort by rank** (the same `rankSongs`) by default, with vote counts and
  which households voted ("Okonkwo, Patel + 4"). Planner-only — guests see
  counts, not names (§9 Q6).
- **Couple's pick** — a ♥ toggle per row, capped at three. (The do-not-play
  list and its refusal line are edited in the block inspector, Q7.)
- **"Mark played" big-button mode** for the night: one tap per song, large
  targets, sorted by rank, played ones sink.
- **Export for the DJ**: CSV and a print view (rank, title, artist, votes,
  suggested by, couple's pick, do-not-play list at the bottom). A Spotify
  playlist export is out of scope (OAuth to a third party) — §8.
- **Merge duplicates**: pick two rows, keep one; votes move across (a
  household that voted both keeps one).

## 7a. Part E — song search with album art (Q8, Q8a, Q8b)

Reopens spec 25 §11's "no catalogue search", on the condition that made it a
cut: **the guest's browser never talks to a third party.** Spec 23 Q1's
reason stands — the page URL *is* the household's credential, and a referrer
or an image request would hand it, with the guest's IP, to someone else.

### 7a.1 The guest's side

- The song box becomes a search box (same placeholder, same joke). After
  ~300 ms without typing and at least 2 characters, up to 6 results appear
  under it: artwork, title, artist. Tap one to add it.
- A result already on the list reads **"Already on the list — ▲ vote"**; a
  result on the do-not-play list is shown struck through with the couple's
  refusal line, and can't be tapped.
- Under the results: **"Can't find it? Add it anyway"** opens today's title +
  artist fields (Q8b). Those rows have no artwork; the chart shows a plain
  ♪ tile in the theme's accent colour in its place.
- **No audio** (Q8a). Nothing plays; there is no preview button.

### 7a.2 Where the data comes from

- **The iTunes Search API** (`https://itunes.apple.com/search?media=music&entity=song`).
  No key, no account, no OAuth. Chosen over Spotify, whose search needs an app
  registration and a client-credentials token.
- **Our server calls it, never the browser.** A server action
  `searchSongs({ weddingSlug, token, query })` — token required, so only
  invited households can drive outbound requests; on the RSVP rate-limit
  counter, like `requestSong`.
- **Cache results** by normalised query for 24 h, in memory per instance.
  Apple throttles at roughly 20 requests a minute **per calling IP**, and on
  Vercel every guest shares our IPs, so one busy evening of searching could
  hit it. When throttled or down, search fails soft: "Search is having a
  moment — add it by hand" opens the fallback fields.
- **Artwork is proxied.** A route `GET /api/public/song-art?u=<url>` fetches through
  the existing hardened fetcher (`src/lib/net/fetch-image.ts` — SSRF checks,
  size caps), **only** for an allow-listed host pattern (`*.mzstatic.com`),
  at a fixed small size (100×100 in search, 160×160 on the chart), and
  returns it with long cache headers. The browser only ever loads our URL.
  Not `next/image` remote patterns: that also proxies, but ties artwork to
  Vercel's image-optimisation quota for a feature that needs one size.

### 7a.3 What gets stored

`song_requests` gains:

```sql
catalogue_id   text,   -- iTunes trackId, as text; null for typed-in songs
artwork_url    text,   -- the upstream mzstatic URL, served only via /api/public/song-art
```

- **Duplicate catch gets exact:** two picks with the same `catalogue_id`
  are the same song, so the second becomes a vote on the first. Typed-in
  songs still use the title/artist normaliser (§6 item 2), and a typed-in
  title that matches a searched row by normaliser also counts as a duplicate.
- A partial unique index on `(wedding_id, catalogue_id) where catalogue_id
  is not null` makes the duplicate rule hold in the database, not just in
  the action.
- `requestSong` re-validates a picked `catalogue_id` by looking it up
  server-side (`/lookup?id=`) rather than trusting the title, artist and
  artwork the client sends — otherwise a guest could post any title with any
  image URL, and the artwork proxy would be an open image relay.

### 7a.4 Risk worth naming

Apple's terms allow the Search API and artwork "to promote" the content.
A wedding song list linking nothing to the store is a grey area, not a
clear yes. If Apple ever changes or withdraws the API, the fallback fields
mean the section keeps working without artwork. Nothing is lost.

## 8. Considered and not recommended (now)

- **30-second previews** — declined (Q8a). Would need an audio proxy too, or
  hand guests' IPs to Apple.
- **Spotify search** — needs an app registration and token; iTunes doesn't.
- **Realtime via table subscriptions** (A3): re-opens `anon` reads on tables
  `0027` closed on purpose.
- **Downvotes** — §5.
- **Anonymous / cookie votes** — moot now that every page is a household's,
  and still wrong for the reason spec 25 gave.
- **Embedding a live Spotify playlist that guests add to directly** — the
  `playlist` block already links one; collaborative Spotify editing needs
  every guest to have a Spotify account.

## 9. Open questions (all answered — see top)

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Live updates by **polling every ~15 s** (A1) or **Realtime** (A2)? | A1. |
| 2 | Rows **slide into their new place** with the 3 s hold after a tap (§4.2), or keep spec 28's **no re-sort until reload** and only tick the numbers? | Slide, with the hold. This is what "live ranking" means. |
| 3 | **Vote budget**: how many per household (default 5?), and can a household stack several on one song? | 5, planner-settable, no stacking. |
| 4 | Budget **per household flat**, or **scaled by guests** in the household? | Scaled by attending guests (invited until they RSVP). |
| 5 | Which of Part C's fun features: **1** do-not-play, **2** duplicate catch, **3** couple's pick, **4** played on the night, **5** voting closes, **6** rounds? | 1, 2, 4 now; 3 and 5 are small, include if wanted; 6 later. |
| 6 | Should **guests see who voted** for a song (household names), or only counts? | Counts only for guests; names for the couple. |
| 7 | Where do the new settings live — **block inspector**, `/site/songs`, or both? | Block inspector. |
| 8 | **Song search with album art** (server-side iTunes lookup, artwork proxied) — follow-up spec 31.1, or not at all? | 31.1, after this ships. |
| 9 | The section's **name on the page**: keep "Songs" / "What everyone's picked", or "The Dance Floor Chart" (editable either way)? | Planner's call — default heading is already editable per block. |

## 10. Shape of the build (once answered)

No new tables. Likely one migration:

```sql
-- 0035_song_chart.sql (sketch) — additive columns, no enum, so no 55P04 split
alter table public.song_requests
  add column played_at    timestamptz,
  add column couples_pick boolean not null default false,
  add column catalogue_id text,
  add column artwork_url  text;
create unique index song_requests_catalogue_key
  on public.song_requests (wedding_id, catalogue_id)
  where catalogue_id is not null;
-- couple's pick capped at three per wedding: checked in the action
-- (a trigger is possible but three is a UI nicety, not an integrity rule).
```

The do-not-play list and the refusal line live on the `song_requests` block
payload (`src/lib/site/block-schemas.ts`), like the placeholder already does.
The block's default heading becomes "Request a song" for new blocks
(`src/lib/site/blocks.ts`).

Build order, each step shippable alone:

1. **Duplicate catch + do-not-play** — `src/lib/site/song-match.ts` (the
   normaliser, unit-tested), wired into `requestSong`; the block inspector
   fields; the struck-through list on the page.
2. **Live** — a `getSongChart` read and the polling hook; numbers tick.
3. **Motion** — FLIP re-order with the hold; movement/NEW/🔥 badges.
4. **Search and artwork** — `searchSongs`, the result cache, `/api/public/song-art`
   with its host allow-list, `catalogue_id` duplicates, the fallback fields.
5. **The night** — `played_at`, Now playing, Played badges, big-button mode.
6. **`/site/songs`** — rank sort, voters, couple's pick, merge, CSV/print export.

## 11. Test plan

- Unit: the normaliser (case, punctuation, leading "the", feat./remaster
  suffixes), do-not-play matching, movement-since-last-visit diff, the
  iTunes response parser (from a saved fixture, not the live API), the
  artwork host allow-list (rejects anything not `*.mzstatic.com`, including
  look-alikes), `rankSongs` unchanged.
- SQL (`supabase/tests/`): the catalogue unique index refuses a second row
  with the same `catalogue_id` in one wedding but allows it across two;
  cross-wedding vote still refused; `anon` still has no read on
  `song_requests`.
- The live iTunes API is **not** called from `npm test`. Whether this
  container or Vercel can reach it at all is checked by hand, once, and
  said so.
- Typecheck, `npm test`, `verify-migrations.sh`, `npm run build`.
- **In a browser, which this feature needs more than most**: two phones on
  two households' links, voting at once — numbers arriving within ~15 s,
  rows sliding but never under a finger mid-tap, reduced-motion respected.
  The motion rule cannot be verified any other way.

## Build status — 2026-10-10

Built in one session, all six steps of §10.

| Piece | Where |
| --- | --- |
| Migration | `0035_song_chart.sql` — `played_at` (+ trigger following `status`), `couples_pick`, `catalogue_id` (digits), `artwork_url` (checked to `*.mzstatic.com`), partial unique index on `(wedding_id, catalogue_id)`. `supabase/tests/18_song_chart.sql`, 15 assertions. |
| Matching | `src/lib/site/song-match.ts` — one normaliser for duplicates and the ban list; `parseDoNotPlay`, `isBanned` (stricter than `sameSong`). |
| Catalogue | `src/lib/site/song-catalogue.ts` (parse, host allow-list, sizes) and `src/server/songs/catalogue.ts` (fixed-host fetch, 24 h in-memory cache, search results pre-seed the lookup cache). |
| Chart rules | `src/lib/site/song-chart.ts` — hot, now playing, movement, the 3 s hold. |
| Actions | `src/server/actions/songs.ts` — `requestSong` (outcomes `added` / `voted` / `duplicate` / `banned`), `searchSongs`, `refreshSongChart`, `setCouplesPick`, `mergeSongs`. |
| Reads | `getPublicSongs` (shared by the page and the poll) and `getPlannerSongs` in `src/server/queries/site-extras.ts`. |
| Artwork proxy | `src/app/api/public/song-art/route.ts`. |
| Guest UI | `song-section.tsx` (polling, optimistic votes, do-not-play list), `song-list.tsx` (chart, FLIP, badges), `song-requests.tsx` (search + by-hand fallback). |
| Couple's UI | `/site/songs` (ranked, voters, ♥, merge, "On the night" mode), `/site/songs/print`, `/api/export/songs`. |

**Departures from the text, and why:**

1. **The proxy lives at `/api/public/song-art`, not `/api/song-art`.** The
   middleware sends every path not in `src/lib/public-paths.ts` to `/login`;
   `/api/public` is the prefix that exists for routes that scope themselves.
   A test in `public-paths.test.ts` pins it.
2. **A fuzzy duplicate asks; an exact one (same `catalogue_id`) just votes.**
   §6.2 said "offer a button", §7a.3 said "becomes a vote". Both are kept, by
   confidence: a title match without the artist can be a different song.
3. **The do-not-play refusal is an answer, not an error** (`outcome:
   "banned"`), so it renders as the couple's joke rather than in red.
4. **The ban list a guest is held to is the PUBLISHED block's.** A ban typed
   in the editor and not published doesn't refuse anyone. The DJ print view
   reads the draft (it is the couple's own copy).
5. **"Request a song" is the default heading for every Song requests block
   that has no title of its own, not only new ones** — the default is read at
   render time, so there was no way to change it for new blocks only without
   writing a heading into every existing payload. No real wedding has
   published one yet.
6. **On a first visit, movement badges compare with the ranking at page
   load**, so a first-time guest still sees what moved while they watched.
7. **A refused poll stops polling.** A refused poll is a failed token
   attempt on the RSVP throttle; a forgotten tab on a reissued link would
   otherwise lock its household's IP out of replying.
8. **No vote budget** (Q3/Q4) — nothing in §5 was built.

**Verified:** typecheck clean; 991 unit tests (38 new); `verify-migrations.sh`
523 SQL assertions (15 new); `next build` with placeholder env.

**Not verified, and worth doing first:**

- **Apple's API was never called.** `itunes.apple.com` and `*.mzstatic.com`
  are blocked by this session's network policy, so the parser was tested
  against a fixture written from the documented response shape, not a
  captured one. Search could fail on the first real call; if it does, the
  form falls back to the by-hand fields.
- **Nothing was opened in a browser.** The slide-into-place animation, the
  3 s hold, the count tick, the search dropdown on a phone keyboard, and the
  night mode are all unseen.
- **Nothing ran against Supabase** — and `0026`–`0035` are still not applied
  to the live project.
- Two phones on two households' links, voting at once, is the test §11 asks
  for and the only way to check the hold.
