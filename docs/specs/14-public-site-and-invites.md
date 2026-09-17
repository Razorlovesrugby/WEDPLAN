# Spec 14 — The public wedding site, and the invites that point at it

**Status: proposed, partly answered (2026-09-17 — see the next section).
Nothing is built, schema included, until §14.2's remaining questions have
answers too.**

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
handling, no refunds. Registry funds link to whatever you already use, and a
pledge is a note to you that produces the thank-you list (§8). Coach seats
work the same way: a reservation, not a transaction.

**Q3 (part) — the theme is Script.** Script display over a humanist serif,
centred, monogram, floral rule — the traditional one. It ships first and is
the only preset that has to exist for step 1 of the build order. The other
three presets stay in the spec as a system, not as work. §5 is rewritten
around this. Still owed: whether photographs exist yet, which decides the
hero style (§14.2 Q3b).

**Net effect on scope:** roughly a third smaller. Steps 1–3 of the build
order (§15) now need **no migration at all**, so the theme, the schedule, the
FAQ and the whole invitation surface can ship before any schema is written.

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
| Home / Our Story / Schedule / Travel / Stays / Registry / Gallery / FAQ / RSVP | Hero, "The day", "Getting there", "Questions", moodboards, an RSVP note | §3 — all of them, as blocks |
| Themes: palettes, font pairings, hero imagery | One serif, one neutral palette, no hero image | §5 |
| Guest verifies with a phone number, then sees *their* page | One opaque token per household | §2 — keep the token, add lookup |
| Room blocks at several hotels, rooms, nights, price, guest picks and pays | — | **Cut** — Q2, not a destination wedding |
| Airports, shuttles, trains, car hire, with cost / duration / booking link | One free-text "Getting there" paragraph | §7 — reduced to parking, taxis, a train line, and a coach done properly |
| Registry links plus cash contributions toward named things | — | §8 |
| Gallery, including guest uploads after the day | Moodboards (planner-curated only) | §9 |
| FAQ populated from dashboard answers; six shown, rest expand | A flat `faq` block | §10 |
| Password / phone-gate, custom domain, site lives five years | `noindex`, no gate, no domain | §11 |
| Save-the-date → invitation → broadcast updates, email and SMS | Invitation email + a WhatsApp copy button | §12 — email and WhatsApp; SMS declined |
| Natural-language setup ("add a welcome dinner Friday at seven") | — | Not copied — §13 |

### What this spec is *not*

Not a second CMS. `site_content` already exists and already does
key → JSONB → sort_order → visible; everything below is more block kinds and
a renderer worth looking at, not a new storage idea. Not multi-tenant public
routing either: `/w` still serves "the first wedding" until somebody asks for
more (§14.2 Q9).

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
nav — an empty "Registry" heading is worse than no registry.

| `block_key` | Section | Payload shape (summary) |
| --- | --- | --- |
| `theme` | — (config, never rendered as a section) | §5 |
| `hero` | The top | `headline`, `date_label`, `location`, `image_id`, `overlay`, `cta_label` |
| `countdown` | Days to go | `enabled`, `hide_after` |
| `story` | Our story | `body` (markdown), `image_id`, plus optional `milestones[]` of `{ date, title, body, image_id }` |
| `schedule` | The weekend | `intro`; the events themselves come from `events` (§6) |
| `travel` | Getting there | `intro`, `venue_postcode`, `what3words`; the coach from `coach_runs`, the rest from `transport_options` (§7) |
| `stays` | Where to stay | `intro`; a list of links from `accommodations` (§7) |
| `registry` | Gifts | `intro`; items from `registry_items` (§8) |
| `gallery` | Photos | `intro`, `uploads_open`, `moderation` (§9) |
| `faq` | Questions | `items[]` of `{ q, a, tags[], featured }` (§10) |
| `party` | Who's who | `members[]` of `{ name, role, blurb, image_id }` |
| `things_to_do` | While you're here | `items[]` of `{ title, body, link, image_id }` |
| `rsvp` | RSVP | `intro`, `closes_label` — the block is a pointer, the form is at `/rsvp/[token]` |
| `footer` | — | `note`, `contact_email`, `hashtag` |

Moodboards already publish into `/w` (spec 9) and keep doing so, as their
own section between `story` and `registry` — the dress-code board is exactly
the kind of thing guests open twice.

**Nav.** Derived from the visible, non-empty sections. Sticky on scroll,
collapses to a sheet under 640px, and the RSVP call-to-action is pinned to
it at every width. A guest who has already RSVP'd (we know, from their
token) gets "Your RSVP" instead of "RSVP".

---

## 4. Schema

One migration, `0015_public_site.sql`, and **it is not needed until step 4 of
the build order** — steps 1–3 store everything they need in `site_content`,
which already exists. It follows the two rules in the README without
exception: every table carries `wedding_id`, every parent gets
`unique (id, wedding_id)`, every child references the composite.

```
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

registry_items       id, wedding_id, kind ('link'|'fund'), title, body,
                     url, image_id, target_minor, currency, sort_order
registry_pledges     id, wedding_id, registry_item_id, household_id,
                     amount_minor, message, anonymous, received_at,
                     created_at                                    -- §8

site_visits          wedding_id, day, section, count               -- §13
```

Plus one view, `v_coach_runs`, carrying seats taken per run and per stop, so
the "34 of 49" on the page and the capacity check in the action read the same
number from the same place.

**Cut by Q2**, and recorded here so nobody re-adds them by reflex:
`accommodation_rooms`, `room_holds`, and the cost/duration columns on what
was `travel_options`. A destination wedding needs all three; this one does
not.

**Storage.** `site_assets` reuses spec 9's private-bucket discipline exactly:
one bucket, no storage policies, object paths *derived* server-side from ids
already checked (`storageObjectPath()`), never accepted from a client. Public
images are served through a signed-URL route with a long expiry, not by
making the bucket public — a public bucket is a permanent, un-revocable
decision, and this one holds a guest list's faces.

**What gets built ahead of the remaining answers.** Nothing. §14.2 Q5 and Q6
still change table shapes (`site_assets`' guest-upload columns, and whether
`registry_pledges` exists at all).

## 5. The vibes: a theme system

**Q3 answered: the theme is Script.** That narrows this section from four
things to build to one, with the other three kept as a system so a change of
mind later is a preset, not a rewrite.

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

Fonts self-hosted (`next/font/local`), subsetted, no runtime Google Fonts
request — a third-party font request from a guest site is a privacy leak and
a layout shift. The script face needs a real licence for web use; that is a
purchase, not a decision (§14.2 Q12).

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
theme for free. Every preset ships pre-checked at 4.5:1 for body text and 3:1
for large text; **custom palettes are validated in the editor and refuse to
save below those ratios.** A guest reading a schedule on a phone in sunlight
is the actual use case, and Script's natural palette — warm ivory paper, soft
grey ink — is exactly the one that fails contrast if nobody checks.

### Hero

Three styles: `full` (image bleeds to viewport, text over a scrim), `framed`
(image inset with a border, text below), `type` (no image — the names set
large in the script face, a monogram, the date). **`type` is the default
until photographs exist**, and with the Script preset it is not a compromise:
a monogram and two names is what the front of an invitation looks like.

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

## 8. Registry

Two kinds in one list, exactly as Aisle does it:

- **`link`** — a store, with a logo and a sentence.
- **`fund`** — a named thing ("two nights in Kyoto", "the honeymoon flights")
  with an optional target and a progress indication.

**Money, again: confirmed as link-out (Q4).** A fund item links out to whatever the
couple already uses (Monzo pot link, bank details behind a click, PayPal,
Stripe payment link). `registry_pledges` exists so a guest can *tell* the
couple what they sent, which is what produces the thank-you list — it is a
record, not a transaction. Progress on a fund shows pledged totals, and the
planner can mark a pledge received. **A pledge is never shown publicly with a
name against it** unless the giver ticks a box; defaults to anonymous.

Section copy defaults to the standard disarming line, editable:
"Your being there is genuinely the gift. If you'd like to do something
anyway, here are some ideas."

---

## 9. Gallery

Two lifecycles on one section.

**Before the day:** curated. Engagement photos, the venue, anything the
couple uploads. This is `site_assets` with `kind = 'gallery'`, uploaded from
the planner side.

**After the day:** open, if the planner opens it. `gallery.uploads_open`
turns on an upload control **on `/rsvp/[token]` only** — a guest uploads from
the link they already hold, so uploads are attributable to a household and
the open internet cannot post to the wedding's gallery. This is the one place
where insisting on the token instead of a public form pays for itself
immediately.

Moderation, per `gallery.moderation`: `auto` (appear at once) or `review`
(the planner approves; `site_assets.approved_at`). **Default `review`.**
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

Two rules from Aisle's guide, worth keeping as editor hints: answers in two
to four sentences, and anything logistical carries a direct link to the thing
the guest will actually use.

---

## 11. Privacy, access and the address

**`noindex` stays the default.** The current page's comment is right — a
wedding site turning up in search results for the couple's names is a
decision, not an accident. A setting can flip it, with a clear warning.

**A shared password, optional.** One passphrase for the whole site, set in
settings, held in a signed httpOnly cookie for 30 days. This is the
"celebrity guest list / complicated family" case Aisle names. It gates `/w`
only; `/rsvp/[token]` is already gated by the token, and a guest who followed
their own link is never asked for the passphrase.

**Custom domain.** `theirnames.com` → the Vercel project, with `/w` served at
the root for that hostname. Needs a `wedding_domains` mapping and the
multi-wedding routing question (§14.2 Q9) answered first. A `siteSlug` on
`weddings` and `/w/[slug]` is the cheap half and can ship first.

**How long it lives.** Aisle advertises five years. Ours lives as long as the
Supabase project does, which is a billing question, not a code one — but it
is worth putting in writing (§14.2 Q10), because guests link to these for
years.

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
details / RSVP" button, and renders an Open Graph image so the WhatsApp
preview is the card rather than a naked URL. Emails are table-layout, inline
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

**SMS: recommend not yet.** Aisle offers it; it brings a provider, per-country
compliance, opt-out handling, sending limits, and a phone number for every
guest we mostly do not have. The WhatsApp copy-out that V1 already ships
covers the same need at zero operational cost. §14.2 Q7.

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
- **`/registry`** — items and pledges, with a thank-you checklist.
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

### 14.1 Answered, 2026-09-17

Recorded in full at the top of this file. In short: **Q1** keep the household
token; **Q2** local wedding with a coach, so room blocks and airports are cut;
**Q3a** the Script preset; **Q4** money links out, intent is recorded.

### 14.2 Still open

**Nothing is built until these are answered.** Q5, Q6 and Q12 change a table's
shape or cost money; the rest change scope.

3b. **Do photographs exist yet?** Decides `hero_style`. With Script, `type`
    (names, monogram, date, no image) is a genuinely good default and needs no
    photography at all — but if there are engagement photos, `framed` is the
    better version of the same look, and the hero gets built once instead of
    twice.
5. **Guest photo uploads after the day: in, or out?** Recommend in, gated to
   `/rsvp/[token]`, moderated by default. It adds the guest-upload columns to
   `site_assets` and a moderation queue. It is the section most likely to be
   wanted the week *after* the day, when attention is lowest — so it is worth
   deciding now and building last.
6. **Registry: links only, or funds too?** Links only is one small table.
   Funds additionally bring `registry_pledges`, the anonymous-by-default rule,
   and the thank-you list. The thank-you list is the part people underrate.
7. **SMS?** Recommend no (§12.3). Q1's answer already removed the only
   structural reason to want a phone number for every guest, so this is now
   purely a "do we want to text people" question. The WhatsApp copy-out V1
   ships covers it.
8. **Password-gate the site?** Recommend off, with `noindex` on. A local
   wedding is a weaker case for a gate than a destination one.
9. **One wedding or many?** `/w` currently serves "the first wedding" and says
   so in a comment. A slug (`/w/[slug]`) is small; a custom domain per wedding
   is not. Which is needed, and by when?
10. **How long does the site stay up after the day, and who pays for it?**
    Aisle says five years out loud. Guests link to these for years, and this is
    a billing decision the code should reflect rather than discover.
11. **Whose site is this, in the copy?** First person plural ("we're getting
    married") reads warmer; third person is more formal. With Script chosen —
    the most traditional preset — third person is the more coherent pairing,
    but it sets the tone of every default string in §§3, 10 and 12, so it
    should be a decision rather than a drift.
12. **The script typeface needs a web licence.** Self-hosting (§5) means a
    webfont licence for a face that is worth paying for — the free script
    fonts are the tell that a wedding site was made in a template. Budget is
    typically £30–£200 one-off. Which face, and who buys it? This blocks step 1
    of the build order, so it is worth doing this week.

## 15. Build order

Revised for the answers: local wedding, coach, household token, Script.

1. **Theme and renderer** (§5, §3) — the Script preset, the palette tokens and
   their contrast validator, the monogram, the section renderer, the nav, the
   `/site` editor skeleton. `/w` becomes a wedding site using the content it
   already has. **No migration.** Blocked only by Q12 (the font licence).
2. **Schedule and FAQ** (§6, §10) — the two sections guests actually open,
   plus the starter FAQ library, per-event dress code and `.ics`. Both are
   `site_content` payloads. **No migration.**
3. **Invites** (§12) — save-the-date, the `/i/[token]` card with its OG image,
   the print-ready PDF with the household QR code, and broadcasts. **No
   migration** — it reuses `invitations` and `message_log` as they stand.
   **This is the only part of the spec carrying a date that cannot move**, so
   if the send is close it goes first, ahead of even step 1; the card inherits
   whatever theme exists at the time.
4. **Getting there** (§7) — migration `0015`, the coach with its runs, stops,
   capacity and manifest export, parking and the rest, the places to stay, the
   static map. Seat reservation on `/rsvp/[token]`.
5. **Registry** (§8), if Q6 says funds.
6. **Gallery** (§9) — curated first; guest uploads can land after the day,
   because that is when they are needed.
7. **Access and address** (§11) — passphrase if Q8 wants one, then the slug,
   then a domain if Q9 asks for it.

Steps 1–3 are worth shipping alone and, between them, touch no schema at all.
They are the difference between a page that carries information and a page you
are willing to send to four hundred people — and they can ship while the
answers to §14.2 are still outstanding, because none of those questions
touches them.

## 16. Done when

- `/w` renders every section in §3 from `site_content` in the Script theme,
  passes contrast at 4.5:1, has an LCP under 2.5s on throttled 4G, and reads
  correctly at 390px.
- A guest who lost their link can get it re-sent from `/w` without exposing
  whether their address is on the list.
- A household can see the events they are invited to, their coach stop and
  time, and their own answers on `/rsvp/[token]`.
- A household can reserve coach seats, and the planner can export a manifest
  per run and per stop.
- A save-the-date, an invitation and one broadcast can each be sent to a
  chosen segment, once, from `/invitations`, and the same design exports as a
  print-ready PDF carrying that household's QR code.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` and
  `npm run build` are green, and `0015` has been applied to the live project.
