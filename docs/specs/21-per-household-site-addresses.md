# Spec 21 — A page of their own: per-household addresses on the wedding site

**Status: proposed, fully answered (2026-09-20 — see the next section).
Nothing is built, schema included.** All eight questions in §9 are settled and
§§4–8 are rewritten around the answers. This spec revisits a decision spec 14
already made (Q1: the opaque household token) and the answer to question 1
keeps that decision's substance — the credential stays unguessable — while
changing what it looks like.

**Depends on:** spec 14, built (`weddings.slug`, `/w/[slug]`, the Script theme
and renderer, `/i/[token]`, `/rsvp/[token]`, the `/site` editor) and V1's
guest list (`households`, `invitations`, `invitation_events`, `rsvps`).

---

## Answered — 2026-09-20

All eight, in one round. The sections below are rewritten to match; this is
the record of what was decided and what each answer costs.

**Q1 — option A, the readable name plus a short random suffix**, with one
correction: **the slug is the household's own name and nothing appended.**
`/w/ray-and-olivia/okonkwo-4f7ak`, not `…/the-okonkwo-family-4f7ak`. The
credential model is therefore unchanged from spec 14 in substance — the
address is still unguessable — and everything in §3's list (guest names,
dietary notes, RSVPs answered on someone's behalf, coach seats, uploads)
stays as protected as it is today. What changes is that the link now says
whose it is. **Q2 does not arise**: it was conditional on option B.

**Q3 — per-event notes**, not one block in the Site tab. Each event carries
its own guest-facing note and a household's page stitches together the ones
they are actually invited to, so a ceremony-only household reads about the
ceremony and nothing else. This is the more expensive answer — it is a column
on `events` and a field on the events editor rather than one block — and it is
the one that makes the page genuinely *theirs* rather than the same timetable
on everyone's page. See §5.4.

**Q4 — retired slugs keep working.** An alias table and 301s. The link is in
people's chat histories from months back, and an edit that silently breaks it
would make the "live, editable URL" the whole feature is named after into a
thing nobody dares touch.

**Q5 — keep `/w`.** Unchanged from the recommendation; §4 has the reasoning.

**Q6 — `/i/[token]` and `/rsvp/[token]` redirect to the new address.** One
link per household, full stop. Every invitation already sent keeps working,
and there is no decision to make about which URL to send. §8 carries the one
build detail this creates: the Open Graph image currently lives under `/i` and
has to move with the card, or every forwarded link previews as nothing.

**Q7 — strip the filler.** A leading "The" and a trailing
"family"/"household"/"whānau" come off before slugifying, so the real guest
list reads `okonkwo`, `nakamuras`, `priya-dev-raman`, `grandma-reid`,
`old-rugby-lot`. Not derived from surnames (Q7's third option): it would have
to guess at "Old rugby lot" and at households with three surnames in them.

**Q8 — automatic for every household, editable per household.** There is no
"create their page" button and no household without an address; the trigger
derives one on insert the way `0015` already does for weddings. The household
screen shows it, and lets the planner edit, copy and preview it. This is a
change from how the planner first described it (a button on the guest page)
and was chosen deliberately: "a household with no page" is a state every
screen, sender and export would otherwise have to handle.

**Net effect:** nothing here waits on anything outside. The build order in §8
is unblocked end to end, and the schema is one migration.

---

## 1. What the planner asked for

In their words, condensed:

- Every guest should get a **customised wedding website** — their name on it,
  the events **they** are invited to, the key details for those events, the
  RSVP yes/no, and the custom questions.
- If a household is ticked for both (or all) events, their page carries the
  **on-the-day run-down** as well.
- The address should read like **`ray-and-olivia` + the household's name**,
  rather than the opaque string it is today.
- Creating it should start from the **guest side**: a "create custom slug"
  button on the household, next to where their events are already ticked.
- The **site itself is managed in the Site tab** — one site, many doors into
  it, not a hand-built page per household.
- The URL is **live and editable** as things change.

That is a coherent feature and most of its machinery already exists. What it
is *not* is a cosmetic change to a path, which §3 is about.

## 2. What exists today, honestly

Worth reading before designing on top of it, because four of the six things
asked for are already built and wired.

| Piece | Where | State |
| --- | --- | --- |
| The wedding's own slug — `ray-and-olivia` | `weddings.slug`, `0015_wedding_slug.sql` | Built. Unique, lowercase, shape-checked in the database, derived from `weddings.name` by a BEFORE INSERT trigger, overridable |
| The public site at `/w/<slug>` | `src/app/w/[slug]/page.tsx`, `src/server/queries/site.ts` | Built. One scrolling page, twelve section kinds out of `site_content`, themed |
| The Site tab that edits it | `/site`, `/site/theme` | Built. Every section, show/hide, reorder, palette, monogram |
| Which events a household is invited to | `invitation_events` (join table, per invitation) | Built. Ticked on `/invitations` when invitations are created |
| A personal page per household | `/rsvp/<token>` | Built — this is the customised page, already: household name, their guests, **only their invited events**, RSVP per guest per event, the custom questions, coach seats, photo uploads |
| A forwardable stationery card | `/i/<token>` | Built, themed, with a real Open Graph image |

So the personalised page the planner is describing is largely `/rsvp/[token]`
with the public site's theme applied to it. **The gap is the address, and one
piece of content** (§5).

**The address today** is `/rsvp/hT8_2fQ…` — 32 random bytes, base64url,
stored as `sha256(token + pepper)` plus an encrypted copy so the planner can
recover the link without reissuing it (`src/lib/tokens.ts`). One live token
per household (`invitations_active_household_key`), shared by `/i` and
`/rsvp`, which is what makes "one link per household for the life of the
wedding" true.

**The thing that is not built and was asked for:** nothing on the household
page mints or shows this. `/households/[id]` reads the invitation and the
invited events but renders no link and no button; the link lives on
`/invitations` (reveal, copy, WhatsApp). Wherever question 1 lands, "create
their page" belongs on the household, which is where the planner is when they
tick the events.

## 3. The fork: a pretty URL is a change of credential

**Decided: option A** (Q1). The rest of this section is kept as the record of
what was weighed — in particular §3's list of what sits behind the URL, which
is the reason the suffix exists and should be read before anyone proposes
dropping it later.

This was the decision. Everything else in this spec is mechanical.

`/rsvp/hT8_2fQ…` is unguessable. `/w/ray-and-olivia/the-smith-family` is
guessable by anyone who knows the couple — and a wedding site is *published to
the internet with the couple's names on it*, so the guessing pool is "anyone
who saw the invitation on someone's fridge", not "an attacker".

What sits behind that URL today, if the two are simply swapped:

- Every guest's **name** in that household, including who is a plus-one.
- The **RSVP form** — a stranger can accept or, worse, **decline** on their
  behalf, and the couple would see a legitimate-looking response. (`rsvps` is
  per guest per event and overwritable; nothing records *who* answered.)
- Free-text answers to the **custom questions** (dietary and accessibility
  notes are exactly the sensitive ones).
- **Coach seat** reservations against a shared capacity.
- **Photo uploads** attributed to that household.

The guest-list half of the app is deliberately careful here — soft deletes so
a cut guest stays reconstructable, RLS keyed to `wedding_id` on every table,
a throttle on token lookups. Handing that surface a human-readable address
without deciding what replaces the 32 bytes would undo most of it in one
migration.

Three honest options.

### Option A — pretty prefix, short secret suffix ***(chosen)***

`/w/ray-and-olivia/okonkwo-4f7ak`

The household's name is in the URL, so it reads as theirs and the planner can
tell at a glance which link is which. The five-character suffix is random
(Crockford base32, which already excludes `I`, `L`, `O` and `U`, so no
`0`/`O` confusion and far fewer accidental words), scoped per wedding, and
restores the property that you cannot get to a page by guessing a surname.

- Pros: reads like the planner asked; no gate, no cookie, no form; one link
  per household is still true; the throttle already built on
  `rsvp_token_attempts` covers the remaining brute-force surface.
- Cons: not *quite* the clean URL in the request; a link with a random tail is
  slightly less obviously "yours" when read aloud.
- Entropy: 5 chars ≈ 33 million per wedding name, against a rate-limited
  lookup. Against a guest list of 80 this is not close.

### Option B — pretty URL, no secret, accept the exposure *(not chosen)*

`/w/ray-and-olivia/the-smith-family`

- Pros: exactly what was asked for. Memorable enough to read out over the
  phone to a grandparent, which is a real benefit and probably the reason the
  planner wants it.
- Cons: everything in §3's list above becomes public to anyone who can guess a
  surname, and the site itself publishes the couple's names. A malicious or
  merely bored guest can decline on another family's behalf and nothing in the
  data says they did.
- If chosen, it should be narrowed: the pretty URL shows the **card** (names,
  their events, the details, the schedule) and the **writes** — RSVP, answers,
  seats, uploads — stay behind the token link that page links out to. That is
  half the feature, but it is the half with no downside.

### Option C — pretty URL plus a lightweight challenge *(not chosen)*

`/w/ray-and-olivia/the-smith-family`, and the first visit asks for something
the household knows — a surname, a postcode, or a four-digit PIN printed on
the invitation — then sets a signed cookie for the rest of the season.

- Pros: the clean URL, and the writes stay protected.
- Cons: a form between a guest and their RSVP is exactly the friction spec 14
  Q1 removed on purpose ("a chunk of any real guest list has no phone we hold
  and no inclination to receive a code"). A shared surname is a weak secret; a
  PIN is another thing to print and another thing to lose. Roughly a day of
  work plus a support burden on the couple.

**Chosen: A.** It gives the planner the readable, per-household, editable
address they asked for, keeps the existing security model intact (same
throttle, same one-link-per-household, same rule that nothing downstream takes
a household id from the client), and needs no new concept on the guest's side.

## 4. The address, in detail

The shape is:

```
/w/<wedding-slug>/<household-slug>-<suffix>
```

`/w` stays. Dropping it — `/ray-and-olivia/…` — means every top-level path
becomes a potential wedding slug and every planner route (`/site`, `/guests`,
`/login`) becomes a reserved word, and `src/lib/public-paths.ts` exists
precisely because getting that list wrong is invisible until it is a
vulnerability. Not worth it for two characters. (Question 5.)

**Generation (Q7, Q8).** Automatic for every household, on insert, from
`households.display_name` through the `slugify()` that `0015` already added,
with the filler stripped first. Against the real guest list:

| `display_name` | slug |
| --- | --- |
| The Okonkwo family | `okonkwo-4f7ak` |
| The Nakamuras | `nakamuras-9k2pm` |
| Priya & Dev Raman | `priya-dev-raman-7t3mq` |
| Grandma Reid | `grandma-reid-2xq8h` |
| Old rugby lot | `old-rugby-lot-6bn4z` |

Rules:

- **Strip before slugifying:** a leading `the`, and a trailing `family`,
  `household` or `whānau`/`whanau`. If stripping leaves nothing — a household
  literally named "The Family" — keep the full name instead of producing an
  empty slug.
- **The suffix carries uniqueness, so the name part does not have to.** Two
  Smith households are `smith-4f7ak` and `smith-9k2pm`, and `0015`'s `-2`,
  `-3` dance is not needed here. The unique index is on
  `(wedding_id, slug, slug_suffix)`, partial on `deleted_at is null` — matching
  `households_rank_key`, so an uncut-then-recut household does not permanently
  burn its name. In the unreachable event the suffix itself collides, the
  trigger redraws.
- Same shape check as the wedding slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–64
  characters, enforced in the database rather than only in the form.
- A display name that slugifies to nothing (all emoji, a script `translate()`
  does not cover) falls back to `household`, which the suffix still makes
  unique — `household-3jd7k`.
- Reserved words rejected at the second segment: `rsvp`, `i`, `api`,
  `opengraph-image`, and anything else that might later be a sibling route.
  Cheap insurance, since the suffix means a reserved word can only arrive by
  hand-editing.

**Editing (Q4).** Live, on the household screen.

- **The suffix is minted once and never changes.** Editing changes only the
  readable part, so "fix a typo in their name" cannot quietly mint a new
  credential and orphan the one that is already in the post.
- **Retired slugs keep working.** Every address a household has ever had goes
  into `household_slug_aliases` on edit, and any retired slug 301s to the
  current one. Without this, "editable" is only true before anyone has the
  link, which is the opposite of what was asked for.
- **Renaming the household does not rename the slug.** Derive on insert, then
  leave it alone — a household renamed from "The Smiths" to "Bob and Jane
  Smith" should not silently change its address. The editor offers the new
  derivation as a suggestion, and taking it is one click and one alias.

**Soft deletes.** A cut household keeps its row (`deleted_at`) and therefore
its slug, and the resolver must treat a cut household as not found — the whole
point of the platform's soft-delete rule is that the guest stays
reconstructable, not that their page stays up. Their alias rows stay too, so
uncutting them restores the address rather than minting a new one.

## 5. What the page actually shows

The content model is unchanged: **one site, in the Site tab, with a
personalised door**. Nothing here is a per-household CMS, and nothing here
duplicates `site_content`.

The page is `/rsvp/[token]`'s content, rendered in the site's theme, ordered
as:

1. **Their names.** "Alice and Bob Smith" from the household's guests, with
   the household display name as the eyebrow — what `/i/[token]` already does.
2. **The shared top of the site** — hero, date, countdown — read from
   `site_content`, so editing the Site tab changes every household's page at
   once. This is the piece that makes it "the website", not "a form".
3. **Their events only.** `invitation_events` filtered to this invitation, in
   `starts_at` order, each with venue, address, dress code and map link, which
   the schedule section already renders. A household ticked for the ceremony
   only sees one; a household ticked for everything sees the weekend.
4. **The on-the-day run-down** — the planner's "if they're ticked to both".
   This is the one genuinely new piece of content, and **Q3 put it on the
   events themselves**: each event gets a guest-facing note, and a household's
   page stitches together the notes for the events they are invited to, in
   `starts_at` order. A ceremony-only household reads the ceremony's note and
   never learns there was a note about Sunday breakfast.

   It is emphatically *not* the planner's `/run-sheet`, which carries vendor
   calls, supplier phone numbers and internal timings. Different audience,
   different table, no shared rows — worth stating because "run sheet" is the
   obvious thing to reuse and reusing it would publish a florist's mobile
   number.

   The note is authored in the existing events editor, one field per event,
   next to the venue and dress code it will be rendered beside. An event with
   no note simply contributes its time, name and venue, which is what every
   event does today.
5. **RSVP**, per guest, per invited event, plus the custom questions — the
   existing `RsvpForm`, unchanged.
6. **The rest of the shared site** — travel, stays, coach booking, FAQ,
   gallery and uploads — already all on one or other of the two pages today.

The public `/w/<slug>` page stays exactly as it is: the version a guest sees
when they arrive without a personal link, with "find my invitation" on it.

**One consequence, now decided (Q6):** this page becomes the card *and* the
RSVP, and `/i/[token]` and `/rsvp/[token]` 301 to it. One link per household,
full stop — nothing to choose between when sending, and every invitation
already in the world keeps landing in the right place. Two shipped surfaces
are retired rather than deleted; see §8 for the piece of `/i` that has to move
rather than redirect.

## 6. Where it is managed

- **Household page (`/households/[id]`)** — where the planner asked for
  "create custom slug", except that Q8 removed the creating: the address
  already exists by the time the screen loads. So it shows the address, an
  edit field, a copy button, the WhatsApp copy-out, "preview as this
  household", and their invited events (already there, read-only today — this
  spec makes the tick live where it is). This is the screen the planner
  described and the one that currently shows none of it.
- **Invitations (`/invitations`)** — the bulk view. The address column
  replaces or accompanies the revealed token link; the senders keep working
  unchanged because they send whatever `invitationUrl()` returns.
- **Site tab (`/site`)** — unchanged, and explicitly the place the *content*
  is edited. It gains one thing: a per-household **preview** picker, which
  spec 14's build notes already list as a known gap ("No preview-as-guest").

## 7. Schema — one migration, not to be built yet

Small, and additive. Recorded so the size of the change is visible, not
because it is authorized.

```sql
-- 00NN_household_slugs.sql
alter table public.households add column slug text;         -- household_slugify(display_name)
alter table public.households add column slug_suffix text;  -- 5 chars, crockford base32
-- + shape checks on both
-- + unique index on (wedding_id, slug, slug_suffix) where deleted_at is null
-- + BEFORE INSERT trigger deriving both, mirroring 0015's
-- + backfill for every existing household

-- Q4: a rename must not break the link already in someone's chat history
create table public.household_slug_aliases (
  wedding_id   uuid not null,
  household_id uuid not null,
  slug         text not null,
  slug_suffix  text not null,
  retired_at   timestamptz not null default now(),
  primary key (wedding_id, slug, slug_suffix),
  foreign key (household_id, wedding_id)
    references public.households (id, wedding_id) on delete cascade
);

-- Q3: the guest-facing note, per event
alter table public.events add column guest_note text;
```

`household_slugify()` is `slugify()` (already in `0015`) with the filler strip
in front of it, as its own function so the trigger and the backfill share one
definition of the rule.

RLS on `household_slug_aliases` like every other table, keyed to `wedding_id`,
tested with a second account. `events.guest_note` needs no policy change —
`events` already has one — but it does change what the public read path is
allowed to select, which is the sort of thing `supabase/tests/` exists to
pin down.

Plus `wedding_id` on every table and RLS on each, per the platform rules —
`household_slug_aliases` included, even as a leaf table.

Resolution stays in a single scoped function, the way `resolveInvitation()`
and `resolveCard()` already do it: slug + wedding slug → exactly one household
and one wedding, and nothing downstream ever takes a household id from the
client.

## 8. Build order, if it is authorized

0. **Migration** (§7): both columns, the shape checks, the partial unique
   index, `household_slugify()`, the insert trigger, the backfill, the alias
   table with its RLS, and `events.guest_note`. SQL tests alongside, the way
   `06_wedding_slug.sql` tests `0015`.
1. **`resolveHousehold(weddingSlug, householdSlug)`** in `src/server/rsvp/`,
   mirroring `resolveCard()` — the throttle, the neutral not-found message
   (the same one whether the slug is malformed, unknown, or belongs to a cut
   household), and the rule that the pair resolves to exactly one household
   and one wedding with nothing downstream taking an id from the client.
   Alias lookup lives here too, returning "redirect to this address" rather
   than a context.
2. **The route `/w/[slug]/[household]`**, rendering §5 in the site theme and
   reusing `RsvpForm`, `Schedule`, `CoachBooking` and `GuestUploader` as they
   stand. `noindex` stays on, as on both pages it replaces.
3. **The household screen** (§6): address, edit, copy, WhatsApp, preview.
4. **The per-event note** (§5.4): the field in the events editor, the
   rendering on the personal page, and the public read path allowed to select
   it.
5. **The retirement** (Q6): `/i/[token]` and `/rsvp/[token]` 301 to the
   household's address; `invitationUrl()` and `invitationCardUrl()` return the
   new URL, which is what silently updates the senders, the QR route and the
   print sheet; alias 301s live.

   **The one thing that cannot just redirect:** `/i/[token]/opengraph-image`.
   It is the only part of spec 14 that has ever been seen working, and a
   redirect is not a preview — a forwarded WhatsApp link would render blank.
   The image has to move to the new route and be checked, not assumed.

Steps 0–3 are the feature. 4 and 5 are the tail, and 5 is the one with a
blast radius: it changes what every already-sent invitation resolves to.

## 9. Open questions — all answered, 2026-09-20

Kept as asked, with what came back. The reasoning behind each answer is in
the "Answered" section at the top.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Option A, B or C in §3 — is this a route change or a security model change? | **A**, with the slug being the household's own name and nothing appended |
| 2 | If B: does the RSVP form live on the guessable page or behind a link? | **Does not arise** — conditional on B |
| 3 | The on-the-day run-down (§5.4) — who writes it? | **Per-event notes**, stitched per household |
| 4 | Do retired slugs keep working? | **Yes** — alias table and 301s |
| 5 | Keep `/w`, or drop it? | **Keep `/w`** |
| 6 | Do `/i/[token]` and `/rsvp/[token]` retire? | **Yes** — both 301 to the household's address |
| 7 | What is the slug derived from? | **`display_name`, filler stripped** — not surnames |
| 8 | Minted in bulk or per household? | **Automatic for every household**, editable per household |

**Nothing here is built.** The answers settle the design; the build starts
when the planner says so, in words that mean it.

---

## Appendix — what this spec deliberately does not do

- **No per-household content overrides.** One site, one set of blocks, edited
  in the Site tab. A personal note per household is a plausible V2 and is not
  here, because it turns `site_content` into a CMS with a scope column and
  doubles every read.
- **No custom domain and no hostname routing.** Spec 14 Q9 decided this; it
  is unchanged.
- **No accounts, no phone verification.** Spec 14 Q1, unchanged — even under
  option C, the challenge is a cookie, not an identity.
- **No change to how invitations are sent.** The senders take a URL; which URL
  is a one-line change once questions 1 and 6 are answered.
