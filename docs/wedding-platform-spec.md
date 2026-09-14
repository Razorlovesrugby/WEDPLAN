# Wedding Platform — Technical Specification

**Status:** Draft for build
**Amended:** 2026-09-14
**Supersedes:** the original BRD. This version folds in schema, sequencing and
integration corrections; see [Amendments](#amendments-against-the-original-brd)
for what changed and why.

Three releases. Each one is independently usable on the day it ships, and each is
built on the last without rework. Ordered by real wedding chronology and by which
deadlines cannot move.

**Stack:** Next.js App Router on Vercel, Supabase (Postgres, Auth, Storage,
Realtime), dnd-kit for list and board reordering, SVG canvas for seating,
a transactional email provider from V1, Gmail API from V2.

---

## Rules that span all three releases

1. **`wedding_id` on every table, from the first migration.** Not "on every root
   table" — every table, including leaf and join tables, denormalised with a FK
   and kept honest by a trigger. RLS policies then evaluate against a single
   local column instead of a two- or three-table join. Costs nothing now, saves a
   rewrite and a class of policy bugs later.
2. **RLS keyed to `wedding_id` on every table, written in the first migration**,
   and tested with a second account before any of it is trusted.
3. **Money is stored as integer minor units** (pence, cents) with an explicit
   `currency` column on every row that holds an amount — including in V1, even
   while everything is in one currency.
4. **All timestamps are `timestamptz`.** Wall-clock display uses
   `weddings.timezone`.
5. **No destructive writes to guest data.** Soft-delete (`deleted_at`) on
   `households`, `guests` and `invitations`; a guest cut after invitations went
   out must remain reconstructable.

---

## V1: Guest list and RSVP

**Goal:** get invitations out and RSVPs back without a spreadsheet. This is the
only part of the build with a deadline that cannot move, which is why it is
first. Vendors can live in a spreadsheet for another month.

**Usable the day it ships:** build the guest list, rank it, cut it to capacity,
send invitations with unique links, and watch responses land with dietary
requirements attached.

### Critical path before any code

Domain email authentication (SPF, DKIM, DMARC) on the sending domain, with a
warming period. Without it, invitations land in spam and you find out from a
relative. DNS propagation and reputation take days and sit on the critical path
of the one immovable deadline. **Do this first, before the guest table exists.**

### Data

```
weddings            id, name, date, timezone, base_currency,
                    capacity (int), cut_rank (text)
collaborators       wedding_id, user_id, role (owner|partner)
events              wedding_id, name, starts_at (timestamptz), venue, address,
                    is_public
households          wedding_id, display_name, address, rank (text),
                    reminders_muted (bool), notes (text), deleted_at
guests              wedding_id, household_id, first, last, preferred, email,
                    phone, age_band (adult|child|infant), side, dietary,
                    accessibility, is_plus_one, plus_one_for (self FK),
                    notes (text), deleted_at
tags                wedding_id, name, colour
guest_tags          wedding_id, guest_id, tag_id
invitations         wedding_id, household_id, token_hash, sent_at, channel,
                    opened_at, deleted_at
invitation_events   wedding_id, invitation_id, event_id
rsvps               wedding_id, guest_id, event_id,
                    status (pending|yes|no|maybe), responded_at
rsvp_questions      wedding_id, label, type, scope (guest|household), required
rsvp_answers        wedding_id, question_id, guest_id, household_id, value
message_log         wedding_id, household_id, kind, sent_at, provider_id, status
site_content        wedding_id, block_key, payload (jsonb)
```

**Constraints and notes**

- `weddings.capacity` and `weddings.cut_rank` are what the ranking screen draws
  the cut line from. Without them, `tier` has nothing to derive from.
- **`households.tier` is not a column.** It is derived: a household is tier A if
  its `rank` sorts above `cut_rank`, B within a configured band below it, C
  beyond. Expose it as a view or a computed selector, never as hand-maintained
  state. Move the cut line, the waitlist recalculates.
- `households.rank` is a **fractional index** (text, LexoRank style), not an
  integer. A drag writes one cell. Integer positions fall apart at 200 households
  with two people editing. Include a rebalance routine for when keys grow long.
- `invitations` stores **`token_hash`** (SHA-256 of the token), not the token.
  The hash is deterministic, so lookup by token still works, and a database leak
  stops being every household's live RSVP link. The raw token exists only in the
  URL and in the send payload.
- **`invitation_events` is a join table**, not an array column on `invitations`.
  "Which households are invited to the ceremony" is a query you will run
  constantly, and an array cannot enforce referential integrity against a deleted
  event. This also makes narrower-than-standard invitations (evening only,
  ceremony only) free to model.
- `rsvps` requires `unique (guest_id, event_id)`.
- `rsvp_answers` carries both `guest_id` and `household_id` as nullable, with a
  check constraint that **exactly one** is set. No type discriminator column.
- `message_log` is what makes reminders safe: a cron retry must not double-send,
  and "did they actually receive it" must be answerable.
- `households.reminders_muted` backs the per-household mute.
- `guests.notes` and `households.notes` exist in V1 because `/guests/[id]`
  displays notes; the richer polymorphic `notes` table arrives in V2.
- Enable **`pg_trgm`** in the first migration — CSV import dedupes on email plus
  fuzzy name.

### Screens

| Route | What it does |
| --- | --- |
| `/login` | Magic link, two users |
| `/` (planner home) | Counts: invited, responded, attending, outstanding, over/under capacity. Every number clicks through to a filtered list |
| `/guests` | Table view. Filter by tag, tier, RSVP status, missing data. Saved views. Inline edit. Bulk tag and bulk invite |
| `/guests/rank` | Drag and drop list with the capacity cut line drawn across it |
| `/guests/[id]` | Guest detail: fields, tags, RSVP history, notes |
| `/households/[id]` | Household: members, address, invitation status, token link |
| `/events` | Create events, set which guests each one is for |
| `/invitations` | Send, resend, per-household status, copy link for WhatsApp |
| `/rsvp/[token]` | Public. No login. Per guest, per event, plus custom questions |
| `/w` (public site) | Single scrolling page: names, date, schedule, venue, travel, FAQ, RSVP entry |

### Features in detail

**Guest list.** Households are the invite unit, guests the headcount unit. CSV
import with column mapping and dedupe on email plus fuzzy name. Tags are many to
many, coloured, and filterable everywhere: family, uni, work, rugby, partner
side, VIP. Age band drives both catering and, later, seating.

**Ranked cut line.** Add everyone you could conceivably invite, hundreds, no
agonising. Drag until the order feels right. Set the cut at venue capacity.
Everything below becomes the waitlist automatically, and when a decline lands,
the app suggests the next household that fits the remaining seats.

The ranking list uses **TanStack Virtual from day one**. It is an hour of work
and removes the 300-household cliff from the risk list entirely.

**Invitations.** One random high-entropy token per household, stored hashed. URL
`/rsvp/{token}`, no account creation — the single biggest cause of RSVP
drop-off. QR code generated per token for printed stationery. Per-household
channel field so the relatives who do not do email get a copy-ready WhatsApp
message with the link.

**Sending.** V1 ships with a transactional email provider (Resend or Postmark)
and Vercel Cron. This is not "email integration" in the V2 sense — there is no
inbox, no threading, no OAuth. It is outbound send plus a scheduler, and V1
cannot function without it.

**RSVP.** Household sees only the events they are invited to. Per guest, per
event: yes, no, maybe. Custom question builder with type, scope and required
flag, plus a standard set: dietary, allergies, song request, transport needed,
accommodation needed, message to the couple. Plus-one flow creates a real guest
record from the supplied name, not a placeholder. Editable until a lock date,
then read only.

**Chasing.** Scheduled reminders to non-responders only, skipping muted
households, every send written to `message_log` before dispatch. You never chase
manually, you watch one number.

**Public site, deliberately thin.** Structured blocks stored in `site_content`,
rendered server side, `noindex` by default. One page. The design work happens in
V2 or V3 when you actually have photos.

### Security in V1

- RSVP writes go through a server action with the service role, never anon
  inserts.
- Token lookups are **rate limited and throttled on failed attempts**. This needs
  a real store — Upstash Redis, or a Postgres table with a cleanup job. Vercel
  provides nothing for this by default; budget for it rather than hand-waving it.
- A token grants RSVP for its own household and nothing else. No other
  household's data is reachable from it, at any endpoint.
- RLS policies are written in the first migration and tested with a second
  account before they are trusted.

### Not in V1

No vendors, no budget, no tasks, no inbox or Gmail OAuth, no seating, no photo
uploads, no gift fund, no design polish. Resist all of it. If you add vendors
here, V1 does not ship before the invitations need to go out.

### Done when

You can add a household, rank it above the cut, send a real invitation to your
own second email address, respond as a guest with dietary requirements, and see
it appear on the dashboard. Then export a CSV the caterer could read.

---

## V2: Vendors, money and the inbox

**Goal:** replace the other spreadsheet and the mess in your inbox. Built while
RSVPs are landing, so V1 keeps working untouched.

**Usable the day it ships:** every vendor conversation, quote, contract, payment
and deadline in one place, with the email thread that produced it attached.

### Data

```
vendors             wedding_id, name, category, stage, website, price_band,
                    source, recommended_by, gut_score
vendor_contacts     wedding_id, vendor_id, name, email, phone, role
quotes              wedding_id, vendor_id, version, total, deposit, balance_due,
                    currency, headcount_assumption, file_id, terms (jsonb)
contracts           wedding_id, vendor_id, signed_at, file_id, key_dates (jsonb)
payments            wedding_id, vendor_id, due_date, amount, currency, paid_at,
                    reference, paid_by
budget_items        wedding_id, category, label, estimated, quoted, contracted,
                    currency, vendor_id
tasks               wedding_id, title, due_date, assignee, status, priority,
                    vendor_id, event_id
task_dependencies   wedding_id, task_id, depends_on_task_id
notes               wedding_id, subject_type, subject_id, body, pinned
decisions           wedding_id, title, decided_at, options (jsonb), rationale
documents           wedding_id, file_path, kind, vendor_id, expires_at
email_threads       wedding_id, gmail_thread_id, vendor_id, status, snoozed_until
email_messages      wedding_id, thread_id, gmail_message_id, from_addr, to_addr,
                    sent_at, body_text
attachments         wedding_id, message_id, file_path, filename
email_rules         wedding_id, match_kind (domain|address|subject|body),
                    pattern, vendor_id
```

**Constraints and notes**

- All amounts are integer minor units with an explicit `currency`.
- **`budget_items.paid` is not a column.** Paid is the sum of `payments` for that
  line — one source of truth. Carrying both a rollup column and a payments table
  guarantees they disagree. Expose the four numbers (estimated, quoted,
  contracted, paid) through a view.
- `tasks.depends_on` becomes **`task_dependencies`**, a join table. A payment
  schedule generating tasks produces fan-out, not a single chain.
- `from` and `to` are reserved words; the columns are `from_addr` / `to_addr`.
- `email_rules` is the table that the triage click writes to.

### Screens

| Route | What it does |
| --- | --- |
| `/vendors` | Kanban by stage: researching, enquiry sent, quote received, shortlisted, booked, deposit paid, complete |
| `/vendors/[id]` | Contacts, quotes by version, contract, payments, threads, notes, files, and what each side still owes the other |
| `/vendors/compare` | Shortlisted vendors in a category side by side on price, inclusions, availability, score |
| `/inbox` | Unified vendor inbox: by vendor, action required, waiting on them, snoozed |
| `/inbox/triage` | Unlinked threads, one click to link or create a vendor |
| `/tasks` | List, board, calendar, mine, this week, overdue |
| `/budget` | Categories with four columns and variance, payment calendar, per-head cost |

### Features in detail

**Vendor pipeline.** Drag between stages. Quotes are versioned records with the
PDF attached and key terms extracted, never overwritten. Contracts generate the
payment schedule, and the payment schedule generates tasks. Per vendor, two
lists: what we owe them (money, final numbers by date X, floor plan by date Y)
and what they owe us. That second list is what spreadsheets never capture.

**Budget, four numbers per line.** Estimated, quoted, contracted, paid, with
variance against each. Most tools carry one number and it is always wrong.
Payment calendar of outflows. Split contributions so "our spend" and "total
spend" are different numbers. And the one number that matters most: live
per-head marginal cost — catering plus drinks plus favours divided by confirmed
headcount — shown on the ranking screen so you can see what dragging a household
above the cut line actually costs.

### Gmail, the honest version

OAuth on a dedicated wedding alias with `gmail.readonly` and `gmail.send`. Keep
the Google Cloud OAuth app in **Testing** mode with yourself and your partner as
test users. That avoids restricted-scope verification and the CASA security
assessment completely, which is weeks of work. It is a deliberate constraint:
personal use, not public SaaS. Never request `gmail.modify`.

Scope classification, precisely: `gmail.readonly` is a **restricted** scope (CASA
applies if you ever publish); `gmail.send` is merely **sensitive**. Testing mode
sidesteps both.

**The cost of Testing mode, stated plainly:** an OAuth app in Testing status
issues **refresh tokens that expire after 7 days**. The Gmail sync will stop
working every week and require re-consent, permanently. This is a property of the
design, not a bug to be fixed later. Three ways to live with it:

1. **Accept it.** Build a persistent "Reconnect Gmail" banner that is one click,
   and detect the failure rather than silently falling behind. Simplest.
2. **Google Workspace + Internal app.** If the alias sits on a Workspace domain,
   publishing the app as *Internal* removes both the expiry and the verification
   requirement. Cleanest, if a Workspace account is acceptable.
3. **Drop the Gmail API for reading.** Use IMAP with an app password, which
   sidesteps OAuth entirely, and send replies over SMTP with `In-Reply-To` and
   `References` headers to preserve threading. Most robust, least Google.

**Sync.** `users.watch()` to a Pub/Sub topic hitting a Vercel route, then
`history.list` from the stored `historyId`, with a polling fallback. A mailbox
watch **expires after 7 days**, so re-register it on a **daily** cron, not a
weekly one. Store thread and message metadata plus extracted plain text in
Postgres, attachments in Supabase Storage, never raw MIME.

**Linking, rules only in V2.** Match sender domain and address against
`vendor_contacts`, then subject and body against vendor names. That classifies
the large majority of wedding email with zero inference. Anything unmatched lands
in the triage queue, where one click links it or creates the vendor, and that
click writes a row to `email_rules`. Replies send through Gmail so threads stay
intact in the real mailbox. The app is a lens, not a silo.

**No model in V2.** Build the rules, see how much they actually miss, then
decide.

**Decision log.** What was decided, when, options considered, why, with the
quotes and threads linked. Six months later this answers "why not the cheaper
caterer" in one place, and it stops you having the same argument twice.

### Not in V2

No AI extraction, no vendor portal, no seating. Those need V2 running first
before you know what they should do.

### Done when

A real vendor email arrives, auto-links to the right vendor, you turn it into a
task with a due date in one action, and the contract's payment schedule shows up
on the budget calendar.

---

## V3: The day itself

**Goal:** turn confirmed RSVPs into a seating plan, a run of show and a printed
pack that survives the venue wifi failing. Only useful once RSVPs are actually
in, which is why it is last.

### Data

```
floor_plans         wedding_id, event_id, background_path, scale_ref
plan_tables         wedding_id, floor_plan_id, label, shape, seats, x, y,
                    rotation, dimensions
plan_elements       wedding_id, floor_plan_id,
                    kind (dancefloor|bar|band|cake|entrance), x, y
seat_assignments    wedding_id, plan_table_id, seat_index, guest_id
seating_constraints wedding_id, kind, guest_a, guest_b, note
plan_snapshots      wedding_id, floor_plan_id, name, taken_at, payload (jsonb)
timeline_items      wedding_id, event_id, starts_at, duration, title, location,
                    owner, vendor_ids[], guest_visible,
                    pinned (bool), predecessor_id, offset_minutes
accommodations      wedding_id, name, rate, currency, cutoff_date, booking_code,
                    rooms_held
household_stays     wedding_id, household_id, accommodation_id, booked
transport_routes    wedding_id, name, pickup, depart_at, capacity
transport_seats     wedding_id, route_id, guest_id
gifts               wedding_id, guest_id, description, thanked_at
```

**Constraints and notes**

- `seat_assignments` needs `unique (plan_table_id, seat_index)` and a unique
  guest per floor plan — nobody sits in two chairs.
- `plan_snapshots` backs the named save/revert described below.
- **Timeline cascade requires structure the original model lacked.**
  "Move the ceremony fifteen minutes and everything downstream shifts" cannot be
  computed from absolute `starts_at` alone — nothing defines *downstream*. Use
  `pinned`: items that cannot move (vendor call times, ceremony licence slot,
  sunset) are pinned to a wall-clock time; everything else flows from the
  preceding item's duration. `predecessor_id` and `offset_minutes` express
  explicit gaps. A shift then recomputes unpinned items and warns wherever the
  result crosses a pinned item or a vendor's contracted window.

### Features in detail

**Seating.** 2D canvas, to scale. No 3D: expensive, buys nothing. Venue outline
as an uploaded image scaled against one known dimension, plus placeable dance
floor, bar, band, cake table and entrances. Tables round, long, oval, square or
head, with seat count, rotation and label.

**Build the canvas in SVG with pointer events** (or react-konva), not dnd-kit.
dnd-kit is the right tool for the ranking list and the vendor kanban; scaling,
rotation, snapping and hit-testing on a floor plan are not list-reordering
problems and fighting a list library into that shape costs more than writing the
canvas directly.

Two assignment modes: table level, and seat level for place cards and speeches.
Unseated tray down the side showing confirmed attendees only, filterable by tag
so you can seat a whole friend group in one drag.

**Constraints engine.** `must_sit_with`, `cannot_sit_with`, `must_be_near`,
`keep_off_table`, `needs_accessible_seat`, `needs_high_chair`. Violations render
as non-blocking warnings, never hard errors, because you will deliberately
override some. Enter each constraint the moment you learn it, then the warnings
do the remembering through nine rounds of revision. Live validation also covers
capacity overflow, children separated from their household, and empty seats.
Named snapshots so you can try a layout and revert.

**No auto-seating.** A solver is V4 or never. Build the manual canvas well and
you probably will not want it.

**Run of show.** Timeline items with parallel tracks for guests, couple and
suppliers, cascading per the pinned/predecessor model above, with a warning where
a vendor's contracted window breaks. Filtered export per vendor, so the
photographer's PDF contains only what concerns the photographer plus their call
time. Guest-visible items publish to the public site schedule automatically.

**Logistics.** Hotel blocks with rate, cut-off and booking code, tracking who has
actually booked. Shuttle routes generated from the RSVP transport answers.
Arrival and departure for the ones you are collecting.

**The printed pack.** Every one of these as one-click PDF or CSV, and all of them
get printed:

- Final numbers for venue and caterer, dietary and allergy breakdown by table and
  seat
- Alphabetical guest-to-table list for the entrance display
- Per-table place cards
- Floor plan
- Run of show, full and per vendor
- Day-of contact sheet: every vendor, mobile, call time, one page
- Accommodation and transport manifests
- Outstanding balances

Generate server-side. Watch Vercel function duration and memory limits on the
floor plan and full-pack renders; a long-running export belongs on a queue rather
than a request.

Plus guest table lookup on the public site, name search, revealed only after a
date you set.

### Done when

You can print the whole pack, hand the venue their floor plan and final numbers,
and run the day from paper if every device dies.

---

## V4 and later, only if you want to

- AI extraction over the email that rules miss: amounts, deadlines, headcounts as
  structured candidates a human confirms. Classification stays rules-based.
- pgvector search across every email, note and document.
- Auto-seating suggestions from constraints and tag affinity.
- Vendor portal: token link where a vendor sees their call time, final numbers
  and dietary summary without you emailing anything.
- Extra roles: parents as viewer, helpers scoped to their own tasks, per-module
  visibility so you can share seating without exposing the budget.
- Photo uploads, guestbook, song requests feeding a DJ list.
- Cash fund. US registry platforms are useless outside the US and their payouts
  assume a US bank account, so this means Stripe or a bank pot link, which has
  fee and tax implications worth deciding before building anything.
- Post-wedding: gift log, thank-you tracking, final reconciliation.
- Multi-wedding, if this ever becomes a product. The `wedding_id` column is
  already there.

---

## Open decisions

**Resolved in this amendment**

| Question | Decision |
| --- | --- |
| Ranking list virtualisation | TanStack Virtual from day one. An hour of work; removes the 300-household cliff from the risk list. |
| Second currency | `currency` column on every money row in V1, even while everything is in one currency. Retrofitting in V2 means touching every query. |
| Narrower event invitations | Modelled regardless of the answer, via `invitation_events`. Evening-only invitations are near-universal and cost nothing once the join table exists. |

**Still open — blocking the first migration**

1. **Wedding date and target invitation send date.** These are the only fixed
   dates in the plan, and V1 has to land before the send date. Everything about
   whether V1's scope is realistic depends on them.
2. **RSVP lock date.** Drives the read-only cutover and the final-numbers
   deadline that V2's vendor obligations hang off.
3. **Guest pool size and final capacity.** Sets `weddings.capacity` and confirms
   the virtualisation call.
4. **Gmail strategy for V2** — which of the three options above. Not blocking V1,
   but worth deciding before the V2 migration, since option 3 changes the
   `email_*` tables.

---

## Amendments against the original BRD

Recorded so the reasoning survives.

**Schema**

1. `wedding_id` added to every table that lacked it — in V1: `guests`,
   `guest_tags`, `invitations`, `rsvps`, `rsvp_answers`; in V2: `vendor_contacts`,
   `quotes`, `contracts`, `payments`, `email_messages`, `attachments`; in V3:
   `plan_tables`, `plan_elements`, `seat_assignments`, `household_stays`,
   `transport_seats`, `gifts`. The original stated the rule and then broke it,
   leaving RLS to be evaluated across two- and three-table joins.
2. `weddings.capacity` and `weddings.cut_rank` added. The dashboard showed
   over/under capacity and the ranking screen drew a cut line, but nothing in the
   schema stored either.
3. `households.tier` removed as a stored column; it is derived from `rank`
   against `cut_rank`, as the original's own prose required.
4. `invitations.events[]` replaced by the `invitation_events` join table.
5. `invitations.token` replaced by `token_hash`.
6. `unique (guest_id, event_id)` added to `rsvps`.
7. `rsvp_answers` given two nullable subject columns plus an exactly-one check.
8. `message_log` and `households.reminders_muted` added — scheduled reminders and
   per-household mute had no state to sit in, and a cron retry would double-send.
9. `guests.notes` / `households.notes` pulled into V1, since `/guests/[id]`
   displayed notes while the `notes` table did not arrive until V2.
10. `budget_items.paid` removed; paid is derived from `payments`.
11. `tasks.depends_on` replaced by `task_dependencies`.
12. `email_rules` added — the triage click was specified as writing a rule with
    nowhere to write it.
13. `plan_snapshots` added to back named save/revert.
14. `timeline_items` given `pinned`, `predecessor_id` and `offset_minutes`;
    cascading a schedule change is not computable from absolute times alone.
15. `soft delete`, `timestamptz`, integer-minor-unit money and per-row `currency`
    applied as global rules.
16. `pg_trgm` required in the first migration for import dedupe.

**Scope and sequencing**

17. V1 now explicitly includes a transactional email provider and Vercel Cron.
    The original said "no email integration" while also requiring invitation
    sending and scheduled reminders.
18. Domain email authentication (SPF/DKIM/DMARC) named as critical-path work
    ahead of the first migration.
19. Rate-limit storage for token lookups named as a real dependency (Upstash or
    Postgres), rather than left implicit.

**Integration reality**

20. Recorded that an OAuth app in Testing status issues refresh tokens expiring
    after 7 days, with three documented ways to live with it. The original
    treated Testing mode as free.
21. Corrected scope classification: `gmail.readonly` restricted, `gmail.send`
    sensitive.
22. `users.watch()` re-registration moved to a daily cron; watches expire after
    7 days.

**Front end**

23. Seating canvas specified as SVG or react-konva rather than dnd-kit; dnd-kit
    retained for the ranking list and vendor kanban.
24. TanStack Virtual specified for the ranking list from day one.
25. Server-side PDF generation flagged against Vercel function limits.
