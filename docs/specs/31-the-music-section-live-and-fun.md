# Feature spec: The music section — a live chart guests play with

**Status: proposal (2026-10-10). Asked for as a spec — nothing is built.**
Open questions are in §9; nothing beyond this file is touched until they are
answered *and* the planner says to build.

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
  │  1  ▲1  Mr Brightside · The Killers         🔥     ▲ 14  Voted   │
  │  2  ▼1  September · Earth, Wind & Fire              ▲ 12  Vote   │
  │  3  NEW Dancing in the Moonlight · Toploader        ▲  9  Vote   │
  ├──────────────────────────────────────────────────────────────────┤
  │  4      Valerie · Amy Winehouse                     ▲  6  Vote   │
  │  …                                                               │
  └──────────────────────────────────────────────────────────────────┘
  You have 3 of 5 votes left.

  Suggest a song  [ Anything but Wonderwall      ] [ Artist ] [Add]
  ↳ "Wonderwall" is on the couple's do-not-play list. Nice try.
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

Each is independent; §9 Q5 picks which.

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
5. **Voting closes, and the chart is revealed.** An optional close date on
   the block (default: none). After it, pills disappear, the list freezes and
   the header reads "Final chart". Gives the DJ a fixed list and gives
   guests a moment.
6. **A prompt per round** — the couple pose a question ("Help us pick the
   last song of the night") with their own shortlist of 3–5 songs, separate
   from the open chart. Fun, but a second voting surface; recommended
   **later**, not now.

## 7. Part D — the couple's side (`/site/songs`)

Today: a flat list, newest first, with approve / played / ignore / delete.

- **Sort by rank** (the same `rankSongs`) by default, with vote counts and
  which households voted ("Okonkwo, Patel + 4"). Planner-only — guests see
  counts, not names (§9 Q6).
- **Do-not-play list, couple's picks, vote budget, close date** — edited here
  and mirrored in the block inspector, or block only (§9 Q7 — recommend
  block inspector, since every other block setting lives there).
- **"Mark played" big-button mode** for the night: one tap per song, large
  targets, sorted by rank, played ones sink.
- **Export for the DJ**: CSV and a print view (rank, title, artist, votes,
  suggested by, couple's pick, do-not-play list at the bottom). A Spotify
  playlist export is out of scope (OAuth to a third party) — §8.
- **Merge duplicates**: pick two rows, keep one; votes move across (a
  household that voted both keeps one).

## 8. Considered and not recommended (now)

- **Catalogue search, album art and 30-second previews** (iTunes Search /
  Spotify). The single biggest "fun" upgrade visually, and spec 25 §11 cut it
  for a real reason: the guest's browser would talk to a third party from a
  page whose URL is the household's credential (spec 23 Q1). A version that
  fits the rule exists — our server queries the iTunes Search API (no key
  needed) and proxies artwork, so the browser never contacts Apple — but it
  is a new outbound dependency and roughly doubles this spec. **§9 Q8 asks
  whether to take it on as spec 31.1.**
- **Realtime via table subscriptions** (A3): re-opens `anon` reads on tables
  `0027` closed on purpose.
- **Downvotes** — §5.
- **Anonymous / cookie votes** — moot now that every page is a household's,
  and still wrong for the reason spec 25 gave.
- **Embedding a live Spotify playlist that guests add to directly** — the
  `playlist` block already links one; collaborative Spotify editing needs
  every guest to have a Spotify account.

## 9. Open questions

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
-- 0035_song_chart.sql (sketch)
alter table public.song_requests add column played_at timestamptz;
alter table public.song_requests add column couples_pick boolean not null default false;
-- vote-budget trigger on song_votes: counts the household's rows for the
-- wedding and refuses the insert past the budget passed via the block payload
-- (or a weddings-level column, if Q7 moves settings off the block).
```

Do-not-play list, budget, close date and the refusal line live on the
`song_requests` block payload (`src/lib/site/block-schemas.ts`), like the
placeholder already does.

Build order, each step shippable alone:

1. **Duplicate catch + do-not-play** — `src/lib/site/song-match.ts` (the
   normaliser, unit-tested), wired into `requestSong`.
2. **Live** — a `getSongChart` read and the polling hook; numbers tick.
3. **Motion** — FLIP re-order with the hold; movement/NEW/🔥 badges.
4. **Vote budget** — action + trigger + "3 of 5 left".
5. **The night** — `played_at`, Now playing, Played badges, big-button mode.
6. **`/site/songs`** — rank sort, voters, merge, CSV/print export.

## 11. Test plan

- Unit: the normaliser (case, punctuation, leading "the", feat./remaster
  suffixes), budget arithmetic, movement-since-last-visit diff, `rankSongs`
  unchanged.
- SQL (`supabase/tests/`): the budget trigger refuses the N+1th vote, allows
  it after a take-back; cross-wedding vote still refused; `played_at`
  readable by the service-role path only.
- Typecheck, `npm test`, `verify-migrations.sh`, `npm run build`.
- **In a browser, which this feature needs more than most**: two phones on
  two households' links, voting at once — numbers arriving within ~15 s,
  rows sliding but never under a finger mid-tap, reduced-motion respected.
  The motion rule cannot be verified any other way.
