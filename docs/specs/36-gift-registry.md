# Feature spec: A gift registry, on a page of its own

**Status: proposed; Q1–Q14 and Q7a answered (2026-10-23). Not built, no
migration written.** Asked for as a plan, to be shaped together. Answers are in
the table below; none of them is "build it" — that is a separate word
(`CLAUDE.md`, "Spec requests are not build authorization").

**Depends on:** spec 14 (the public surface, `weddings.slug`, the theme), spec 21
(a suffix as the credential), spec 23/27 (site assets and the image pipeline),
spec 30/28 (`gift_funds`, the bank-details popup), spec 9.1 (`src/lib/net/`, the
SSRF-safe fetcher), spec 32 (audit-log rule for new tables). All built.
**`0026`–`0037` are not applied to the live project** (`docs/HANDOFF.md`), and
this would be `0038`.

## Answered — 2026-10-23

All fourteen questions in §12 were answered. **Two went against the
recommendation (Q1, Q7); Q7a, which followed from Q7, is answered too.** Still not
authorization to build.

| Q | Answer | What it changed |
| --- | --- | --- |
| 1 | **Plain name**, e.g. `/registry/ray-and-olivia`. | **Against the recommendation.** §4.1: no `slug_suffix`, no credential; the address is `weddings.slug`. The page is guessable by anyone who knows the couple, so the shipping address stays hidden (Q2) and "Turn off" is the only revocation — "Make a new link" is dropped. Claim-spam guards (§6.4) matter more, not less. |
| 2 | Address **only after a claim**. | §5.5/§6.3 stand. This is now the main privacy control. |
| 3 | **Quantity**, default 1. | §6.4 stands. |
| 4 | **Private undo link**; couple can also release. | §6.3 stands. |
| 5 | **No chasing**; the couple tracks status. | §7 stands; nothing auto-expires. |
| 6 | **Prices shown**, with a hide switch. | §5.3 stands. |
| 7 | **Its own separate design**, not the site theme. | **Against the recommendation.** §4.2: the registry no longer reads `siteTokens()`; it needs its own look. Q7a (below) answered: palettes and fonts of its own. |
| 8 | Gift funds: **optional switch, off**. | §9 stands. |
| 9 | **Dashboard tile only.** | §7 stands. |
| 10 | **Plain shop links**, no commission. | §5.4: the disclosure line stays in the build but **off by default**; `rel="sponsored"` is dropped (it asserts a commercial relationship that doesn't exist) in favour of `rel="noopener noreferrer"`. |
| 11 | **Top-level "Registry"** nav entry. | §12 stands. |
| 12 | **Paste-a-link autofill**, manual fallback. | §11 step 6 stands. |
| 13 | **No buyer email.** | §6.1 stands. |
| 14 | **Colour/size: owner, free text.** | §5.3 stands. |

**Q7a — answered: (b), a handful of registry-only palettes and fonts**,
independent of the site's. §4.3 below says what that means. One sub-question
was not answered and takes its recommendation unless changed: the registry
**stands apart** from the invitation's styling rather than echoing it, but
carries the couple's names and their chosen hero photo.

## 1. What was asked

> *A registry feature. Keep it simple. A beautiful landing page, separate from
> invites and guests — I should be able to send it to anyone, including people
> who can't make the wedding. A section to say thanks. Affiliate-style links; the
> ability to choose the hero image that comes in from a link. Tags and filters.
> Specs like colour and size, set by the owner, and a shipping address. A
> separate "I will buy this": a visitor clicks a button, puts in their name and
> a nice message, and the item comes off the registry. No custom links per
> guest. Guests must not see messages left by other buyers. Think of anything
> else.*

## 2. This reopens two earlier decisions — on purpose

Spec 14 Q6 cut the registry ("not links, not funds, not a hidden section"), spec
23 §8 said it "does not reopen it," and spec 25 §16 left it out again because a
contribution goal with a progress bar is "a registry with a softer name." All
three were the planner's call at the time. This is the planner asking for it,
so it is reopened — and the reasons it was cut are met, not ignored:

| Why it was cut | How this spec answers it |
| --- | --- |
| "Two tables, a planner screen, a public section, the pledge anonymity rule and the thank-you list" — a lot of surface for a sentence in the FAQ. | Accepted: this is a real feature. It is scoped to **links to retailers**, not money. |
| Registry *funds* implied a payment path. | **No payments.** Every item is a link out to a shop the couple chose; the app takes no money, holds no card, runs no checkout (spec 14 Q4 still stands). The existing "Contribute" bank-details popup stays exactly what it is (§9). |
| The pledge anonymity rule. | Stronger than before: **buyers' names and messages are never sent to any other visitor** (§6), enforced in the database, not in the UI. |

Spec 14 §8 sketched the shape if revisited: items of two kinds plus a pledge
record that exists to produce the thank-you list. This spec keeps that idea
(the **claim** is exactly that record) and drops the `fund` kind, which
`gift_funds` already covers.

## 3. The shape, in one paragraph

A **public page, separate from every invitation**, at one address the couple
copies and sends to anyone — group chat, email, a card, a friend who can't
come. It has the couple's hero image, a thank-you, and a grid of things they'd
love, filterable by tag. Each item links out to the shop. A visitor who wants
to give something presses **"I'll buy this"**, gives a name and an optional
message, and the item **leaves the registry**. They then see the shipping
address and the buy link. The couple has a planner screen: items, who claimed
what and what they wrote, what has arrived, who needs a thank-you.

It lives on **no household page**, needs **no guest record**, and reads nothing
from `guests`, `households` or `rsvp_*`. A person who isn't invited can use it
exactly as a guest can. (Spec 28 made every `/w/…` page a household's own; the
registry deliberately is not one.)

## 4. The public page

### 4.1 Address

`/registry/<slug>`, e.g. `/registry/ray-and-olivia` (**Q1: plain name**).

- One address per wedding. **No per-guest links, no tokens in the query** — as
  asked.
- The address is `weddings.slug` (already unique). There is **no suffix and no
  credential**: the page is meant to be forwarded, and anyone who knows the
  couple can guess it. That is accepted; it is why the home address is revealed
  only after a claim (Q2) and why claims are guarded (§6.4).
- "Turn off" in the planner screen is the only revocation. (An earlier draft
  had "Make a new link" and a spec-21-style suffix; Q1 dropped both.)
- `noindex`, no sitemap entry, a non-confirming "This link isn't active" page for
  anything unknown or off (the `/m/[token]` rule, `HANDOFF.md` §7).
- Open Graph image: the registry hero with the couple's names, so the link
  looks like something when pasted into a chat.


### 4.2 Landing

**Look: its own design (Q7), not the site theme — palettes and fonts per Q7a, §4.3.** The
registry therefore does not call `siteTokens()`; it carries its own tokens and
stylesheet scope. Layout below is unchanged. Top to bottom:

1. **Hero** — a photograph chosen for the registry (§5.2), names, and one line
   the couple writes ("Your being there is the gift. If you'd like to give
   something too —").
2. **Thank-you** — their own words, optionally with a second photo. Short, warm,
   and **also shown again after someone claims** (§6.3). Editable, one block of
   text, not a form.
3. **"No gifts, truly"** line — an optional sentence for people who can't come
   or don't want to buy ("A card is plenty."). Off by default.
4. **Filter bar** — tag chips (multi-select), price range, sort (Most wanted ·
   Price low→high · Price high→low · Newest), and a search box. State lives in the
   query string so a filtered view can be shared; works with no JavaScript for
   the tag chips (links), enhanced with it.
5. **The grid** — cards: image, title, store name (from the link's host),
   price (if shown), a "Most wanted" ribbon if starred, and spec chips
   ("Sage · Queen"). Tapping opens a sheet with the full image, the couple's
   note, all specs, **Buy here ↗** (the retailer link) and **I'll buy this**.
6. **Optional "or give towards …"** — the existing gift-funds block and bank
   details popup, if the couple switch it on (§9). No new money code.
7. **Footer** — the affiliate disclosure line if switched on (§5.4), nothing
   else. No app chrome, no login prompt.

Mobile-first (phone width is the main case — this link is mostly opened from a
text message). Gentle/Still motion levels apply as on the rest of the site;
reduced motion respected; every control keyboard-reachable; images have alt
text from the item title.

### 4.3 The registry's own look (Q7a: b)

- **Palettes:** five or six curated registry palettes (e.g. Linen, Sage,
  Blush, Ink, Terracotta, Sea), each stating its own `ink`, `paper`, `muted`,
  `line` and `accent`. They run through the same `validatePalette` contrast
  gate the site's palettes use, and a test asserts contrast for every one, so a
  registry can't be unreadable in a car park. **No custom hex** (the `/site`
  editor dropped it for the same reason).
- **Fonts:** three pairings chosen from faces already self-hosted in
  `src/lib/fonts` (Fraunces, Inter, EB Garamond). Adding a face means adding
  files there; no runtime Google fetch (a third-party request leaks every
  visitor's IP, `src/lib/fonts/index.ts`).
- **Independent of the site theme:** stored on `registry_settings`
  (`palette`, `type_pairing`) with defaults, never read from `site_content`.
  Changing the site's theme doesn't restyle the registry, and the reverse.
- **Picked in the registry's settings strip** with a live preview; no
  per-section styling, no motion levels beyond the site's Still/Gentle default
  (YAGNI: that is option c).
- Scoped as `[data-registry-theme]` tokens in `globals.css`, following how
  `[data-site-theme]` already works, so the registry doesn't touch the site's
  rules.

## 5. The planner's side

### 5.1 `/registry` (a new planner screen)

Two tabs, in the style of the Guests hub's `SubTabs`:

- **Items** — add, edit, reorder (drag, with Move up/down as the existing lists
  have), star as "Most wanted", hide (kept, not shown), delete (soft:
  `deleted_at`, because a claim may point at it).
- **Claims** — see §7.

A settings strip on top: page on/off, copy link, regenerate link, hero, thank-you
text, show prices, show taken items, disclosure line, shipping address, preview.

### 5.2 Hero image

Two separate pictures, both chosen by the owner:

- **The page hero** — picked from the site's photo library (`site_assets`) or
  uploaded. Has its own focal point, the way the site's cover does (spec 27).
- **Each item's image** — see below. This is the "choose which image comes in
  on the link" ask.

### 5.3 Adding an item

**Paste a link** is the main path:

1. Paste the retailer URL.
2. The server fetches it with the hardened fetcher (`src/lib/net/`, SSRF
   checks, size and time caps, no cookies) and reads the page's `og:title`,
   `og:image` (and any other `<img>` candidates marked as product images),
   `og:description` and a price from structured data when there is one.
3. The form is **pre-filled, never auto-saved**: title, a **row of candidate
   images to choose from** (tap one to make it the hero), price, store.
4. Or **upload your own image** instead, or **paste an image URL**. The chosen
   image is downloaded, re-encoded and stored in our bucket (through the
   existing encode/variants pipeline), **not hot-linked** — retailer images move
   and vanish, and a registry full of broken pictures in month six is the usual
   failure.
5. Fallback: if the shop blocks us (many do) or has no markup worth reading, the
   form is simply empty and the owner types it in. The fetch is a convenience;
   nothing depends on it.

Item fields:

| Field | Notes |
| --- | --- |
| Title | Required. |
| Link | Required `http(s)` only (a check constraint, as `gift_funds.contribute_url` has — it ends up in an `href` in front of every visitor). Rendered `rel="noopener noreferrer" target="_blank"`. |
| Image | §5.2/§5.3. Optional but strongly nudged. |
| Price | Optional, **NZD integer minor units** (spec 18; no currency column). Shown as "$120" or "about $120" (see Q6). |
| Note | One or two lines from the couple — why they want it. |
| Quantity wanted | Default 1. See §6.4. |
| Tags | Several per item, chosen from the couple's own tag list (create-as-you-type). Suggested starters: Kitchen · Dining · Bedroom · Bathroom · Home · Outdoors · Experiences · Honeymoon. |
| Specs | A short list of label + value pairs the **owner** sets: **Colour**, **Size** suggested, plus anything (Material, Model, Set of). Shown on the card and in the sheet so the buyer buys the right one. Free text, `jsonb` of `[{label, value}]`, validated by zod (≤ 8 pairs, short strings). Not filterable in v1 (§13). |
| Most wanted | Star. |
| Ship to | Defaults to the registry's address (§5.5). |
| Hidden | Not shown, not claimable, kept. |

### 5.4 Affiliate disclosure

**Q10: plain shop links, no commission.** If any link ever does earn the couple
a commission, a plain sentence at the foot of the page is the honest and (in NZ
and most places) the expected thing: "Some of these links may earn us a small
commission." Off by default; wording editable; a switch. Outbound links use
`rel="noopener noreferrer"` (not `sponsored`, since there is no commercial
relationship to declare).
**This app does not create or track affiliate links** — the couple pastes
whatever URL they have (plain product link or their own affiliate link); the app
only renders it (§13).

### 5.5 Shipping address

Entered once in the settings strip: name, lines, suburb/city, postcode, country
(defaults to New Zealand), and an optional courier note ("Leave at the gate").
Stored in **its own table, one row per wedding**, never in `weddings.*` — the
spec 28 / `0033_gift_bank_details` precedent for details that must not ride
along in a broad `select`. **It is not on the landing page.** It is shown only
to a visitor who has just claimed something (§6.3) and to the planner. Per-item
override ("deliver to the venue", "collect in store") is a free-text line on the
item, not a second address book.

## 6. "I'll buy this" — the claim

### 6.1 The flow

1. Visitor opens an item, presses **I'll buy this**.
2. A small sheet: **Your name** (required, ≤ 80 chars), **A message for us**
   (optional, ≤ 500 chars, plain text with a few line breaks, always rendered
   escaped), quantity if more than one remains. No email, no account, no
   password.
3. Press **Confirm**. One server action, atomic (§6.4).
4. The item **leaves the public page at once** for everyone, including the
   buyer's other tabs.
5. The buyer sees the **thanks screen** (§6.3).

A claim is a promise, not a purchase: the app can't know whether the shop was
ever visited. See §7 for how the couple keeps track and Q5.

### 6.2 What no other visitor can ever see

- Another buyer's **name** or **message** — never. Not in the page, not in the
  JSON of a server action's result, not in an API route.
- Enforced by structure, not by remembering to hide it:
  - `registry_claims` is **closed to `anon`** (and to `authenticated` outside
    the owning wedding's collaborators) like the song tables.
  - The public page reads through the service role on the server and selects only
    `registry_items` columns plus a computed `remaining` — the claims table is
    not joined into the public query at all.
  - The claim action returns the claimer *their own* record only.
  - A SQL test (the second-account RLS test the repo already runs for every
    table) asserts that an `anon` and a second wedding's user both read zero
    claim rows.
- "Show taken items as 'Taken'" is an owner switch, **default off** (the item
  just disappears, as asked). If switched on, a taken card shows "Someone's got
  this one 🎁" and **nothing else** — no name, no message, no date.

### 6.3 The thanks screen (and why the buyer gets the address here)

Shown once, straight after Confirm:

- The couple's thank-you text and photo (the "section to say thanks," in its most
  personal spot).
- **Where to send it** — the shipping address and courier note, with a **Copy
  address** button.
- **Buy it here ↗** (the retailer link, if they hadn't already).
- **Changed your mind?** A private **manage link** (`/registry/claim/<token>`)
  shown with a Copy button and "keep this if you might need to undo". The
  token is unguessable, stored only as a hash (the invitation/moodboard-share
  rule: `sha256(token + pepper)`), and lets them view their own claim and
  release it — which puts the item straight back. The browser also remembers the
  claim in `localStorage` so the same phone can find it again (a convenience
  only; wrapped in try/catch, the page works without it).
- Never emailed (we hold no address), so the screen says plainly: "Take a
  screenshot or save the link."

### 6.4 Races, quantity and abuse

- **Two people press the button at once.** Claiming runs in a single
  `SECURITY DEFINER`-free SQL function (`claim_registry_item(...)`, invoked with
  the service role from the action, same shape as `take_seating_snapshot`) that
  locks the item row, checks `quantity - sum(unreleased claims) >= requested`,
  and inserts. The loser gets "Someone just took this one — here are some
  others," not an error page and not a double claim. A unit-testable pure
  function mirrors the arithmetic; the SQL test hammers the real one.
- **Quantity.** An item wanting 4 (wine glasses) can be claimed 1–4 at a time;
  it leaves the page when `remaining` hits 0, and shows "2 still wanted" until
  then. Default quantity 1 covers nearly everything.
- **Claim spam / a joker claims everything.** Cheap, honest guards, not a
  captcha: a hidden honeypot field, name/message length caps, a cap on how many
  *unreleased* claims the whole wedding can receive in a ten-minute window, and
  — the real remedy — the couple can **release any claim** in one click and
  **switch the page off**. Per-IP limits would mean storing IPs, which the app
  deliberately doesn't (`invitation_views` stores none), so they are not added.
- **Release is soft.** `released_at` is stamped, the row stays — consistent
  with "no destructive writes to guest data," and so the couple can still see
  that someone claimed and backed out.

## 7. The couple's claims screen

`/registry` → **Claims**, newest first, grouped by item:

| Column | |
| --- | --- |
| Who | The name as typed. |
| Message | The note, in full, readable in place. |
| Item · qty · when | |
| Status | **Claimed → Bought → Arrived → Thanked** (the couple moves it along; "Bought" can also be set by nobody — v1 asks nothing of the buyer). |
| Actions | Release, edit status, "Mark thanked". |

Plus:

- **Thank-you list.** Filter "Arrived, not thanked," and a CSV export
  (`/api/export/registry`, a sixth kind on the existing exporter, in the zip too)
  with name, message, item, status — so writing cards is a printed list, not
  archaeology.
- A **dashboard tile**: "N new claims since you last looked" and "M claimed,
  not yet arrived." No email in v1 (Q9).
- A **link between a claim and the guest list is not made.** Names are free text
  because a claimer may be a guest, a colleague or an aunt who isn't invited;
  matching them is a v2 convenience (§13).

## 8. Everything else worth having (my "think of anything else")

In, because each is small and earns its place:

- **Registry on/off, and open/closed.** Off = "This link isn't active." Closed =
  the page stays up, claiming is disabled, with a line ("The registry has
  closed — thank you for everything"). Useful after the wedding.
- **Most wanted** ribbon and sort.
- **Preview as a visitor** from the planner screen: the real page with **no
  credential**, so every control works and **none can save** (the spec 28
  invariant: the absence of the token is the guard, not a flag).
- **Hide prices** switch (some couples find a number awkward), with the price
  filter hidden when prices are.
- **"No gifts" line** for people who can't come.
- **QR code** of the registry link, printable, for an invitation insert or a
  shower card (the repo already generates QR codes for households).
- **Duplicate-link warning** when adding an item whose URL is already on the
  list.
- **Audit log** coverage: the new tables get the `audit_row()` trigger (claims
  include a message, so redact nothing — it is not a secret — but the
  `claim_token_hash` is `[redacted]` like every token hash). Required by
  `supabase/tests/18_audit_log.sql`.
- **Soft deletes** on items and claims.
- **A seed**: a handful of sample items so `supabase db reset` renders a full
  registry.

Left out, on purpose (§13): see below.

## 9. Relationship to what exists

- **`gift_funds` + bank details** (spec 25/28) stay as they are: "put money
  towards the honeymoon" via a bank transfer the couple handles themselves. The
  registry page can show that block as a last section if the couple want it
  (**Q8**), reusing the same renderer and the same Contribute popup. One idea per
  place: *things* live on the registry, *money* lives in gifts.
- **The Gifts block on the invitation site** is unchanged. If the couple want a
  nudge, a registry link can be added to the invitation as an ordinary link in
  a block they write — no coupling, no per-household registry address.
- **Moodboards / `/m/[token]`** are the model for "public page not tied to a
  household," and for the hashed-token pattern reused by the manage link.

## 10. Data (proposed `0038_registry.sql`)

All tables: `wedding_id` on every table including joins, RLS keyed to it, `anon`
revoked, money in integer minor units, `timestamptz` throughout, additive,
append-only migration. Names are proposals.

| Table | Holds |
| --- | --- |
| `registry_settings` | One row per wedding: `enabled`, `open`, `title`/`intro`, `hero_asset_id`, hero focal point, `thanks_text`, `thanks_asset_id`, `no_gifts_line`, `show_prices`, `show_taken`, `show_funds`, `disclosure_on`, `disclosure_text`, `last_viewed_claims_at`. |
| `registry_shipping` | One row per wedding: address fields, courier note. Own table (the `0033` rule). |
| `registry_items` | `title`, `url` (http(s) check), `store`, `image_asset_id` (→ `site_assets`), `price_minor`, `note`, `quantity`, `specs jsonb`, `ship_note`, `starred`, `hidden`, `sort_order`, `deleted_at`. |
| `registry_tags`, `registry_item_tags` | The couple's tag list and the join (join carries `wedding_id`; composite FKs so a tag and item can't belong to different weddings). |
| `registry_claims` | `item_id`, `name`, `message`, `quantity`, `status` (`claimed/bought/arrived/thanked`), `claim_token_hash`, `released_at`, `created_at`, status timestamps. A unique index on the token hash. |
| `v_registry_items` | Item + `remaining` (`quantity − sum(unreleased claims)`), computed in **one** place so the page, the card ribbon and the planner list can't disagree (the `v_guest_event_invites` lesson). |

- `claim_registry_item()` and `release_registry_claim()` SQL functions (atomic;
  service role only).
- Images: stored in the existing private bucket as `site_assets` rows. **One
  real design decision:** `/api/photo/<id>` today serves only photos referenced
  by the *latest published site revision* (`photo-access.ts`). Registry images
  aren't in a site revision, so either (a) the access rule gains "or referenced
  by an enabled registry," or (b) a sibling `/api/registry-image/<id>`. I'd do
  (a) in `photo-access.ts` with its tests, since the redirect-to-a-fresh-signed-URL
  behaviour is exactly what a registry opened a week later needs.

Server side, to the repo's conventions: every write a server action in
`src/server/actions/registry.ts` returning `ActionResult`; reads in
`src/server/queries/registry.ts` wrapped in `cache()`; pure logic
(`remaining`, filter/sort/query-string parse, price formatting, the link-metadata
extractor, spec validation) in `src/lib/registry/` with unit tests; nothing
inline in a `"use server"` file.

## 11. Build order (when it is authorized)

1. `0038` + SQL tests (RLS with a second account; claim race; `anon` reads no
   claims; the three-column FK; audit coverage) + `scripts/check-migrations.sql`.
2. `src/lib/registry/` pure logic + tests.
3. Planner: settings, items (manual add first), tags, `/registry` screens, seed.
4. Public page + filters + the sheet + preview.
5. Claim action, thanks screen, manage/release link, SQL race test.
6. Paste-a-link autofill + image candidates + re-encode.
7. Claims screen, statuses, CSV, dashboard tile, OG image, QR.

Each step shippable; step 6 is the riskiest (third-party sites, this sandbox's
network policy) and the only one that can be cut without losing the feature.

## 12. Open questions — each with a recommendation

| # | Question | Recommendation |
| --- | --- | --- |
| **Q1** | Address: plain `/registry/ray-and-olivia`, or with a 5-char suffix so it can't be guessed? Both are one shareable link; the suffix just stops enumeration. | **Suffix.** The page leads to a home address and a list of who bought what. |
| **Q2** | Shipping address: on the page for everyone, or revealed only after someone claims? | **After a claim only** (§6.3). Otherwise the page is a public listing of your home address. |
| **Q3** | Items wanting more than one (4 glasses): support quantity? | **Yes**, default 1 (§6.4). |
| **Q4** | Can a buyer undo? | **Yes**, via a private manage link shown once, plus the couple can release any claim. No accounts, no email. |
| **Q5** | "I'll buy this" is a promise. Does the app chase it (reminders, auto-release after N days)? | **No.** The couple moves status along (Claimed → Bought → Arrived → Thanked); nothing auto-expires. Chasing guests is a different, awkward feature. |
| **Q6** | Prices: shown by default, "about $120", or hidden? | **Shown by default** with a hide switch; display "about" only when the price came from a scrape the owner didn't edit. |
| **Q7** | Look: the wedding's site theme, or its own? | **Site theme**, with its own hero photo. It should feel like the invitation. |
| **Q8** | Show the existing gift-funds/bank-details block as a last section? | **Yes, optional switch, default off.** Reuses the existing renderer; no new money code. |
| **Q9** | Tell the couple about a claim: dashboard tile only, or email too? | **Dashboard only in v1.** The app has no per-event email to the couple today beyond the digest; one line in the existing weekly digest is the natural v1.5. |
| **Q10** | Affiliate disclosure line: on by default? Are these links really commission-earning, or just retailer links? | **Off by default, editable, switch.** Your call on whether any link earns commission. |
| **Q11** | Nav: a new top-level "Registry" entry, or inside the Site hub? | **Top-level.** It's used mid-planning and again after the wedding, and isn't "the site." (The nav is at 8 entries; this makes 9.) |
| **Q12** | Paste-a-link autofill in v1, or add items by hand first? | **Both**, autofill as step 6 with a clean manual fallback; if retail sites block it, the feature still works. |
| **Q13** | Claimer email, optional ("so we can send you a reminder/confirmation")? | **No.** Name and message only, as you described. |
| **Q14** | Specs (colour/size): free-text label+value set by the owner — or should the **visitor** pick a colour/size when claiming? | **Owner-set, free text**, as asked. Visitor-chosen variants make "which one did they mean" a data problem. |

## 13. What this deliberately does not do

- **No payments, no checkout, no card handling, no refunds.** Links out only.
- **No affiliate tracking or commission reporting.** The app doesn't make or
  measure affiliate links; it renders the URL the couple pastes.
- **No guest accounts, and no per-guest or per-household registry links** —
  as asked. Nothing ties a claim to a guest record.
- **No live stock/price checking, price-drop alerts or dead-link monitor.**
  (A manual "check links" button is the likely follow-up.)
- **No group gifts / split-the-cost** (that's a payment feature in disguise).
- **No filtering by colour/size** (specs are display-only in v1; tags filter).
- **No import from other registries** (Zola, MyRegistry, etc.).
- **No IP-based rate limiting** (the app stores no IPs).
- **No multi-currency** — NZD only, spec 18.

## 14. Test plan

- Pure logic in `src/lib/registry/`: `remaining` (quantity, partial claims,
  released claims, over-claim), filter/sort/query-string round-trip, price
  formatting ("$120", "about $120", hidden), spec validation (caps, trimming),
  link-metadata extraction from fixture HTML (og tags, JSON-LD price, missing
  everything), http(s)-only URL check, claim-input validation (length caps,
  honeypot).
- SQL (`supabase/tests/`): second-account RLS on every new table; `anon` reads
  **zero** claim rows and **zero** shipping rows; a concurrent-claim test on the
  last unit (exactly one wins); release restores `remaining`; composite FKs
  reject cross-wedding tag/item; soft-delete of an item doesn't orphan claims;
  `18_audit_log.sql` coverage.
- Source guards, in the repo's style: the public page's query selects no claim
  columns; the claim action returns only the caller's own record; `rel="noopener noreferrer"`
  on every outbound link.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build`, then the page in a real browser at phone width — and the
  handoff will say which of those was and wasn't done. **The app has never run
  against a live Supabase project or been opened on a real phone**, and this is
  the feature where a visitor on a real phone is the whole point.
