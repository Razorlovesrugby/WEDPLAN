# Spec 14 — The public wedding site, and the invites that point at it

**Status: proposed, fully answered (2026-09-17, three rounds — see the next
section). All twelve questions are settled. §4 is final, the build order is
unblocked end to end, and the only thing still owed from outside is design
reference for §5.**

Reference: [aisle.wedding](https://aisle.wedding) — the planner asked for
its example guest site to be studied and, where it is better than what we
have, copied directly.

---

## Answered — 2026-09-17

Four of §14's twelve questions came back in the discovery session. They are
folded into the sections below; this is the record of what changed and why.

**Q1 — guest identity: keep the household token.** Confirmed. No phone
verification, no per-guest accounts, no SMS provider. `/w` gains "find my
invitation" (§2); everything personalised stays at `/rsvp/[token]` and is
keyed by household. This deletes an entire authentication subsystem from the
spec and keeps `room`-style features household-keyed throughout.

**Q2 — not a destination wedding. Local, "maybe set up a bus".** This is the
biggest change. Aisle's travel-and-stays apparatus — multi-hotel room blocks,
rooms, nights, prices, holds, rooming lists, airports, flight times — is
**cut**. What replaces it is smaller and more useful: parking, a couple of
recommended places to stay as plain links, and **a coach**, done properly —
named runs, timed pickup stops, and seats a household reserves from their
RSVP page so you get a manifest for the day. See the rewritten §7. Three
tables disappear from §4; two smaller ones arrive.

**Q4 — money links out, intent is recorded.** Confirmed. No Stripe, no card
handling, no refunds. Coach seats are a reservation, not a transaction. (This
originally also settled how registry funds would work; round two cut the
registry entirely, so Q4 now governs the coach alone.)

**Q3 (part) — the theme is Script.** Script display over a humanist serif,
centred, monogram, floral rule — the traditional one. It ships first and is
the only preset that has to exist for step 1 of the build order. The other
three presets stay in the spec as a system, not as work. §5 is rewritten
around this. Still owed: whether photographs exist yet, which decides the
hero style — answered in round two, below.

**Net effect of round one:** roughly a third smaller. Steps 1–3 of the build
order (§15) now need **no migration at all**, so the theme, the schedule, the
FAQ and the whole invitation surface can ship before any schema is written.

### Round two, same day

**Q12 — an open-source script face. Step 1 is unblocked.** No licence to buy,
no purchase to wait on. Pinyon Script, Italianno or Petit Formal Script, all
self-hostable under the OFL. This is a better decision than it looks: §5 uses
the script for the couple's names and the section rules *only*, never at body
or label size, and at display size used that sparingly the gap from a £200
foundry face is small. Specific recommendation and the reasoning in §5.

**Q3b — photographs exist, so `hero_style: 'framed'`.** The hero is built once,
with the image, and the AVIF/WebP + blurhash pipeline moves into step 1 rather
than arriving later. `type` stays in the system as the fallback when no image
is set, which is also what a half-configured site should render.

**Q5 — guest photo uploads: yes, gated to `/rsvp/[token]`, moderated.**
Settled as recommended. `site_assets` keeps its `uploaded_by` and `approved_at`
columns, and `gallery.moderation` defaults to `review`.

**Q6 — no registry section at all.** §8 is **cut**, and `registry_items` and
`registry_pledges` leave the schema with it. Two tables, a planner screen, a
public section, the pledge anonymity rule and the thank-you list, all gone.
§8 is kept in the file as a short record of the decision and what it would
take to reverse — an empty "Gifts" heading is worse than no gifts heading, and
so is a spec that quietly forgets why something is missing.

### Round three, same day — the last five

**Q11 — first person plural. The site is written as "we".** "We're getting
married", "we'd love you to come", "we've put a coach on". Every default
string in §§3, 10 and 12 is written that way, and §10's FAQ answers read as
the couple talking rather than a venue's terms and conditions. One deliberate
exception, §12.2: the **invitation and save-the-date keep formal third person
on their face**, because that is a typographic tradition rather than a voice —
"Sarah and James request the pleasure of your company" set in Pinyon Script is
the thing being copied. The button underneath it still says "See the details".

**Q7 — no SMS.** Email plus the WhatsApp copy-out V1 already ships. No
provider, no per-country compliance, no opt-out handling. Adding it later
touches only the sender, so nothing here forecloses it.

**Q8 — no password gate for now**, `noindex` on. Recorded in §11 with its
cost: it is a signed cookie and a form, roughly half a day, addable at any
point without touching anything else. Not built, not designed around.

**Q9 — add the slug: `/w/[slug]`.** This retires the "takes the first
wedding" hack that `src/app/w/page.tsx` currently admits to in a comment. No
custom domain.

> **This one changes §4 after it was called final.** The slug needs a
> `slug` column on `weddings` — a unique, lowercase, URL-safe text column with
> a backfill for the existing row. It is one column and one index rather than
> a new table, but the claim "every question that changes a table's shape is
> answered" was made one question too early, and the migration is a line
> longer than advertised. §4 carries it now.

**Q10 — the site stays up indefinitely, the planner pays.** No expiry, no
archive step, no shutdown date. Recorded in §11 as a standing cost rather than
left to be discovered at a renewal in three years.

**Net effect of all three rounds:** the spec is roughly half the size it was
drafted at, nothing waits on a purchase or a decision, and **every question is
closed**. What is still owed from outside is not a decision but a reference:
screenshots of the Aisle example, or that host on the egress allowlist, so
§5's proportions stop being this session's judgement.

---

## Build status — handoff, 2026-09-17

**Steps 0 and 1 are built, and step 2 is most of the way there. Steps 3–5 are
not started.** Everything below was verified by `npm run typecheck`,
`npm test` (399), `./scripts/verify-migrations.sh` (187 assertions) and
`npm run build`. **Nothing has been opened in a browser,
and nothing has run against a live Supabase project** — the same caveat every
spec since 1 carries. In particular the fonts have never been rendered, the
theme has never been seen, and no query below has returned a real row.

### Done

| Step | What exists | Where |
| --- | --- | --- |
| 0 | `weddings.slug`, `slugify()`, the insert trigger that derives one, shape check, unique index | `supabase/migrations/0015_wedding_slug.sql`, `supabase/tests/06_wedding_slug.sql` (20 assertions) |
| 1 | Self-hosted Pinyon Script + EB Garamond, latin & latin-ext, ~300KB | `src/lib/fonts/` |
| 1 | WCAG contrast maths and the palette validator | `src/lib/theme/contrast.ts` |
| 1 | 4 presets (only `script` available), 6 palettes, `resolveTheme`/`themeTokens`/`themeCssVars` | `src/lib/theme/presets.ts` |
| 1 | The five tokens as CSS variables, so the site re-themes its subtree | `tailwind.config.ts`, `src/app/globals.css` |
| 1 | Section model: payload readers, FAQ split/group, `hasContent`, `resolveSections`, `navItems` | `src/lib/site/sections.ts` |
| 1 | Monogram derivation | `src/lib/site/names.ts` |
| 1 | RFC 5545 serialisation | `src/lib/ics.ts` |
| 1 | Nav, hero, countdown, section shell, schedule, FAQ, story, party, things-to-do, RSVP pointer | `src/components/site/` |
| 1 | The public read path | `src/server/queries/site.ts` |
| 1 | `/w/[slug]`, and `/w` kept as a redirect | `src/app/w/` |
| 1 | `GET /api/public/events/[id]/ics` | `src/app/api/public/events/[id]/ics/route.ts` |
| 1 | **The `/site` editor** — every section listed, show/hide, reorder, inline forms, repeaters for list sections, per-event dress codes and map links | `src/app/(planner)/site/`, `src/components/site/editor/`, `src/lib/site/editor-fields.ts` |
| 1 | **`/site/theme`** — preset, palette, custom colours with the contrast check running live, hero style, monogram | `src/components/site/editor/theme-editor.tsx` |
| 1 | The write path, with per-section payload validation | `src/server/actions/site.ts` |
| 2 | **The FAQ starter library**, 18 questions as drafts, added by a button that appends and skips duplicates | `src/lib/site/faq-library.ts` |
| 2 | A full example site in the seed, so a reset renders every section type | `supabase/seed.sql` |
| 2 | "Site" in the planner nav | `src/components/nav.tsx` |

Unit tests added: 93 (theme 28, sections 29, names 6, ics 15, faq library 8,
editor fields 7). Total 399.

### Not done, and worth knowing before picking this up

**The biggest gap now is step 3, the invites.** The site itself is editable
end to end: a planner can write every section, reorder them, hide them, pick a
theme and a palette, and see the result. What nobody can do yet is send
anything.

Specifically outstanding:

- **No preview-as-guest.** The editor links out to the live site rather than
  rendering it inline at phone width. `/site/theme`'s preview is a colour
  strip that says so — the real faces only load on the public site.
- **No hero image can be uploaded.** `SiteHero` renders `framed` from a
  same-origin path in the payload and falls back to `type` otherwise, and the
  editor asks for a path with that caveat written into its help text. The
  storage it should read from is `site_assets`, which is in `0016` at step 4.
  Q3b moved the image pipeline into step 1 and it is half-moved: the
  rendering is here, the upload is not.
- **`gallery.uploads_open` and `gallery.moderation` are stored and do
  nothing.** The editor writes them and the renderer ignores them, because
  guest uploads are step 5. The editor's help text says so rather than
  implying a working switch.
- **"Find my invitation" (§2) does not exist.** The RSVP section says "message
  us" rather than linking to it. That copy is the placeholder — it becomes the
  link when the lookup is built.
- **The scroll motion in §5 is not implemented.** No fade-and-rise, and so
  nothing yet reads `prefers-reduced-motion` on the public site.
- **No print stylesheet for the site**, and `/w/schedule` and `/w/travel` as
  standalone routes do not exist — the site is one scrolling page only. The
  existing print rules in `globals.css` are V1's, for `/invitations/print`.
- **`site_visits` (§13) is not built.** No analytics of any kind.
- **Step 3, invites: nothing.** Save-the-date, the `/i/[token]` card, its
  Open Graph image, the print-ready PDF with a household QR code, and
  broadcasts. This is the only part of the spec carrying a date that cannot
  move, and it is now the largest single piece left.
- **Step 4, getting there: nothing.** `0016_public_site.sql`, the coach with
  its runs, stops, capacity and manifest export, parking, places to stay as
  structured rows rather than the free-text block the editor writes today,
  and the static map.
- **Step 5, the gallery: nothing** beyond published moodboards appearing in
  the section, which predates this spec.

### Three corrections this build made to the spec above

1. **EB Garamond has no small caps.** §5 claimed it "ships real small caps
   rather than the browser's faked ones". Its Google build exposes no `smcp`
   feature at all (verified with fontTools: only `liga`, `frac`, `numr`,
   `dnom`, `tnum`, `pnum`, `locl`, `rlig`). Labels are letterspaced uppercase
   instead, which is what stationery does anyway, and §5 now says so.
2. **The `line on paper` contrast check is advisory, not blocking.** §5 said
   palettes ship "pre-checked at 4.5:1 for body text and 3:1 for large text"
   and the implementation applied 3:1 to section rules. All six palettes sit
   near **1.2:1** there, because a hairline rule is supposed to be faint.
   Enforcing it would force rules in near-black. Every text pair still blocks.
3. **The `.ics` route is under `/api/public/`, not `/api/events/`.**
   `src/lib/public-paths.ts` warns that an over-broad public prefix exposes
   routes that do not exist yet; `/api/events` would have done that.

### Environment notes for the next session

- `./scripts/verify-migrations.sh` **must not run as root** and the container
  has no unprivileged login user by default. The existing `postgres` system
  user works: `su postgres -s /bin/bash -c "cd <repo> && ./scripts/verify-migrations.sh"`.
- `npm run build` fails on a clean checkout with no `.env.local` — it dies
  collecting page data for `/api/export/[kind]`. This predates spec 14
  (confirmed by stashing). Copy `.env.example` and put any non-empty strings
  in; no network call is made with them.
- `aisle.wedding` is still blocked by the egress policy, so §5's proportions
  are still this session's judgement. See §0.

---

## 0. A caveat about the research, read this first

**`aisle.wedding` is blocked by this session's egress policy.** Every request
to that host — including `/example-wedding` — is refused by the proxy with a
403, and the proxy README is explicit that policy denials are to be reported
rather than routed around. So **nobody on this side has actually looked at
the example site.**

What follows was assembled from search-engine descriptions of Aisle's own
pages (`/features`, `/guides/couples/website-examples`,
`/guides/couples/website-faq`, `/compare/…`) plus their published help
material. That is good enough to tell you *what capabilities exist* and
roughly how they are framed. It is **not** good enough for layout, spacing,
type scale, motion, or the actual words on the page — i.e. precisely the
"vibes" half of the request.

Two ways to close that gap, both cheap, both needing the planner:

- **Screenshots.** Full-page captures of `/example-wedding` (desktop and
  phone) dropped into the repo or pasted into a session. Fastest path, and
  enough to build §5 properly.
- **Un-block the host.** If `aisle.wedding` is added to the environment's
  egress allowlist, a later session can read the markup directly and this
  section gets deleted.

Everything in §§1–13 is written so it stands up either way: the feature set
and the data model do not change when the screenshots arrive. Only §5 (the
design system) and the copy defaults in §§3, 10 would be revised — and since
the planner has now picked the Script preset, even §5's remaining exposure is
narrow: proportions and rhythm, not which direction to go in.

---

## 1. What this feature is

V1 built the private half of a wedding: a guest list, a ranked cut line, one
tokenised link per household, RSVPs per guest per event, chasing, exports.
The public half is one file — `src/app/w/page.tsx` — and its own header
comment admits what it is:

> Deliberately thin, and deliberately server-rendered from structured
> blocks: the design work belongs in V2 or V3, when there are photographs to
> design around.

This spec is that design work, plus the content model underneath it, plus
the invitation surface that drives traffic to it. Concretely it turns `/w`
from *a page that exists so guests can find their lost RSVP link* into **the
thing you send people**, and turns invitations from *a token in an email*
into **a piece of stationery with a schedule attached**.

### What Aisle does that we do not

| Aisle | Us today | This spec |
| --- | --- | --- |
| Home / Our Story / Schedule / Travel / Stays / Registry / Gallery / FAQ / RSVP | Hero, "The day", "Getting there", "Questions", moodboards, an RSVP note | §3 — all of them as blocks, less Registry |
| Themes: palettes, font pairings, hero imagery | One serif, one neutral palette, no hero image | §5 |
| Guest verifies with a phone number, then sees *their* page | One opaque token per household | §2 — keep the token, add lookup |
| Room blocks at several hotels, rooms, nights, price, guest picks and pays | — | **Cut** — Q2, not a destination wedding |
| Airports, shuttles, trains, car hire, with cost / duration / booking link | One free-text "Getting there" paragraph | §7 — reduced to parking, taxis, a train line, and a coach done properly |
| Registry links plus cash contributions toward named things | — | **Cut** — Q6, no registry section |
| Gallery, including guest uploads after the day | Moodboards (planner-curated only) | §9 — in, gated to the token and moderated |
| FAQ populated from dashboard answers; six shown, rest expand | A flat `faq` block | §10 |
| Password / phone-gate, custom domain, site lives five years | `noindex`, no gate, no domain | §11 |
| Save-the-date → invitation → broadcast updates, email and SMS | Invitation email + a WhatsApp copy button | §12 — email and WhatsApp; SMS declined |
| Natural-language setup ("add a welcome dinner Friday at seven") | — | Not copied — §13 |

### What this spec is *not*

Not a second CMS. `site_content` already exists and already does
key → JSONB → sort_order → visible; everything below is more block kinds and
a renderer worth looking at, not a new storage idea. Not multi-tenant public
routing either: Q9 adds a slug, `/w/[slug]`, and stops there — no custom
domain, no hostname routing.

---

## 2. The one architectural fork: who is the guest site *for*?

This is the decision that shapes everything else, so it comes before the
feature list.

**Aisle's model:** the site is public-ish, and a guest verifies with their
phone number to unlock a personalised portal — their room, their shuttle
time, the events *they* are invited to, their meal choice. One identity per
person, established by SMS.

**Our model:** the household is the invite unit. One opaque token per
household, no account, no verification, no phone number required — which is
the point, because a chunk of any real guest list has no phone we hold and
no inclination to receive a code.

**Decided (Q1): keep the token. Phone verification is not being built.** Add
two things that get most of Aisle's felt benefit for a fraction of the surface:

1. **"Find my invitation"** on `/w`. A guest types the email address or
   phone number we already have on file. If it matches exactly one
   household, we *re-send that household's existing link* to that same
   address — we never display it on screen, and the response is identical
   whether or not there was a match. That turns "I lost the link" from a
   text message to the couple into a self-service action, without creating
   an authentication system, without leaking who is on the list, and without
   an enumeration oracle. Rate-limited on the same machinery as
   `rsvp_token_attempts`.
2. **The personalised view lives at `/rsvp/[token]`, not on `/w`.** It
   already does. This spec extends it: the household's own events, their
   room if one is assigned, their shuttle, their answers — the Aisle portal,
   addressed by token instead of by phone. `/w` stays the page anyone with
   the link can read.

The cost of this choice, accepted: personalisation is per *household*, not
per person, so "your coach leaves The Crown at 14:20" is a household-level
statement, and coach seats are reserved as a number per household rather than
named per guest. For a wedding that is nearly always right — a household
travels together. True per-guest portals would be a different spec, and it
would start with collecting a verified phone number for every guest.

---

## 3. The site: sections, in order

One scrolling page with a sticky nav that jumps between sections, plus real
routes (`/w/schedule`, `/w/travel`, …) for anything that wants to be linked
or printed on its own. Single scroll is the right default — Aisle's own RSVP
sits on the same page as the schedule and travel notes, and a guest on a
phone will not navigate.

Each is a `site_content` row. `block_key` is the section, `payload` is its
JSONB, `sort_order` orders them, `visible` hides one without deleting its
content. Sections with no content do not render, and do not appear in the
nav — an empty "Photos" heading is worse than no photos section.

| `block_key` | Section | Payload shape (summary) |
| --- | --- | --- |
| `theme` | — (config, never rendered as a section) | §5 |
| `hero` | The top | `headline`, `date_label`, `location`, `image_id`, `overlay`, `cta_label` |
| `countdown` | Days to go | `enabled`, `hide_after` |
| `story` | Our story | `body` (markdown), `image_id`, plus optional `milestones[]` of `{ date, title, body, image_id }` |
| `schedule` | The weekend | `intro`; the events themselves come from `events` (§6) |
| `travel` | Getting there | `intro`, `venue_postcode`, `what3words`; the coach from `coach_runs`, the rest from `transport_options` (§7) |
| `stays` | Where to stay | `intro`; a list of links from `accommodations` (§7) |
| `gallery` | Photos | `intro`, `uploads_open`, `moderation` (§9) — curated before the day, guest uploads after |
| `faq` | Questions | `items[]` of `{ q, a, tags[], featured }` (§10) |
| `party` | Who's who | `members[]` of `{ name, role, blurb, image_id }` |
| `things_to_do` | While you're here | `items[]` of `{ title, body, link, image_id }` |
| `rsvp` | RSVP | `intro`, `closes_label` — the block is a pointer, the form is at `/rsvp/[token]` |
| `footer` | — | `note`, `contact_email`, `hashtag` |

**Voice (Q11): every default string in this table and the sections below is
written as "we".** Section headings included — "Where to stay", not
"Accommodation"; "Getting there", not "Travel information". The one exception
is the face of the stationery in §12.2.

Moodboards already publish into `/w` (spec 9) and keep doing so, as their
own section between `story` and `gallery` — the dress-code board is exactly
the kind of thing guests open twice.

**Nav.** Derived from the visible, non-empty sections. Sticky on scroll,
collapses to a sheet under 640px, and the RSVP call-to-action is pinned to
it at every width. A guest who has already RSVP'd (we know, from their
token) gets "Your RSVP" instead of "RSVP".

---

## 4. Schema

**Two migrations, after Q9.** `0015_wedding_slug.sql` is one column and ships
with step 1; `0016_public_site.sql` is everything else and is not needed until
step 4 — steps 1–3 otherwise store everything they need in `site_content`,
which already exists. It follows the two rules in the README without
exception: every table carries `wedding_id`, every parent gets
`unique (id, wedding_id)`, every child references the composite.

```
weddings             + slug  text unique, lowercase, URL-safe          -- Q9
                     -- not a new table: one column, one unique index, and a
                     -- backfill for the row that already exists. Retires the
                     -- "takes the first wedding" hack in src/app/w/page.tsx.

site_assets          id, wedding_id, storage_path, width, height, blurhash,
                     alt, credit, kind ('hero'|'gallery'|'story'|'party'|…),
                     uploaded_by (null = guest), approved_at, sort_order

transport_options    id, wedding_id, kind ('parking'|'taxi'|'train'|'walk'
                     |'other'), name, detail, url, sort_order

coach_runs           id, wedding_id, direction ('to_venue'|'from_venue'),
                     label, departs_at, capacity, notes, sort_order
coach_stops          id, wedding_id, coach_run_id, name, address, map_url,
                     pickup_at, sort_order
coach_seats          id, wedding_id, coach_run_id, coach_stop_id,
                     household_id, seats, created_at
                     -- unique (coach_run_id, household_id)

accommodations       id, wedding_id, name, address, url, distance_label,
                     notes, image_id, sort_order

site_visits          wedding_id, day, section, count               -- §13
```

Plus one view, `v_coach_runs`, carrying seats taken per run and per stop, so
the "34 of 49" on the page and the capacity check in the action read the same
number from the same place.

**Cut, and recorded here so nobody re-adds them by reflex.** By Q2:
`accommodation_rooms`, `room_holds`, and the cost/duration columns on what was
`travel_options` — a destination wedding needs all three, this one does not.
By Q6: `registry_items` and `registry_pledges` (§8).

On `site_assets`, Q5 confirms the two columns that carry guest uploads:
`uploaded_by` null for a guest upload, and `approved_at` null until the
planner approves it. The household that uploaded an image is recorded for the
"remove this" control in §9, which means guest uploads are household-keyed
like everything else Q1 decided.

**Storage.** `site_assets` reuses spec 9's private-bucket discipline exactly:
one bucket, no storage policies, object paths *derived* server-side from ids
already checked (`storageObjectPath()`), never accepted from a client. Public
images are served through a signed-URL route with a long expiry, not by
making the bucket public — a public bucket is a permanent, un-revocable
decision, and this one holds a guest list's faces.

**This schema is now settled**, across all twelve answers: Q1, Q2, Q4, Q5 and
Q6 shaped the tables above, and Q9 added `weddings.slug` in round three —
after §4 had already been called final, which is recorded honestly at the top
of this file rather than quietly absorbed.

One note on sequencing: `weddings.slug` is wanted by **step 1**, not step 4,
because the renderer should not inherit the "first wedding" hack. So this
splits into `0015_wedding_slug.sql` (one column, with step 1) and
`0016_public_site.sql` (everything else, with step 4). A one-column migration
is cheap; writing the public routing twice is not.

## 5. The vibes: a theme system

**Q3a answered: the theme is Script**, on an **open-source face (Q12)**, with
a **`framed` hero (Q3b)** because photographs exist. That narrows this section
from four things to build to one, with the other three kept as a system so a
change of mind later is a preset, not a rewrite — and it removes the only
item in the spec that was waiting on a purchase.

Still owed, and the reason §0's caveat has not gone away: nobody here has
seen the reference site, so the *proportions* below — type scale, rhythm,
how much air — are a defensible default rather than a transcription.
Screenshots would settle it in one pass.

**Not a page builder.** The planner picks a palette and a hero style; the
layout is fixed. This is deliberate — every wedding site that lets people
move blocks around produces a wedding site that looks like it.

### The Script preset, in detail

Stored as
`site_content['theme'] = { preset: 'script', palette, heading_font, body_font, radius, hero_style, monogram }`.

- **Display** — a script face for the couple's names and the section
  headings' ornamental line only. Used sparingly: script is illegible at body
  size and at small sizes on a phone, and a wedding site read at arm's length
  in a car park is the actual use case.
- **Body** — a humanist serif, 17px base, 1.6 line height, measure capped at
  62 characters.
- **Labels** — the same serif in small caps with generous tracking for times,
  dress codes and field labels. Never the script.
- **Composition** — centred. Headings centred, section intros centred, the
  schedule's day headings centred with the events left-aligned beneath them,
  because centred *data* is unreadable.
- **Ornament** — a monogram (two initials and an ampersand, drawn as SVG from
  the couple's names, not an uploaded image) in the header and once in the
  footer. A floral rule between sections, one weight, one colour, and it is
  the only decorative element in the system.
- **Radius** — 2px. Traditional means edges, not pills.

### The faces

Fonts self-hosted (`next/font/local`), subsetted, no runtime Google Fonts
request — a third-party font request from a guest site is a privacy leak and
a layout shift. Q12 chose open-source, so all three are OFL-licensed and ship
in the repo with no licence admin and nothing to buy.

- **Display: Pinyon Script.** The recommendation. An engraved copperplate
  script with restrained flourishes and — the part that matters — a high
  x-height for its class, so it survives being set at 40px on a 390px phone,
  which is where the couple's names will mostly be read. Italianno is the
  alternative if you want more flourish and can live with it being harder to
  read at small sizes; Petit Formal Script is the safest and the least
  distinctive. All three are free.
- **Body: EB Garamond.** Humanist old-style, a genuinely good revival, wide
  weight range, excellent at 17px, and it pairs with a copperplate script the
  way it was historically set to.
- **Labels: EB Garamond uppercase**, tracked out at about 0.14em and set a
  little smaller than the body. **Not small caps** — the corrected claim: this
  family's web build carries no `smcp` feature, so asking for small caps would
  get the browser's synthesised ones, which are capitals scaled down and come
  out thin and stretched beside the real thing. Tracked uppercase is what
  stationery does anyway, and it needs no feature support at all.

**The honest trade-off**, since Q12 was a cost decision: a £200 foundry script
is better, mostly in the joins between letters and in how the flourishes
resolve. §5's rule — script for the names and the section rules only, never at
body or label size — is what makes that gap small enough not to matter. Where
free script fonts betray a template is when they get used for headings,
buttons and captions too. This spec does not do that.

### The other three presets

Kept as a system, not scheduled. **Editorial** (high-contrast serif display,
grotesque body, magazine), **Deckle** (old-style serif, small caps, warm
off-white, letterpress), **Sans** (one geometric sans, two weights, no
ornament). Each is a token set plus a `hero_style` default; adding one later
is a file, not a refactor.

### Palettes

Six presets plus custom. Each defines five tokens — `ink`, `paper`, `muted`,
`line`, `accent` — mapped onto the Tailwind names already used across the app
(`text-muted`, `border-line`, `hover:text-accent`), so the existing components
theme for free. Every preset ships pre-checked at 4.5:1 on all four text pairs — ink, muted
and accent against paper, and paper against accent for a filled button — and
`theme.test.ts` asserts it rather than trusting it was checked once.
**Custom palettes are validated and refuse to save below those ratios.**

**The rule between sections is advisory, not blocking**, which is a correction
to this spec's original 3:1: all six palettes sit near 1.2:1 there, because a
hairline is supposed to be faint, and enforcing 3:1 would force every palette
to draw its rules in near-black. It is reported with its real ratio so the
number is visible when a rule genuinely disappears. A guest reading a schedule on a phone in sunlight
is the actual use case, and Script's natural palette — warm ivory paper, soft
grey ink — is exactly the one that fails contrast if nobody checks.

### Hero

Three styles: `full` (image bleeds to viewport, text over a scrim), `framed`
(image inset with a border, text below), `type` (no image — the names set
large in the script face, a monogram, the date).

**Q3b: photographs exist, so `framed` is what gets built**, and the image
pipeline — AVIF/WebP through `next/image`, sized, blurhash placeholder — moves
into step 1 rather than arriving with the gallery later. `framed` over `full`
is the right pairing for Script: a bordered, inset image with the names set
beneath it is the composition of an invitation, where text over a scrim is the
composition of a landing page.

`type` stays in the system as the fallback when no hero image is set, which is
also what a half-configured site should render rather than a broken frame.

### Motion

Sections fade and rise 12px on first scroll into view, 300ms, once. The
countdown ticks. Nothing else moves. All of it behind
`prefers-reduced-motion`, which disables the transforms and leaves the
opacity.

### Non-negotiables

- **Phone first.** Designed at 390px, adapted upward. Aisle's own guides put
  the FAQ as the most-visited page; that traffic is thumbs.
- **LCP under 2.5s on a throttled 4G phone.** Hero images served as AVIF/WebP
  through `next/image`, sized, with a blurhash placeholder.
- **Prints.** A print stylesheet for `/w/schedule` and `/w/travel`. Somebody's
  parent will print it.

## 6. Schedule

Reads `events` where `is_public`. Per event we already store name, start, end,
venue, address. This spec adds, in the `payload` of the schedule block keyed
by event id (so no migration on `events`): `dress_code`, `detail`,
`map_url`, `image_id`, `hide_time` (for "evening" with no committed hour).

Grouped by day with a day heading, each event a row with time, name, venue,
dress code, and a map link. Add-to-calendar per event (`.ics`, generated
server-side in the wedding's timezone — `src/lib/timezone.ts` already exists
because this is exactly where it goes wrong).

**Personalisation.** On `/rsvp/[token]`, and on `/w` when the visitor arrived
from their token, events the household is *not* invited to are still listed
but marked — "invitation only" — rather than hidden. Hiding them produces the
worse conversation: somebody mentions the welcome dinner and a guest who was
not invited discovers it was concealed.

---

## 7. Getting there, and where to stay

**Rewritten after Q2: this is a local wedding with a coach, not a destination
one.** Aisle's room blocks, rooms, nights, prices, holds and rooming lists
are cut, along with airports and flight times. What is left is the three
things a guest at a local wedding actually needs to know — how do I get
there, where do I put the car, and is there a bus — plus somewhere to sleep
if they want it.

### 7.1 The coach

The one part of this section worth building properly, because it is the part
with a headcount and a departure time.

- **Runs.** A named coach run in each direction — "Coach from town, Saturday
  afternoon", "Coach back, late". Each has a departure time and a capacity.
- **Stops.** Each run has ordered pickup points with a name, an address, a
  map link, and its own pickup time. A guest reads "The Crown, 14:20" and
  needs nothing else.
- **Seats.** From `/rsvp/[token]`, a household picks a run, a stop, and how
  many seats. That is a **reservation, not a payment** (Q4), and it gives the
  planner the thing that actually matters on the day: a manifest per run and
  per stop, exportable as CSV through the same exporter that backs the
  catering sheet.
- **Capacity is shown, not enforced silently.** "34 of 49 seats taken" on the
  page; reserving past capacity is refused with a message, not a crash. The
  count comes from a view, not a cached column, so it cannot drift.

Seats appear on the public site as read-only information ("there's a coach,
here are the stops") and become bookable only on `/rsvp/[token]`, where we
know which household is asking. Same discipline as the gallery (§9).

### 7.2 Parking and the other ways in

A flat list of `transport_options`, each a kind, a name, a paragraph, and an
optional link: **parking** (where, how much, whether it's overnight — the
single most-asked local-wedding question after dress code), **taxis** with a
local firm's number, **train** with the nearest station and how far it is
from the venue, **walking** if that is a real option, and anything else.

No costs, no durations, no booking flows. At this distance a guest wants a
sentence and a phone number.

### 7.3 Somewhere to stay

Cut to a list of links. `accommodations` holds a name, an address, a
distance label ("8 minutes by car"), a URL, an optional photo and a note —
"we've stayed here, it's fine, book early". **No room types, no nightly
prices, no blocks, no holds.** If a block gets negotiated with one hotel
later, the note field carries the code and the deadline, which is all a block
really is from the guest's side.

### 7.4 The map

A static map image plus a link out, as §11 requires — no embedded iframe
setting cookies before a guest has read a word. The venue address, a
what3words if the entrance is awkward, and the postcode spelled out for
people typing it into a sat-nav.

## 8. Registry — cut

**Q6: no registry section.** Not links, not funds, not a hidden section
waiting to be switched on. `registry_items` and `registry_pledges` are out of
§4, `/registry` is out of §13, and the `registry` block is out of §3.

Recorded rather than deleted, because a spec that quietly forgets why
something is missing invites somebody to helpfully re-add it. If this is
revisited, the shape it would take is: two kinds in one list — `link` (a
store, a logo, a sentence) and `fund` (a named thing with an optional target,
linking out to whatever the couple already uses, per Q4's link-out rule) —
plus a pledge record that exists to produce the thank-you list, anonymous
unless the giver opts in. That is about a day's work on top of the settled
schema, and nothing else in the spec depends on it.

What replaces it on the public site: nothing. The FAQ's starter library
already carries "What's the gift situation?" (§10), which is the right place
for a sentence about it, and a sentence is what most couples actually want to
say.

---

## 9. Gallery

Two lifecycles on one section.

**Before the day:** curated. Engagement photos, the venue, anything the
couple uploads. This is `site_assets` with `kind = 'gallery'`, uploaded from
the planner side.

**After the day:** open. **Q5 settled this as in, gated and moderated.**
`gallery.uploads_open` turns on an upload control **on `/rsvp/[token]` only** — a guest uploads from
the link they already hold, so uploads are attributable to a household and
the open internet cannot post to the wedding's gallery. This is the one place
where insisting on the token instead of a public form pays for itself
immediately.

Moderation, per `gallery.moderation`: `auto` (appear at once) or `review`
(the planner approves; `site_assets.approved_at`). **`review`, per Q5** —
`auto` stays in the system because it is one line and the week after a wedding
is exactly when approving forty photos stops being appealing.
Uploads are capped per household and per file, stripped of EXIF GPS on
ingest, and images only — no video in V1, because video is a transcoding
pipeline wearing a small feature's clothes.

Every uploaded image gets a "remove this" control for the household that
posted it, and the planner can remove anything. Both are hard deletes from
storage, not a flag: somebody will want a photo gone the same evening.

---

## 10. FAQ

Aisle's own analytics say this is the most-visited page of a wedding site,
and that they show six by default and expand the rest. Copy both.

Extend the existing `faq` block: each item gains `featured` (shown expanded)
and `tags[]` (grouping — "Travel", "The day", "Gifts", "Kids"). Under six
featured, render them open; the rest collapsed under their groups.

Ship a **starter library** the planner accepts, edits or deletes per item,
because a blank FAQ is the section most likely to stay blank. Aisle's guides
put it at ten general questions plus ten destination ones; the same shape,
in our words:

*What's the dress code? · What time should I arrive? · Can I bring a plus
one? · Are kids invited? · Where do I park? · Is it indoors or outside? ·
What's the weather usually like? · Will there be food and drink, and what if
I can't eat something? · Is the venue accessible? · When do I need to RSVP
by? · Where should I stay? · How do I get there from the airport? · Is there
a shuttle? · Do I need a car? · What's there to do the rest of the weekend? ·
What currency and do places take cards? · Do I need a visa? · What's the
gift situation? · Can I take photos during the ceremony? · Who do I ask if
something goes wrong on the day?*

Three rules, worth keeping as editor hints. Two are Aisle's: answers in two to
four sentences, and anything logistical carries a direct link to the thing the
guest will actually use. The third is Q11's: **answers are written as "we"** —
"we'd rather you didn't", "we've put a coach on", "we're not doing a gift
list". "The couple ask that guests refrain from…" is how a venue writes, and
it is the single fastest way to make a wedding site feel like an event
management system.

---

## 11. Privacy, access and the address

**`noindex` stays the default.** The current page's comment is right — a
wedding site turning up in search results for the couple's names is a
decision, not an accident. A setting can flip it, with a clear warning.

**No password gate (Q8).** Anyone with the link can read the site; nothing in
search results points at it. Specified but **not built**, so the cost is known
if it is ever wanted: one passphrase for the whole site, set in settings, held
in a signed httpOnly cookie for 30 days, gating `/w` only — `/rsvp/[token]` is
already gated by its token and a guest arriving on their own link is never
asked. Roughly half a day, addable at any point, touching nothing else. If a
reason appears — a family situation, an ex, somebody with a public profile —
it is not a redesign.

**The address: `/w/[slug]` (Q9).** A `slug` on `weddings` (§4), unique and
URL-safe, replacing the current "takes the first wedding" behaviour. This is
wanted by step 1 so the renderer never inherits that hack.

**No custom domain.** `theirnames.com` → the Vercel project would additionally
need a `wedding_domains` mapping and hostname routing on top of the slug. Not
being built. The slug is the part that pays for itself; the domain is the part
that only pays off if this becomes a product for other people.

**How long it lives: indefinitely, and the planner pays (Q10).** No expiry, no
archive step, no shutdown date, no code. Written down here because it is a
standing cost rather than a free one — the Supabase project and the Vercel
deployment keep running, and guests will link to this for years, including
from their own photo albums. Aisle advertises five years and charges for it;
this is the same promise made privately. The thing to avoid is discovering it
at a renewal in three years and letting it lapse by accident.

**No third-party anything on the guest site.** No Google Fonts, no analytics
SDK, no embedded map iframe that sets cookies before a guest has read a word.
Maps are a static image plus a link out. §13's counters are first-party rows.

---

## 12. Invites

The other half of the request, and the half with the deadline.

### 12.1 Three sends, one link

- **Save the date.** Early, minimal: names, date, place, "invitation to
  follow", and the site link. No RSVP. Aisle's own guidance: six to nine
  months out, nine to twelve for destination.
- **The invitation.** The existing tokenised send — household link, events
  covered, RSVP deadline.
- **Updates.** Broadcasts after the invitation: a schedule change, a shuttle
  time, a nudge about the room block releasing.

All three carry the *same* household token. One link per household for the
life of the wedding is the property that makes "find my invitation" (§2)
possible and makes a QR code on printed stationery safe to reprint.

### 12.2 Digital stationery

A save-the-date and an invitation are each a themed HTML email **plus** a
shareable card page at `/i/[token]` — the thing you send over WhatsApp, which
is how a real proportion of any guest list will actually receive it. The card
page uses the site's theme (§5), shows the names, date, place and a "See the
details" button, and renders an Open Graph image so the WhatsApp preview is
the card rather than a naked URL.

**Voice, per Q11.** The site is written as "we" throughout — but the
**stationery itself keeps formal third person on its face**: "Sarah and James
request the pleasure of your company", set in Pinyon Script. That is a
typographic tradition rather than a voice, and it is specifically the thing
being copied from a printed invitation. Everything around it — the button, the
email's preheader, the surrounding paragraph, the whole site the card links to
— is "we". The two do not clash; they are doing different jobs. Emails are table-layout, inline
CSS, dark-mode-tested, with a plain-text alternative — the existing
`supabase/templates/` is where they go.

The same design renders to a **print-ready PDF** at the standard invitation
sizes with a QR code to the household's link, so the paper and the digital
are one design. This is the piece that makes "invites" feel like a product
rather than a mailmerge.

### 12.3 Broadcasts

Extend the sender: choose a segment (a tag, a tier, an event's invitees, a
cut-line side, "everyone who hasn't replied"), write once, preview as a
named household, send. Every send writes `message_log` rows with a
`dedupe_key`, so the existing guarantee holds — nobody gets the same
broadcast twice.

The chasing cron (V1) is untouched and stays separate: it is automatic and
conditional, broadcasts are manual and deliberate, and merging them is how
somebody accidentally mails four hundred people at 03:00.

**SMS: no (Q7).** Aisle offers it; it brings a provider, per-country
compliance, opt-out handling, sending limits, and a phone number for every
guest we mostly do not have. The WhatsApp copy-out that V1 already ships
covers the same need at zero operational cost. Q1's answer removed the only
structural reason to hold a phone number for every guest, and adding SMS later
touches only the sender, so nothing here forecloses it.

### 12.4 Before any of this sends

Unchanged from the README, and restated because it sits in front of the one
immovable deadline: **SPF, DKIM and DMARC on the sending domain, warmed up.**
Without them the invitations land in spam and you learn about it from a
relative. It takes days. Do it before the stationery is designed, not after.

---

## 13. Planner-side screens

New, under the existing `Nav` grouping that spec 13 established:

- **`/site`** — the editor. A section list (reorder, show/hide), a form per
  section, a live preview pane at phone width, and a "Preview as guest"
  toggle that renders `/w` exactly as a given household sees it.
- **`/site/theme`** — theme, palette, fonts, hero, with the contrast
  validator (§5).
- **`/travel`** — the coach (runs, stops, times, capacity) with a manifest
  export per run and per stop, parking and the other ways in, and the list of
  places to stay. One screen, not three: Q2 shrank all of it to fit.
- **`/gallery`** — curated assets, plus the moderation queue when uploads are
  open.
- **`/invitations`** — extended with the save-the-date and broadcast sends,
  and the stationery preview/PDF.

**Analytics, first-party and deliberately dull.** `site_visits` counts
section views per day. That is enough to answer "is anyone reading the FAQ"
and "did the shuttle update get seen", and it introduces no third party to a
page full of guests' names.

**Not copied: the AI assistant.** Aisle sets a wedding up from natural
language ("add a welcome dinner Friday at seven"). It demos well. This
product's users are two people entering roughly forty facts once, and a form
they can see is easier to trust with the guest list than a chat box. If it
comes back, it comes back as a bulk-paste importer for the schedule, which is
the 20% that carries the value.

---

## 14. Open questions

**None. All twelve are answered**, across three rounds on 2026-09-17, and
recorded in full at the top of this file.

### 14.1 The answers, in one place

| # | Question | Answer |
| --- | --- | --- |
| 1 | Guest identity | Household token. No phone verification. |
| 2 | Destination wedding? | No — local, with a coach. Room blocks and airports cut. |
| 3a | Theme | Script. |
| 3b | Hero | `framed` — photographs exist. |
| 4 | Payments | Link out, record intent. |
| 5 | Guest photo uploads | In, gated to `/rsvp/[token]`, moderated. |
| 6 | Registry | Cut entirely. |
| 7 | SMS | No. Email plus the WhatsApp copy-out. |
| 8 | Password gate | No, `noindex` on. Specified but not built. |
| 9 | One wedding or many | Add `/w/[slug]`. No custom domain. |
| 10 | Site lifespan | Indefinite, planner pays. |
| 11 | Copy voice | First person plural, except the face of the stationery. |
| 12 | Script typeface | Open-source (Pinyon Script). Nothing to buy. |

### 14.2 What is still owed, and by whom

Not a question — a dependency. **`aisle.wedding` has never been read from this
side** (§0). The feature set and the schema do not depend on it, but §5's
proportions — type scale, rhythm, how much air — are this session's judgement
rather than the reference's. Closed by either full-page screenshots of
`/example-wedding` (desktop and phone) or that host on the environment's
egress allowlist.

Two things also carried over from earlier sessions and unrelated to this spec:
`0013`/`0014` have never been applied to the live project, and
`ensure-bucket.mjs` has never run against it. Moodboards on `/w` (§3) will not
render until both happen. `/api/health` confirms.

## 15. Build order

All twelve answers in. **Nothing in this list is blocked.**

0. **`weddings.slug`** (§4, Q9) — one column, one unique index, one backfill,
   as `0015_wedding_slug.sql`. Shipped with step 1 so the renderer is written
   against `/w/[slug]` once rather than against the "first wedding" hack and
   then again.
1. **Theme and renderer** (§5, §3) — the Script preset on Pinyon Script and EB
   Garamond, the palette tokens and their contrast validator, the SVG
   monogram, the `framed` hero **with its AVIF/WebP + blurhash pipeline**, the
   section renderer, the nav, the `/site` editor skeleton. `/w/[slug]` becomes
   a wedding site using the content it already has.
2. **Schedule and FAQ** (§6, §10) — the two sections guests actually open,
   plus the starter FAQ library **written in "we"**, per-event dress code and
   `.ics`. `site_content` payloads, no migration.
3. **Invites** (§12) — save-the-date, the `/i/[token]` card with its OG image,
   the print-ready PDF with the household QR code, and broadcasts. No
   migration — it reuses `invitations` and `message_log` as they stand.
   **This is the only part of the spec carrying a date that cannot move**, so
   if the send is close it goes first, ahead of even step 1; the card inherits
   whatever theme exists at the time.
4. **Getting there** (§7) — `0016_public_site.sql`, the coach with its runs,
   stops, capacity and manifest export, parking and the rest, the places to
   stay, the static map. Seat reservation on `/rsvp/[token]`.
5. **Gallery** (§9) — curated first, sharing step 1's image pipeline. Guest
   uploads and the moderation queue can land close to the day, because that is
   when they start mattering.

**Not being built:** the registry (Q6), the password gate (Q8, specified in
§11 at about half a day if it is ever wanted), a custom domain (Q9), SMS (Q7),
and any expiry or archive step (Q10).

Steps 0–3 are worth shipping alone and, between them, need one column. They
are the difference between a page that carries information and a page you are
willing to send to four hundred people.

## 16. Done when

- `/w/[slug]` renders every section in §3 from `site_content` in the Script
  theme with a `framed` hero, passes contrast at 4.5:1, has an LCP under 2.5s
  on throttled 4G, and reads correctly at 390px.
- No string on the public site refers to the couple in the third person,
  except the face of the stationery in §12.2.
- A guest who lost their link can get it re-sent from `/w` without exposing
  whether their address is on the list.
- A household can see the events they are invited to, their coach stop and
  time, and their own answers on `/rsvp/[token]`.
- A household can reserve coach seats, and the planner can export a manifest
  per run and per stop.
- A save-the-date, an invitation and one broadcast can each be sent to a
  chosen segment, once, from `/invitations`, and the same design exports as a
  print-ready PDF carrying that household's QR code.
- A guest can upload a photo from their RSVP link, the planner approves it,
  and it appears in the gallery — and either of them can delete it.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` and
  `npm run build` are green, and `0015`/`0016` have been applied to the live
  project.
