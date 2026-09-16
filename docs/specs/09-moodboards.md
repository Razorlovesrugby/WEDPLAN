# Feature spec: Moodboards, publicly shareable

**Status: BUILT, session 17 (2026-09-16), on the planner's direct word.** The
planner asked for the Chrome clipper and the Pinterest API and said they were
creating a Pinterest account, which settled §12's scope questions; the rest
were built to this file's own recommendations, listed in `docs/HANDOFF.md`
session 17 so nobody re-derives them. `0013_moodboards.sql`, `v_moodboards`,
`src/lib/moodboards.ts`, `src/lib/supabase/storage.ts`,
`src/server/{queries,actions,moodboards}/`, `/moodboards`,
`/moodboards/[id]`, `/m/[token]`, the `/w` and `/rsvp/[token]` sections, and
`scripts/ensure-bucket.mjs`.

**One answer here was later reversed:** §12.3 recommended no server-side URL
fetching this pass. Spec 9.1 reverses it — the clipper cannot work without it
— and confines it to `src/lib/net/fetch-image.ts`.

**Not verified against anything real:** no Supabase project, no bucket, no
browser. See `docs/HANDOFF.md` session 17.

**Depends on:** V1 only (`weddings`, `events`, and the public RSVP path this
reuses the token pattern from). It does not depend on specs 1–8, does not
read `budget_items`, `lists`, `vendors`, `guests` or `households`, and the
only existing rows it writes are `nav` entries and — if §5's inline
publication is taken — a new read on `/rsvp/[token]` and `/w`.

**This is the first feature in the project that needs Supabase Storage.**
Spec 8 explicitly refused file uploads on the grounds that "no storage bucket
is configured for this project and configuring one is its own piece of work
(auth rules, size limits, virus posture, a retention story)". That work is
§3 of this spec, because a moodboard with no images is not a moodboard.

---

## 1. What this is

A moodboard is a titled grid of images, with a caption on each, that can be
handed to exactly one audience over a link that needs no account:

- **The photographer.** "This is the light we like, these are the group shots
  that matter, this is the getting-ready vibe." Today this is a Pinterest
  board they can't see, a WhatsApp thread of screenshots, or an email with
  eleven attachments.
- **The guests.** "This is what we mean by 'garden party formal'." A dress
  code is a sentence that everybody reads differently and a picture that
  nobody does.
- **Everyone else who needs the vibe rather than the numbers** — florist,
  stylist, cake maker, the friend doing the table styling.

The platform spec files photo uploads under "V4 and later, only if you want
to" (`docs/wedding-platform-spec.md`), and a vendor-facing token link under
the same heading. This spec pulls both forward, for the same reason spec 6
pulled the money half of V2 forward ahead of the vendor half: the planner
asked for it, and the small version is genuinely small — one bucket, three
tables, two screens and a public page.

**What makes it worth schema rather than a shared Google Drive folder:** the
share link is per-board and revocable, the planner's private notes on an
image ("this is the shot I actually care about") can be shown to the
photographer and hidden from guests off one flag, and the dress-code board
can appear *inside the RSVP page a guest is already looking at* instead of
being a second link they have to keep.

## 2. Scope

**In:**

- **Boards.** Many per wedding: title, a short description that renders above
  the grid, an optional `event_id`, a cover image, archive/restore.
- **Items.** Many per board: an uploaded image (§3, §4), a caption shown to
  everybody, a **private note** shown only where a share says to (§5), an
  optional `source_url` and `credit` for attribution, drag-to-reorder, one
  flagged cover.
- **Uploads that are actually usable on a phone**: pick from the camera roll,
  drag a file in, or paste a screenshot straight from the clipboard, which is
  how images arrive in practice. Two derivatives per image — a display copy
  and a thumbnail — both produced in the browser, never on the server (§4).
- **Shares, three channels off one table** (§5):
  - `link` — an unguessable token at `/m/{token}`, one or many per board, each
    with its own label ("Anna — photographer"), its own notes flag, its own
    expiry, individually revocable. Revoking the photographer's link does not
    disturb the one you sent your mum.
  - `public_site` — the board renders on `/w`, for a dress code everybody
    should see.
  - `rsvp` — the board renders inside `/rsvp/{token}`, where a guest is
    already answering, which is exactly where "what do I wear" gets asked.
- **A viewer page that is a page, not the app**: no nav, no login prompt, no
  planner chrome, `noindex`, a click-to-enlarge lightbox, credits under the
  grid.
- **Whether it was opened.** `view_count` and `last_viewed_at` per share, so
  "did the photographer ever look at this" is answerable. No IP, no user
  agent, no per-view row (§9).
- `/moodboards`, `/moodboards/[id]`, `/m/[token]`, and a "Moodboards" entry in
  `Nav`.

**Out, explicitly:**

- **No comments, reactions or votes from viewers.** A guest cannot heart an
  outfit and the photographer cannot reply under an image. That is an
  anonymous write path with moderation, spam and abuse attached; the RSVP flow
  proves this app can do one safely, and it took a throttle, a hashed token
  and a page of reasoning. Not for this pass (§12.6).
- **No fetching images from a URL you paste.** Rehosting somebody else's
  image by URL means the server makes an outbound request to an address the
  user chose, which is an SSRF surface with a genuine list of rules attached
  (§12.3). Upload from the device in this pass.
- **No image processing on the server.** No `sharp`, no transform pipeline,
  no Supabase image transformations (a paid-plan feature). The browser that
  has the file already has a canvas.
- **No albums, galleries or guest photo uploads.** Nobody but a signed-in
  collaborator ever writes an image. A guest-facing upload surface is a
  different feature with a different threat model (`docs/wedding-platform-spec.md`,
  V4: "Photo uploads, guestbook, song requests").
- **No download-all / zip export.** Streaming a zip out of Storage is its own
  small piece of work and the photographer can right-click.
- **No links to vendors or budget lines.** `vendors` does not exist (spec 8 is
  unbuilt), and a board is identified to its audience by the share's label,
  not by a foreign key. Additive later; nothing here blocks it (§12.10).
- **No AI anything.** No auto-tagging, no palette extraction, no "find similar".
- **No versioning or history.** Delete an image and it is gone, bucket object
  included (§8).

## 3. The infrastructure step: one private bucket

This is the part that is not like the other features, so it goes before the
data model.

**One bucket, `moodboards`, private.** Not public. Three reasons, in order:

1. **Revocation has to mean something.** A public bucket hands out permanent,
   unauthenticated URLs to every object in it. Revoking a share would then
   close the page and leave every image in it still fetchable by anyone who
   had scrolled past it. Private + short-lived signed URLs makes revocation
   real, within the signing window (§5).
2. **It matches the posture the database already takes.** `0002`'s threat
   model grants `anon` *nothing*, deliberately, "so a policy mistake is not
   instantly an exposure". A public bucket is the storage-shaped version of
   the thing that file refuses to do.
3. **These are other people's photographs.** §9.

**No storage RLS policies at all.** Every object is written, signed and
deleted by the service role, from server code that has already established
which wedding the caller collaborates on. This is deliberate and has a
concrete payoff: **`storage.objects` never appears in a migration**, so
`scripts/verify-migrations.sh` — which applies every migration to a bare
PostgreSQL cluster with a hand-written shim that provides `auth` and nothing
else — keeps working untouched. A policy on `storage.objects` in `0013`
would fail to apply there, and the fix would be to teach a test fixture to
fake Supabase's storage schema, which is a worse thing to own than this
paragraph.

**That makes a third legitimate caller of the service role client**, and both
`README.md` and `docs/HANDOFF.md` §5 rule 6 currently say there are exactly
two ("the public RSVP path and the cron sender"). Those two sentences get
updated in the same change, and the new caller carries the same obligation
the RSVP path does — *it scopes itself, because RLS is not doing it*:

> A storage object path is **derived, never accepted**. `storageObjectPath()`
> builds `{wedding_id}/{board_id}/{item_id}[_thumb].webp` from ids the server
> has already checked. No action takes a path, a filename, or an extension
> from the client. A client that could name its own path could name somebody
> else's.

**Bucket creation is not a migration.** It is a small idempotent script,
`scripts/ensure-bucket.mjs`, run once per environment with the service role
key, alongside the existing `verify-bootstrap.sh` in the "Getting started"
section of `README.md`; and `[storage] enabled = true` in
`supabase/config.toml` so `supabase start` provides one locally. The script
creates the bucket private, sets the MIME allowlist and the per-object size
cap at the bucket level as a backstop to the client-side checks, and says
"already exists" rather than failing when re-run.

**Quotas, honestly.** Supabase's free tier is 1 GB of storage. A board of 40
images at the sizes §4 targets is roughly 12–16 MB of display copies plus
~2 MB of thumbnails, so a wedding's whole set of boards is tens of megabytes,
not gigabytes — but a planner who uploads 200 unresized 12-megapixel photos
would find the ceiling in an afternoon, which is why §4's caps are enforced
before the upload slot is granted rather than discovered afterwards. Egress
is the number to watch instead: images are served from Storage directly to
the viewer, not proxied through Vercel, and a dress-code board on the public
site is fetched once per guest per visit. Thumbnails are what the grid loads;
the display copy is fetched only when somebody clicks one. That split is the
whole reason for two derivatives.

## 4. Where the images come from

**Upload from the device. The browser does the resizing.** The pipeline, in
order, with the reason each step exists:

1. **Pick / drop / paste.** `<input type="file" accept="image/*" multiple>`,
   a drop zone, and a `paste` handler on the board page. Paste matters more
   than it sounds: the actual workflow is "screenshot something on a phone or
   a laptop, then get it into the board", and a paste target removes the
   save-to-disk step.
2. **Reject before reading.** Anything over `MAX_SOURCE_BYTES` (20 MB) or
   outside the accepted types is rejected in the browser with a message
   naming the file, before a byte moves.
3. **Decode and downscale, twice.** Canvas, to WebP: a display copy at
   ≤ 2000px on the longest edge (quality 0.82) and a thumbnail at ≤ 480px
   (quality 0.7). Intrinsic `width`/`height` are captured here and stored, so
   the grid can reserve each tile's aspect ratio and not reflow as images
   arrive.
4. **Ask for upload slots.** `requestUploadSlots(boardId, files[])` — a server
   action that checks the collaborator, checks the board is in this wedding,
   checks the per-board and per-wedding caps against `sum(byte_size)`, inserts
   one `moodboard_items` row per file with `uploaded_at` null, and returns a
   signed upload URL for each derived path.
5. **The browser PUTs directly to Storage.** The bytes never pass through the
   Next server. This is not an optimisation: `next.config.mjs` caps server
   action payloads at 4 MB on purpose, and routing image uploads through an
   action would mean either raising that ceiling for every action in the app
   or failing on a photograph.
6. **`confirmUpload(itemId, {width, height, byteSize})`** sets `uploaded_at`.

**An item with `uploaded_at` null is invisible everywhere except the board
page that created it**, where it shows as a failed tile with retry and remove.
No sweeper cron, no orphan table: the only way to make one is to close the tab
mid-upload, and the person who did it is looking at the screen where it shows.

**Formats, and the two traps in them:**

- Accepted into the pipeline: `image/jpeg`, `image/png`, `image/webp`,
  `image/gif`. What lands in the bucket is always WebP, except:
- **Animated GIF is passed through untouched** under a 5 MB cap. Drawing one
  to a canvas keeps the first frame and silently discards the animation,
  which is a worse outcome than the larger file.
- **HEIC is the iPhone trap.** Safari decodes it, so a picture chosen on an
  iPhone in Safari transcodes to WebP normally. Chrome and Firefox on desktop
  do not decode HEIC at all, so a HEIC dragged in there fails at step 3 — and
  the right behaviour is to say "this iPhone photo needs converting to JPEG
  first" rather than to upload bytes that most viewers' browsers cannot
  render. **Test this on a real iPhone before believing any of it**; it is
  exactly the shape of thing that looks fine in a desktop browser and fails
  for the only person who will use it.

**Caps** (`src/lib/moodboards.ts`, so they are one line to change and are
unit-tested): 20 MB per source file, 200 items per board, 1 GB per wedding.
The last one is a soft cap checked at slot-request time; the bucket-level cap
from §3 is the backstop for anything that gets past it.

## 5. Sharing

One table, `moodboard_shares`, three channels:

| Channel | URL | Token | What it's for |
| --- | --- | --- | --- |
| `link` | `/m/{token}` | yes | The photographer, the florist, your sister. Many per board, each labelled, each revocable on its own. |
| `public_site` | `/w` | no | A dress code everybody should see, rendered inline under the existing page's sections. At most one per board. |
| `rsvp` | `/rsvp/{token}` | no | The same thing, but where guests already are. At most one per board. The household's invitation token is what authenticates the viewer; the board adds no new credential. |

**The token is the invitation token, reused.** `src/lib/tokens.ts` already
solves this exact problem and solves it well: 32 random bytes, stored as
`sha256(token + pepper)` so a table dump is not a list of live links, plus an
encrypted copy so the planner can re-copy a link without reissuing it. This
spec adds `moodboardShareUrl(token)` next to `invitationUrl(token)` and reuses
everything else, including `looksLikeToken` (43-character base64url passes its
40–64 range unchanged).

**The consequence worth stating out loud:** `INVITE_TOKEN_PEPPER` now peppers
two things, so rotating it invalidates every outstanding share link as well as
every outstanding invitation. That is acceptable — rotation is already
break-glass — but it stops being obvious the moment it isn't written down, so
it goes in `.env.example` next to the existing warning (§12.8).

**Throttling reuses `rsvp_token_attempts`.** It holds an IP hash, a success
flag and a timestamp, with no wedding and no token in it by design, so it
needs no schema change to count a second kind of failed lookup. A scanner
guessing share tokens therefore also burns its own RSVP budget, which is the
correct outcome. Same 15-minute window, same fail-open behaviour on a database
error (`docs/HANDOFF.md` §7).

**Per-share flags:**

- `show_notes` — whether `moodboard_items.note` renders. Off by default. This
  is the whole photographer-versus-guests distinction: "6pm, want the sun
  behind them, don't pose this one" is for the photographer and nobody else.
- `show_credits` — whether `credit` / `source_url` render. On by default (§9).
- `expires_at` — nullable, never expires unless set.
- `revoked_at` — nullable; set it and the page is gone. Revoking does not
  delete the row, so the label and the view count survive as a record of what
  was sent to whom.

**What revocation cannot do, and the precedent for saying so.** Signed image
URLs already handed to a browser stay valid until they expire — signing
windows are not revocable. So revoking a share stops the page immediately and
stops new image URLs being minted, but a viewer holding an open tab keeps
their already-loaded images for up to the signing window. That window is
**one hour**, chosen as the compromise between that and a long-lived tab
breaking mid-scroll. It is the same class of caveat as the QR route's
`no-store` rule (`docs/HANDOFF.md` §7): the image is reachable for as long as
the thing pointing at it lives, and pretending otherwise is how a cached
credential outlives the invitation it belonged to.

## 6. Data model

```
moodboards          id, wedding_id, title, description, event_id (nullable),
                    sort_order, archived_at, created_at, updated_at
                    unique (id, wedding_id)

moodboard_items     id, wedding_id, moodboard_id,
                    storage_path, thumb_path, content_type, byte_size,
                    width, height, uploaded_at (nullable),
                    caption, note, source_url, credit,
                    is_cover (bool, default false),
                    sort_order, created_at, updated_at
                    unique (id, wedding_id)

moodboard_shares    id, wedding_id, moodboard_id,
                    channel (moodboard_share_channel),
                    label, token_hash, token_encrypted,
                    show_notes (bool, default false),
                    show_credits (bool, default true),
                    expires_at, revoked_at,
                    view_count (int, default 0), last_viewed_at,
                    created_at, updated_at
                    unique (id, wedding_id)
```

- **Tenancy**, per `docs/HANDOFF.md` §5 rule 1: `wedding_id` on all three,
  `unique (id, wedding_id)` on each parent, composite foreign keys on every
  child — `(moodboard_id, wedding_id)` → `moodboards` on delete cascade for
  both children, `(event_id, wedding_id)` → `events` on delete set null. All
  three go into `0002`'s RLS `tenant_tables` array in the migration that
  creates them.
- **`is_cover`**: at most one per board, enforced with a partial unique index
  — `unique (moodboard_id) where is_cover`. Same mechanism and same reasoning
  as spec 8's primary contact: `v_moodboards` joins on it expecting one row,
  and two covers would duplicate a board on `/moodboards` rather than fail
  loudly. A board with no cover falls back to its first item by `sort_order`.
  Modelled this way rather than as `moodboards.cover_item_id` specifically to
  avoid a circular foreign key between the two tables.
- **`note` is the private one; `caption` is the public one.** Two columns
  rather than one plus a flag, because the question "is this safe to show a
  guest" should be answerable by looking at which column it is in.
- **`channel`** is a new enum, `moodboard_share_channel`:
  `link`, `public_site`, `rsvp`. Constraints in the migration:
  `token_hash`/`token_encrypted` are non-null **iff** `channel = 'link'`
  (a channel that needs no credential must not be storing one), `token_hash`
  is globally unique, and a partial unique index gives at most one
  `public_site` and one `rsvp` share per board.
- **`byte_size`** is stored so the per-wedding cap is a `sum()` and not a
  walk of the bucket.
- **`width`/`height`** are stored so the grid reserves each tile before its
  image loads. A masonry grid that reflows twice while forty images arrive is
  the difference between "nice" and "cheap".
- **No `deleted_at` on items.** Deleting an item deletes its two objects; a
  soft-deleted row pointing at a deleted object is a row that lies. Boards get
  `archived_at` (matching `lists`), items do not.

**Migration: `0013_moodboards.sql`** — the enum, three tables, the two partial
unique indexes, the token constraints, the RLS array entries, and
`v_moodboards`. Append-only per `docs/HANDOFF.md` §8; `0001`–`0012` are not
touched. **Numbering collision:** spec 8 also claims `0013`. Neither is built;
whichever ships first takes the number and the other renumbers — same for
`supabase/tests/05_*.sql`, which both specs claim.

**View: `v_moodboards`** (`security_invoker = true`) — one row per
non-archived board with what `/moodboards` needs and no N+1: every board
column, plus `item_count` (uploaded only), `total_bytes`, the cover item's
`thumb_path`/`width`/`height`, `link_share_count` (live ones — not revoked,
not expired), `published_to_site`, `published_to_rsvp`, `last_viewed_at`
(max across the board's shares), and `event_name`.

## 7. Screens

| Route | What it does |
| --- | --- |
| `/moodboards` | The list, as a card grid of covers — a text list of moodboards is a contradiction. Each card: cover thumb, title, item count, a chip per live share ("2 links · on the RSVP page"), last viewed. Inline "New board" (title only; everything else on the detail page). Archived behind `?archived=1`, never mixed in. |
| `/moodboards/[id]` | The board. A masonry grid of tiles, drag-to-reorder with dnd-kit sortable and the 4px `PointerSensor` distance constraint the app already standardises on (session 15 — without it a click is swallowed as a zero-distance drag). Drop zone and paste target for upload, with per-file progress and per-file failure. Click a tile for a panel carrying caption, private note, source URL, credit, "make cover", delete. Below the grid, the **Share** card: existing link shares with label, copy button, view count, last viewed, revoke; "New link share" with a label and the notes toggle; and two switches for the public-site and RSVP channels. |
| `/m/[token]` | The public board. Title, description, the grid, a lightbox on click, credits under the grid where `show_credits`, notes under each caption where `show_notes`. No nav, no login link, no app chrome. `noindex` — the same call `/w` already makes, and for the same reason. Expired, revoked, malformed and unknown tokens all render one identical "this link isn't active" page (`docs/HANDOFF.md` §7: distinguishing them confirms what exists). |
| `/rsvp/[token]` | One new section, rendered only when a board is published to the `rsvp` channel: heading, description, thumbnails, lightbox. Read-only, below the RSVP form, never between a guest and the submit button. Notes are never shown here regardless of the flag — the RSVP channel has no labelled recipient to trust. |
| `/w` | The same, as a new section on the public site, driven by the `public_site` channel. |
| `Nav` | "Moodboards", after "Budget" (and after "Vendors" if spec 8 ships first). Spec 3's hamburger already handles the count below `sm:`. |

No dashboard tile — a board count is not a number anybody plans around.

**Signed URLs** are minted server-side in batches (`createSignedUrls`), one
hour, on every render. All three viewer surfaces are `force-dynamic`, as `/w`
already is, so a reload re-signs and the page HTML is never cached with URLs
inside it.

## 8. Actions, queries, and pure logic

`src/lib/moodboards.ts` — the pure logic, unit-tested away from a database per
`docs/HANDOFF.md` §8:
`storageObjectPath(weddingId, boardId, itemId, variant)` (the derivation from
§3 — its entire job is that no client input reaches it),
`ACCEPTED_IMAGE_TYPES`, `MAX_SOURCE_BYTES`, `MAX_ITEMS_PER_BOARD`,
`MAX_WEDDING_BYTES`, `downscaleTarget(w, h, maxEdge)`,
`validateUpload({contentType, byteSize, itemCount, weddingBytes})` returning a
specific message rather than a boolean, `resequence(items, movedId, toIndex)`
for drag-to-reorder, `shareIsLive(share, now)` (not revoked, not expired), and
`moodboardShareUrl(token)`.

`src/lib/moodboard-image.ts` — browser-only, deliberately thin: decode,
downscale, encode, read intrinsic dimensions. Not unit-tested (it is canvas
and `File`); every decision it makes comes from `moodboards.ts`, which is.

`src/server/moodboards/resolve.ts` — token → exactly one share → one board →
its items, modelled directly on `src/server/rsvp/resolve.ts` and carrying the
same rule: the token resolves to one `moodboard_id` and one `wedding_id`, and
every subsequent query is constrained to both. Nothing downstream accepts a
board id from the client, ever. Malformed tokens are rejected before they
reach the database; failures are throttled per §5.

`src/server/actions/moodboards.ts` — `createMoodboard`, `updateMoodboard`,
`archiveMoodboard`, `restoreMoodboard`, `deleteMoodboard`,
`requestUploadSlots`, `confirmUpload`, `updateItem`, `setCoverItem`,
`deleteItem`, `reorderItems`, `createShare`, `updateShare`, `revokeShare`,
`setChannelShare(boardId, channel, on)`. All returning `ActionResult`, all
following "blank form field means null; absent key means untouched".

**Deleting is the one with an order that matters.** `deleteItem` removes both
storage objects first and the row second. If the object removal fails, the row
stays and the action returns the failure, so the item is still on screen to
retry — the opposite order leaves bytes in a bucket with nothing pointing at
them and no way to find them again. `deleteMoodboard` does the same for every
item in the board, behind a confirm that names the count, the way
`removeQuestion` counts answers before destroying them (`docs/HANDOFF.md` §5
rule 9).

`src/server/queries/moodboards.ts` — `listMoodboards` (reads `v_moodboards`),
`getMoodboard`, `listItems`, `listShares`, `signItemUrls(items, variant)`,
and `listPublishedBoards(weddingId, channel)` for the `/w` and `/rsvp`
sections. All `cache()`d except the signing helper, which must not be.

**Existing code that changes:** `nav.tsx`; `src/app/w/page.tsx` and
`src/app/rsvp/[token]/page.tsx` (one section each); `src/lib/tokens.ts`
(`moodboardShareUrl`); `src/lib/types/database.ts` (three row types, the
channel union, the view type, **and a `Relationships` entry for every embed
this feature adds** — §5 rule 5, where a missing entry resolves the embed to
`never`, compiles fine, and loses all type safety); `.env.example` (the pepper
note); `supabase/config.toml` (`[storage]`); `README.md` and
`docs/HANDOFF.md` §5 rule 6 (the service role now has three callers, not two).

**Seed data:** boards, items and shares on **both** weddings in
`supabase/seed.sql`, per that file's own comment — the cross-wedding
assertions in §10 need a second tenant to fail against. Seeded items point at
paths that do not exist in any bucket, which is correct: the seed seeds the
database, and a local `supabase start` has an empty bucket. The board page
must therefore render a broken-image tile without falling over, which is worth
knowing anyway — it is what a half-deleted object looks like in production.

## 9. Privacy, and whose photographs these are

Named here because it is the honest objection to the whole feature, and
because the answer shapes three defaults.

A moodboard is, almost by definition, other people's work: a photographer's
portfolio shot, a florist's Instagram, a magazine editorial. Collecting them
privately to communicate taste is ordinary and is what every couple already
does in a Pinterest board. Rehosting them on a public, indexed URL is a
different act. So:

- **`noindex` on every viewer surface**, matching `/w`'s existing posture.
- **No public index.** There is no page listing boards, no `/m` root, no
  enumeration. A board is reachable only by its own token or by being
  published to a site the couple already controls.
- **`credit` and `source_url` are kept and shown by default.** The cheapest
  form of good behaviour, and genuinely useful: "where did we find this" is
  a question the photographer will ask.
- **Analytics are two integers.** `view_count` and `last_viewed_at`, updated
  in place. No per-view row, no IP, no user agent, no referrer. The question
  worth answering is "did they open it", and anything beyond that is
  surveillance of a guest who came to look at a dress code. The existing
  throttle hashes IPs for exactly this reason; this stores none at all.

## 10. Test plan

- **Unit** (`src/lib/moodboards.test.ts`): `storageObjectPath` producing the
  expected shape and refusing ids that are not uuids; `downscaleTarget`
  preserving aspect ratio, never upscaling, handling portrait, landscape and
  square; `validateUpload` for each rejection (type, size, board cap, wedding
  cap) and the happy path; `resequence` for move-up, move-down, no-op and
  first/last; `shareIsLive` across revoked, expired, expiring-now and open.
- **SQL** (`supabase/tests/05_moodboards.sql`): cross-wedding RLS on all
  three tables; the composite FK refusing an item in wedding A attached to a
  board in wedding B, **service role included**; the partial unique index
  refusing a second cover; the token constraint refusing a `link` share with
  no token and a `public_site` share *with* one; the unique index refusing a
  second `rsvp` share on one board; `token_hash` uniqueness across weddings;
  deleting a board cascading its items and shares; `v_moodboards` counting
  only uploaded items and only live shares.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `./scripts/verify-bootstrap.sh`, `npm run build`.
- **Storage is not covered by any of the above, and that is the point of §3's
  decision** — so it gets its own manual pass against a local `supabase start`:
  run `ensure-bucket.mjs` twice and confirm the second run is a no-op; upload
  a JPEG, a PNG, a large photo and an animated GIF and confirm what lands in
  the bucket is WebP except the GIF; confirm the object path contains the
  wedding and board ids; confirm a signed URL works and a raw bucket URL does
  not; delete an item and confirm both objects are gone.
- **Browser pass:** create a board, upload six images by three routes (picker,
  drag, paste), reorder by drag and confirm the order survives a reload, set a
  cover and confirm `/moodboards` shows it. Add a caption and a private note.
  Create a link share with notes **off**, open it in a private window, confirm
  the note is absent and the caption present; create a second with notes
  **on** and confirm the opposite; confirm the first link still works after
  revoking the second. Publish to the RSVP channel and confirm the board
  appears on a real `/rsvp/{token}` page below the form, with no notes.
  Publish to the public site and confirm the same on `/w`. Set an expiry in
  the past and confirm the page reads identically to an unknown token.
  Confirm `view_count` moved. **Then do the whole thing again on a phone**,
  including a HEIC from the camera roll (§4) — the guest-facing half of this
  feature will be opened on a phone by almost everyone who sees it.

## 11. Build order

1. **§12 answered.** Question 1 decides whether steps 2–5 exist at all.
2. `supabase/config.toml` + `scripts/ensure-bucket.mjs` + the README lines.
   Prove a bucket exists and a signed URL round-trips before building
   anything that assumes one.
3. `0013_moodboards.sql` — enum, tables, indexes, constraints, RLS array,
   `v_moodboards`.
4. `src/lib/moodboards.ts` + unit tests. `src/lib/types/database.ts`,
   `Relationships` entries included.
5. `src/server/queries/moodboards.ts` and `src/server/actions/moodboards.ts`
   — boards and the upload round-trip first, proving tenancy and path
   derivation end to end before any grid exists.
6. `/moodboards` and `/moodboards/[id]`: grid, upload, reorder, item panel.
7. Shares: the share card, `createShare`/`revokeShare`, `/m/[token]` and
   `src/server/moodboards/resolve.ts` with its throttle.
8. The `public_site` and `rsvp` channels: the two new sections.
9. `Nav`, seed data, `supabase/tests/05_moodboards.sql`,
   `.env.example`, and the README/HANDOFF service-role sentences.
10. Full check pass + storage pass + browser pass per §10, phone included.

**Steps 2–7 are the feature.** Step 8 is the part that is nice rather than
necessary — if the inline publication in §12.4 wants more discussion, it can
be dropped without stranding anything, because a link share already covers
"send the guests the dress code".

## 12. Open questions — need the planner's answers before anything is built

1. **Uploaded images, or pasted image URLs?** Recommendation: uploads, into
   a private Supabase Storage bucket (§3, §4). The alternative — store a URL
   per item and let the viewer's browser fetch it from Pinterest or Instagram
   — needs no bucket, no script and no upload pipeline, and is genuinely a
   third of the work. It is also how you send a photographer a board that is
   half broken grey boxes in a month: both of those sites actively block
   hotlinking, and the source can delete the image at any time. **This is the
   question that changes the schema**, so it is first.
2. **Private bucket with signed URLs, or a public bucket?** Recommendation:
   private (§3). Public is simpler and faster to build, and permanently
   undermines revocation.
3. **"Add by URL", where the server fetches the image and rehosts it?** It is
   the nicest possible UX — paste a link, get an image — and it is an
   outbound request to an address a user chose. Doing it safely means an
   `https`-only rule, no redirects to private address ranges, a content-type
   check on the response rather than the URL, a hard size cap enforced while
   streaming, a short timeout, and accepting that it will still sometimes
   fetch something odd. Recommendation: **out of this pass.** Say so if it's
   the thing you actually want, because it's an afternoon of careful work
   rather than a checkbox.
4. **Inline publication to `/w` and `/rsvp/{token}`, or links only?**
   Recommendation: build both channels (§5). The RSVP one especially — the
   dress code question gets asked by somebody already standing on that page,
   and a second link they have to keep is a link they lose.
5. **Private notes per item, shown per share (§5)?** Recommendation: yes.
   It is one boolean, and it is the entire difference between the
   photographer's board and the guests' board being the same board.
6. **Comments or reactions from viewers?** Recommendation: no, this pass.
   A photographer replying under an image is genuinely useful and is also an
   anonymous write path; the RSVP flow shows what that costs to do properly.
   If it matters more than I think, say so and it gets its own spec.
7. **Sections within a board** (a "ceremony" group and a "reception" group in
   one board)? Recommendation: no — make a second board. `lists` earned
   sections by holding a hundred items; a moodboard holds thirty and the
   grid *is* the organisation.
8. **Reusing `INVITE_TOKEN_PEPPER` for share tokens**, accepting that a
   rotation invalidates share links as well as invitations (§5)?
   Recommendation: confirm. A second secret is a second thing to set in
   Vercel, and rotation is already break-glass.
9. **Two integers of analytics, and nothing else** (§9)? Recommendation:
   confirm.
10. **Anything linking a board to a vendor or a budget line?**
    Recommendation: no FK now — `vendors` does not exist yet (spec 8), and the
    share's label already says whose board it is. Purely additive later; I'd
    rather not invent the relationship before there is a table to point at.
11. **A print view for the photographer** (`/m/{token}?print=1`, reusing the
    print CSS from `/invitations/print`, contact-sheet style)? Recommendation:
    yes, and it is small — but it is my idea rather than something you asked
    for, so it is a question and not scope.
12. **Default expiry.** Recommendation: none — a share link lives until it is
    revoked. A board that expires on the photographer three days before the
    wedding is a worse failure than one that stays open too long.
