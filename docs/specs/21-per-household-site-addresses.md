# Spec 21 — A page of their own: per-household addresses on the wedding site

**Status: proposed. Nothing is built, schema included.** This spec revisits a
decision spec 14 already made (Q1: the opaque household token), so §6's open
questions are not detail — question 1 decides whether this feature is a URL
change or a credential change, and everything else follows from it.

**Depends on:** spec 14, built (`weddings.slug`, `/w/[slug]`, the Script theme
and renderer, `/i/[token]`, `/rsvp/[token]`, the `/site` editor) and V1's
guest list (`households`, `invitations`, `invitation_events`, `rsvps`).

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

This is the decision. Everything else in this spec is mechanical.

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

### Option A — pretty prefix, short secret suffix *(recommended)*

`/w/ray-and-olivia/the-smith-family-4f7a`

The household's name is in the URL, so it reads as theirs and the planner can
tell at a glance which link is which. The four-or-five character suffix is
random (Crockford base32, no vowels, so no accidental words and no
`0`/`O` confusion), scoped per wedding, and restores the property that you
cannot get to a page by guessing a surname.

- Pros: reads like the planner asked; no gate, no cookie, no form; one link
  per household is still true; the throttle already built on
  `rsvp_token_attempts` covers the remaining brute-force surface.
- Cons: not *quite* the clean URL in the request; a link with a random tail is
  slightly less obviously "yours" when read aloud.
- Entropy: 5 chars ≈ 33 million per wedding name, against a rate-limited
  lookup. Against a guest list of 80 this is not close.

### Option B — pretty URL, no secret, accept the exposure

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

### Option C — pretty URL plus a lightweight challenge

`/w/ray-and-olivia/the-smith-family`, and the first visit asks for something
the household knows — a surname, a postcode, or a four-digit PIN printed on
the invitation — then sets a signed cookie for the rest of the season.

- Pros: the clean URL, and the writes stay protected.
- Cons: a form between a guest and their RSVP is exactly the friction spec 14
  Q1 removed on purpose ("a chunk of any real guest list has no phone we hold
  and no inclination to receive a code"). A shared surname is a weak secret; a
  PIN is another thing to print and another thing to lose. Roughly a day of
  work plus a support burden on the couple.

**Recommendation: A.** It gives the planner the readable, per-household,
editable address they asked for, keeps the existing security model intact
(same hash-at-rest, same throttle, same one-link-per-household), and needs no
new concept on the guest's side. B is defensible for a small local wedding if
the planner would rather have the cleaner URL and accept the exposure **with
the write surface narrowed as described** — but that is their call to make
explicitly, not one to infer.

## 4. The address, in detail

Assuming A or B, the shape is:

```
/w/<wedding-slug>/<household-slug>[-<suffix>]
```

`/w` stays. Dropping it — `/ray-and-olivia/…` — means every top-level path
becomes a potential wedding slug and every planner route (`/site`, `/guests`,
`/login`) becomes a reserved word, and `src/lib/public-paths.ts` exists
precisely because getting that list wrong is invisible until it is a
vulnerability. Not worth it for two characters. (Question 5.)

**Generation.** From `households.display_name`, through the `slugify()` that
`0015` already added — "The Smith Family" → `the-smith-family`, "Nana & Pop" →
`nana-pop`. Rules:

- Unique per wedding, not globally: two weddings can both have a
  `the-smith-family`. The unique index is on `(wedding_id, slug)`.
- Collisions inside one wedding (two Smith households) resolve the way
  `0015`'s trigger already resolves wedding slugs: `-2`, `-3`, in creation
  order, so the first one keeps the bare name.
- Same shape check as the wedding slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–64
  characters, enforced in the database rather than only in the form.
- A display name that slugifies to nothing (all emoji, a script `translate()`
  does not cover) falls back to `household-<first 8 of id>`, as `0015` does.
- Reserved words rejected at the second segment: `rsvp`, `i`, `api`,
  `opengraph-image`, and anything else that might later be a sibling route.

**Editing.** Editable on the household, live, as asked. Two consequences to
decide (question 4):

- **Renaming breaks the old link**, and the old link is in someone's WhatsApp
  from three months ago. The cheap fix is an alias table — every slug a
  household has ever had, the current one flagged — and a 301 from any retired
  slug. That is one small table and it is the difference between "editable" and
  "editable once nobody has the link yet".
- **Renaming the household renames the slug?** No — derive on create, then
  leave it alone. A household renamed from "The Smiths" to "Bob and Jane
  Smith" should not silently invalidate their invitation. Offer the new
  derivation as a suggestion in the editor instead.

**Soft deletes.** A cut household keeps its row (`deleted_at`), so its slug
keeps squatting. The unique index should be partial —
`where deleted_at is null` — matching `households_rank_key`, so an
uncut-then-recut household does not permanently burn the name.

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
   This is the one genuinely new piece of content. It is *not* the planner's
   `/run-sheet` (that carries vendor calls, supplier contacts and internal
   timings). It is a guest-facing timeline: the public events they are invited
   to with their start times, the walking distance between them, and the
   couple's own notes. Question 3 asks how it is authored — a new
   `site_content` block that every invited household sees, or per-event notes.
5. **RSVP**, per guest, per invited event, plus the custom questions — the
   existing `RsvpForm`, unchanged.
6. **The rest of the shared site** — travel, stays, coach booking, FAQ,
   gallery and uploads — already all on one or other of the two pages today.

The public `/w/<slug>` page stays exactly as it is: the version a guest sees
when they arrive without a personal link, with "find my invitation" on it.

**One consequence worth stating:** if this page becomes the wedding website
for a guest, then `/i/[token]`, `/rsvp/[token]` and this new page are three
addresses for overlapping content. The tidy end state is that the personal
address *is* the card and the RSVP, `/i` and `/rsvp` become redirects to it,
and there is one link per household, full stop. That is the recommendation,
but it retires two shipped surfaces and belongs in the decision (question 6).

## 6. Where it is managed

- **Household page (`/households/[id]`)** — the planner's "create custom
  slug". Their events (already there, read-only today — this spec makes the
  tick live where it is), their address, an edit field, copy button, WhatsApp
  copy-out, and "preview as this household". This is the screen the planner
  described and the one that currently shows none of it.
- **Invitations (`/invitations`)** — the bulk view. The address column
  replaces or accompanies the revealed token link; the senders keep working
  unchanged because they send whatever `invitationUrl()` returns.
- **Site tab (`/site`)** — unchanged, and explicitly the place the *content*
  is edited. It gains one thing: a per-household **preview** picker, which
  spec 14's build notes already list as a known gap ("No preview-as-guest").

## 7. Schema sketch — not to be built yet

Small, and additive. Recorded so the size of the change is visible, not
because it is authorized.

```sql
-- 00NN_household_slugs.sql
alter table public.households add column slug text;          -- backfilled via slugify(display_name)
-- + shape check, + unique index on (wedding_id, slug) where deleted_at is null
-- + BEFORE INSERT trigger deriving and de-duplicating, mirroring 0015's

-- Option A only: the unguessable part
alter table public.households add column slug_suffix text;   -- 5 chars, crockford base32

-- Only if question 4 says old links must survive a rename
create table public.household_slug_aliases (
  wedding_id uuid not null, household_id uuid not null,
  slug text not null, retired_at timestamptz not null default now(),
  primary key (wedding_id, slug)
);
```

Plus `wedding_id` on every table and RLS on each, per the platform rules —
`household_slug_aliases` included, even as a leaf table.

Resolution stays in a single scoped function, the way `resolveInvitation()`
and `resolveCard()` already do it: slug + wedding slug → exactly one household
and one wedding, and nothing downstream ever takes a household id from the
client.

## 8. Build order, if it is authorized

0. Migration: `households.slug` (+ suffix and/or aliases per the answers).
1. `resolveHousehold(weddingSlug, householdSlug)` in `src/server/rsvp/`,
   mirroring `resolveCard()` — the throttle, the neutral not-found message,
   the same one-household scoping rule.
2. The route `/w/[slug]/[household]`, rendering §5's page in the site theme,
   reusing `RsvpForm`, `Schedule`, `CoachBooking`, `GuestUploader` as they
   stand.
3. The household screen: address, edit, copy, preview (§6).
4. The on-the-day block (§5.4) — authoring in `/site`, rendering here.
5. `/i` and `/rsvp` redirects, if question 6 says so; senders and the print
   sheet switched to the new URL; alias 301s.

Steps 1–3 are the feature. 4 and 5 are the tail.

## 9. Open questions

**None of these are rhetorical, and 1 blocks the rest.**

1. **Option A, B or C in §3?** Readable-with-a-suffix (recommended),
   readable-and-open (with writes narrowed), or readable-plus-a-challenge.
   This decides whether the change is a route or a security model.
2. **If B: does the RSVP form live on the guessable page, or behind a link?**
   §3's narrowed variant is the only version of B this spec would recommend
   building.
3. **The on-the-day run-down (§5.4) — who writes it?** A single block in the
   Site tab that every invited household sees (cheapest, recommended), or per
   event, or derived automatically from the events' own start times with no
   authoring at all.
4. **Do retired slugs keep working?** An alias table and 301s (recommended:
   the link is already in people's chat histories), or a rename simply breaks
   the old address.
5. **`/w/ray-and-olivia/the-smiths`, or `/ray-and-olivia/the-smiths`?**
   Recommended: keep `/w` — see §4.
6. **Do `/i/[token]` and `/rsvp/[token]` retire?** Recommended: they redirect
   to the new address, so there is one link per household. The alternative is
   three live surfaces and a decision every time about which one to send.
7. **What is the household slug derived from?** `display_name` as it stands
   ("The Smith Family" → `the-smith-family`), or the guests' actual surnames,
   which would read better for households named "Mum and Dad" or "Work
   friends 2".
8. **Does the planner ever type one by hand at scale?** If yes, the household
   page needs a bulk "generate for everyone" on `/invitations` as well as the
   per-household button; if no, the per-household control is enough.

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
