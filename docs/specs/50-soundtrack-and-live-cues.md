# Feature spec: The soundtrack — plan the day's music, run it from a phone

**Status: spec — open questions below. Nothing is built.** No migration, no
code. Build starts only on an explicit "build it" after §12 is answered.

**Depends on:** spec 5 (run sheet, for the optional time shown on a moment),
spec 9 (the private-bucket storage pattern), spec 34 (the catalogue search
and artwork proxy, reused for artwork only), spec 43/44 (who can plan),
spec 45 (everything works without dragging), spec 48 (phone rules).

## 1. What was asked

> *"Let's write a spec — I want this as a feature. Think planning in PC,
> iPad, phone, but control in phone mainly and maybe iPad."*

With six reference screens and a feature list: a timeline of parts
(Ceremony, Cocktail hour, Dinner, Dance floor) each holding moments
(Prelude, Processional, Grand entrance…); songs trimmed to a start and end;
automatic fades; spoken MC announcements in the sequence; one big "fade to
next cue" button a non-technical helper can run; Apple Music and uploaded
files as sources; works with no signal at the venue; guards against the
lock screen skipping a track.

## 2. The shape of it

Two surfaces, two kinds of device:

| Surface | Where | Device | Who |
| --- | --- | --- | --- |
| **Plan** — `/soundtrack` | planner app, "The day" group, beside Events & run sheet | laptop, iPad, phone | couple, planner |
| **Run** — `/soundtrack/live` and the helper link | full-screen, no app chrome | **phone first**, iPad | whoever holds the phone plugged into the speaker |

**The device that shows the Run screen is the device that makes the sound.**
There is no remote control between devices: an iPad does not drive a phone.
One phone, one cable or Bluetooth link to the venue's speaker.

## 3. What a couple builds (data)

```
part      Ceremony · Cocktail hour · Dinner · Dance floor     (ordered)
 └ moment Prelude songs · Ceremony starting · Processional…   (ordered)
    └ item  a song (a track + trim + fades) or an announcement (ordered)
track     an uploaded audio file, reusable by any item
```

- **A part** has a name, a one-line description, an icon, and a **mode**:
  - `sequence` (Ceremony): moments play in order. The big button is
    **Fade to next cue**.
  - `background` (Cocktail hour, Dinner, Dance floor): one playlist moment is
    the bed and plays continuously; every other moment is a **special
    moment** (Grand entrance, Toast). Playing a special moment fades the bed
    out and remembers where it was; when the special moment ends, the bed
    fades back in from that point. The big button is **Next special moment**;
    a **Resume playlist** button sits over the bed while a special plays.
- **A moment** is a `playlist` (several songs that run on by themselves, in
  order, last one ends → silence or loop, per moment) or a `cue` (one or
  more items played once, in order — Announcement then Song is one cue).
- **A song item** points at a track and carries `start_ms`, `end_ms`,
  `fade_in_ms` (default 2000), `fade_out_ms` (default 3000). The file is
  never changed; trim and fades are applied while playing.
- **An announcement item** carries a script (up to 700 characters, always
  stored) and an audio track (recorded or uploaded, §5). Its script is shown
  on the Run screen, so if the audio is missing the helper can read it out.
- **A track** is one audio file in the wedding's private bucket, with title,
  artist, duration and optional artwork. One track can sit in several items
  with different trims.

**Starting template.** An empty soundtrack offers "Start from our template":
the 12 moments of the reference list in four parts (Ceremony: Prelude songs,
Ceremony starting announcement, Wedding party processional, Bride
processional, Recessional · Cocktail hour: playlist, Grand entrance · Dinner:
playlist, Speeches & announcements · Dance floor: First dance, Parent dances,
Open dance floor, Private last dance). Every one can be renamed, reordered,
deleted, or added to. Created by an action, not seeded by the migration.

**Progress.** A part's percentage is moments with at least one playable item
÷ moments. "Playable" means every item in it has audio; an announcement with
only a script counts as not ready.

## 4. Plan — `/soundtrack` (laptop, iPad, phone)

- **Parts list** (reference screen 1): one card per part — icon, name,
  description, progress bar and %, ⋯ menu (rename, mode, move up/down,
  delete). "+" adds a part. Tap a card to open it.
- **A part** (screens 2–3): one card per moment — name, description, its
  items (artwork, TITLE – ARTIST, `0:37 – 1:29` when trimmed), ✎ and ✕ per
  item, **+ Add song**, **+ Announcement**, total time for playlists. If the
  moment is linked to a run sheet item (§12 Q6), its planned time shows
  beside the name. Reorder items and moments with the drag handle **and**
  with ⋯ → Move up / Move down (spec 45).
- **Add song**: choose an existing track, or upload one or more files.
  Accepted: MP3, M4A/AAC, WAV; up to 60 MB each (§12 Q4 for the wedding's
  total). The title and artist come from the file's tags, else the file name,
  and are editable. **Find artwork** searches the catalogue (spec 34's server
  search and `/api/public/song-art` proxy) for a cover only — no audio comes
  from it.
- **Uploads go straight from the browser to Storage** through a signed
  upload URL issued by a server action, because a server action body is
  capped at ~4.5 MB on Vercel. The browser reads the duration before
  uploading; the action that saves the track re-checks size and type.
- **Edit a song** (✎) — a sheet: waveform, start and end handles, the
  times as editable fields (`m:ss.s`) for anyone not dragging, fade-in and
  fade-out in seconds (0–10), **▶ from start** and **▶ last 10 s** to hear
  the cut and the fade, and "Use for every item with this track?" when the
  track is used more than once.
- **Test your cues** (sticky button, screens 2–3): opens the Run screen for
  this part in **rehearsal** mode — same engine, same buttons, a "Rehearsal"
  banner, nothing remembered afterwards.

## 5. Announcements

The reference screen generates a voice from text with a choice of host and
delivery style. That needs a paid text-to-speech provider, a new third
party, an API key and a per-character cost — §12 Q3. Independent of that
answer:

- **Script first.** Every announcement has its script, edited on the
  "Create announcement" sheet with a 700-character counter.
- **Record it** in the browser (hold to record, play back, keep or redo) —
  the best man, a parent, or the couple themselves. Stored as a track.
- **Upload it** — any accepted audio file.
- The Run screen shows the script under the announcement while it is next
  or playing.

## 6. Run — the live screen (phone first, iPad)

Full screen, large type, no tab bar or header. Reference screens 5–6.

```
 ‹                 ▷ Cue the ceremony
           Tap a moment to go straight there.
 ┌──────────────────────────────────────────┐
 │ ♫ Prelude songs              Now playing │
 │   [art] BIRDS OF A FEATHER – GEMINI…     │
 │   [art] LOVER – TAYLOR SWIFT             │
 └──────────────────────────────────────────┘
 │ 🎤 Ceremony starting announcement   Next │
 │   "Good evening everyone, the ceremony…" │
 │ ♥ Wedding party processional              │
 ……
 ┌───────────────────────┐ ┌────────────┐
 │ ✦  Fade to next cue    │ │ ⏸  Pause    │   ← pinned, ≥ 64 px tall
 └───────────────────────┘ └────────────┘
          → Continue to cocktail hour
 For smooth playback, use these controls, not the lock screen.
```

- **Fade to next cue** (sequence) / **Next special moment** (background):
  the playing item fades out over its fade-out, then the next moment starts
  with its fade-in. Pressed during a fade, it does nothing (no double skip).
- **Pause / Play**: a 0.5 s fade either way; position kept.
- **Tap a moment** to jump there (§12 Q2 for one tap or two).
- **Continue to <next part>**: fades out, opens the next part, starts its
  first moment (background parts: the bed).
- **Now playing** badge, a thin progress line inside the playing item
  (elapsed of the trimmed length), **Next** badge on what the big button
  will play.
- **Interruptions** (a call, an alarm, a Bluetooth speaker dropping): the
  screen shows **Paused** with the reason it can tell, keeps its place, and
  never resumes by itself.
- **Reload-safe.** Part, moment, item and position are saved on the device
  every second; reopening the screen offers "Resume Dinner playlist at
  Song 4, 1:12".
- **Lock screen and headphone buttons** (Media Session): Play/Pause map to
  Pause; Next maps to Fade to next cue; Previous and seeking are switched
  off. The line under the buttons stays, because how far iOS honours this
  from a web page is unverified (§11).
- **Screen stays on** while the Run screen is open (Wake Lock), on by
  default with a toggle; re-requested when the screen comes back to the
  front.
- **iPad**: the same screen; in landscape the moment list and the buttons
  sit side by side, buttons on the right.

## 7. Works with no signal

- **Download for the day** (a button on `/soundtrack` and on the Run
  screen's ready check): saves every track the soundtrack uses, plus the
  plan itself, onto this device (Cache Storage / IndexedDB). Shows
  `42 of 42 · 312 MB · ready`. Asks the browser for persistent storage.
- **A service worker scoped to the Run screen only** serves the screen
  itself when offline, so a reload at a venue with no signal still opens it.
  The rest of the planner app keeps no offline copy.
- **Out-of-date warning.** If the plan changed after this device downloaded
  it, the Run screen says "3 changes since you downloaded — update now?"
  while online. Offline, it plays what it has.
- **Ready check** (before going live, one screen): all audio on device;
  storage kept; screen-stay-on works; added to Home Screen (recommended on
  iPhone — Safari clears site data from un-installed sites after weeks of
  non-use); and a reminder list: charger in, Do Not Disturb on, phone volume
  up, notification sounds off, test the speaker cable.

## 8. Who can run it

- **Couple and planner**: `/soundtrack/live` from their own login.
- **A helper without an account** — the friend who runs it on the night:
  §12 Q1. Recommended: a **helper link** (`/cue/<token>`), made and revoked
  on `/soundtrack`, that opens the Run screen and the ready check for this
  wedding and nothing else: it cannot edit, see guests, or reach the planner
  app. Same token discipline as guest links (hashed at rest, revocable, on
  the existing rate limit).

## 9. Sources

- **Uploaded files: in.** The only source that allows fades on an iPhone
  from a web page, trimming at exact points, and playing with no signal.
  The couple is responsible for having the right to play what they upload;
  nothing uploaded is ever shown or served to guests.
- **Apple Music: not in this spec** (§12 Q5). Three reasons, each sufficient:
  1. *Offline.* Apple Music streams are DRM-protected and cannot be saved
     for offline play by a web page, so §7 fails for every such song.
  2. *Fades on iPhone.* iOS Safari ignores a web page's volume setting on
     audio; fades work only by routing audio through the Web Audio graph,
     which DRM streams cannot enter. On an iPhone, Apple Music songs would
     start and stop at full volume.
  3. *Cost and setup.* MusicKit on the web needs an Apple Developer
     membership, a signing key on the server, and every helper's phone
     signed in to an Apple Music subscription.
  A native iOS app would remove 1 and 2; that is a different product.
- **Spotify: out.** Its playback terms and SDK allow none of trim, custom
  fades or offline. Rejected for good.

## 10. How it plays (engineering)

- **Pure logic in `src/lib/soundtrack/`**, unit-tested: the player state
  machine (`idle → playing → fading → playing | paused | finished`) as a
  reducer of events (`fadeToNext`, `jumpTo`, `pause`, `resume`,
  `itemEnded`, `interrupted`, `continuePart`), queue resolution per mode
  (including the background bed's saved position), progress %, total time,
  trim validation (`0 ≤ start < end ≤ duration`, fades ≤ half the trimmed
  length), the plan-version diff for the out-of-date warning.
- **One browser adapter** turns states into sound: an `<audio>` element per
  playing item, routed through a Web Audio `GainNode`. Fades are scheduled
  on the audio clock (`linearRampToValueAtTime`), not JavaScript timers, so
  a throttled background tab still fades on time. The end point is watched
  on the audio clock and the fade-out starts `fade_out_ms` before `end_ms`.
- **The next item is pre-loaded** (seeked to its `start_ms`, paused, gain 0)
  so the big button starts it with no gap. Whole songs are not decoded into
  memory: a decoded 4-minute stereo song is ~85 MB.
- **Announcements and short items (< 60 s)** may be decoded in full for
  exact starts.

### Data (sketch, one migration)

```sql
-- 0048_soundtrack.sql (sketch)
create table public.soundtrack_tracks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  storage_path text not null,           -- soundtrack/<wedding>/<uuid>.<ext>
  title text not null, artist text,
  duration_ms integer not null check (duration_ms > 0),
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null check (mime_type in ('audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav')),
  catalogue_id text, artwork_url text,  -- same rules as song_requests (0037)
  kind text not null default 'music' check (kind in ('music','announcement')),
  created_at timestamptz not null default now(), unique (id, wedding_id));
create table public.soundtrack_parts (
  id, wedding_id, name, description, icon,
  mode text check (mode in ('sequence','background')),
  sort_order, created_at, updated_at, unique (id, wedding_id));
create table public.soundtrack_moments (
  id, wedding_id, part_id → parts (id, wedding_id) on delete cascade,
  name, description, icon,
  kind text check (kind in ('playlist','cue')),
  is_bed boolean default false,          -- at most one per part (partial unique index)
  loop boolean default false,            -- playlists only
  run_sheet_item_id → run_sheet_items (id, wedding_id) on delete set null,  -- if Q6
  sort_order, ...);
create table public.soundtrack_items (
  id, wedding_id, moment_id → moments (id, wedding_id) on delete cascade,
  kind text check (kind in ('song','announcement')),
  track_id → tracks (id, wedding_id) on delete restrict,   -- null: announcement not yet recorded
  script text check (char_length(script) <= 700),
  start_ms integer, end_ms integer, fade_in_ms integer default 2000, fade_out_ms integer default 3000,
  check (kind = 'announcement' or track_id is not null),
  check (start_ms >= 0 and end_ms > start_ms),
  sort_order, ...);
create table public.soundtrack_helper_links (id, wedding_id, token_hash, label, created_at, revoked_at);
-- all five join RLS tenant_tables and the audit list (0035)
```

- A track still used by an item can't be deleted (`restrict`); the UI says
  where it is used. Deleting an unused track deletes its object too.
- Storage: the existing private bucket under a `soundtrack/` prefix,
  service-role only, paths built from uuids (spec 9's rule); the browser
  gets signed URLs for upload and download.
- The JSON backup (spec 32) includes the rows, not the audio files.

## 11. Risks that only a real device answers

Nothing here is knowable from typecheck, tests or headless Chromium:

- Does audio keep playing, and do Web Audio fades keep time, when an iPhone
  locks or switches app mid-song — in Safari and installed to Home Screen?
- Does iOS route lock-screen Next to our handler, or skip natively?
- Does Wake Lock hold on the iOS version in use?
- Does an iPhone keep 300+ MB of downloaded audio for a week before the day?

Build step 3 is therefore a **spike on a real iPhone and iPad** before the
rest is built on it. If background playback fails, the Run screen's
fallback is "keep this screen open" (Wake Lock) — already the default.

## 12. Open questions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | **How does a helper without an account run it?** (a) a helper link, Run screen only; (b) give them planner access (they see everything); (c) they use the couple's login on their phone. | (a). |
| 2 | **Tapping a moment on the Run screen**: (a) one tap fades over and plays it (as the reference says); (b) first tap marks it **Next** and shows "Play now", second tap plays. | (b). A scroll that lands as a tap must not start the bride's processional early. The big button stays one tap. |
| 3 | **Spoken announcements**: (a) record or upload only; (b) also generate a voice from the script with a paid text-to-speech service (voice + style, as the reference shows) — a new provider, key and per-use cost; (c) (a) now, (b) as a follow-up spec. | (c). |
| 4 | **Storage cap per wedding** for audio. Every wedding shares one Supabase project's storage. | 500 MB (about 120 songs as MP3/AAC), shown as a meter; WAV counts at its real size. |
| 5 | **Apple Music** (§9): (a) leave out; (b) a follow-up spike to test MusicKit on the web on an iPhone, knowing offline cannot work; (c) a native app. | (a), revisit only on a planner request. |
| 6 | **Link moments to run sheet items** to show the planned time ("Processional · 2:00 pm")? Display only — the music never starts by the clock. | Yes, optional per moment. |
| 7 | **Pull guest song requests in**: a "From guest requests" source in Add song that lists the chart's top songs (spec 34) as placeholders needing a file. | Yes, in step 2 — cheap, and links the two music features. |
| 8 | **Name in the nav**: "Soundtrack", "Music on the day", or other. | "Soundtrack", under The day. |

## 13. Build order (once answered)

Each step ships alone.

1. **Schema + Plan screens**: migration, SQL tests, parts/moments/items CRUD,
   template, uploads via signed URL, tracks, progress. No playback.
2. **Song editor + rehearsal playback**: `src/lib/soundtrack/` engine and
   tests, the browser adapter, waveform/trim/fades sheet, Test your cues.
   Guest requests source (if Q7).
3. **Real-device spike** (§11), reported before step 4.
4. **Run screen**: phone and iPad layouts, Media Session, Wake Lock,
   interruption handling, reload-safe position.
5. **Offline**: Download for the day, scoped service worker, ready check,
   out-of-date warning.
6. **Helper link** (if Q1 a).
7. **Announcements**: script sheet, record in browser, upload.

## 14. Test plan

- Unit: the state machine over every event in every state (including
  fade-to-next during a fade, special moment then resume bed at the saved
  position, last moment of the last part), trim and fade validation,
  progress %, total time, plan-version diff, template contents.
- SQL (`supabase/tests/`): RLS across two weddings on all five tables;
  `restrict` on a used track; one bed per part; script length; `anon` has
  no access; helper token lookup only through its function.
- Typecheck, `npm test`, `verify-migrations.sh`, `npm run build`.
- Headless Chromium at phone and iPad sizes: layout, the pinned buttons,
  the trim sheet without dragging.
- **A real iPhone and iPad, with a Bluetooth speaker, in airplane mode**:
  a full ceremony and a cocktail hour with two specials, the screen
  locked once, one reload with no signal, one incoming-call interruption.
  This is the only test that says the feature works.
