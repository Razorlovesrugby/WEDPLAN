# Feature spec: Vendor management — contacts, notes, and the budget link

**Status: answered and built, 2026-09-21 (session 29).** All ten questions
answered and the build authorized in the same message. See "Answered" below —
which is the authoritative record, and where question 1 went the other way
from the recommendation — and "Build status" for what exists and what the
build had to change because this spec predates four later ones.

**Depends on:** V1 (`weddings`, `events`) plus spec 6 / 6.1 (budget), already
built — this spec's whole point is the link to `budget_items`, and §5 reads
spec 6 §7's `v_budget_item_tasks` for the read-only task list on a vendor.
Depends on specs 1 and 2 only transitively, through that. Does not depend on
spec 5, and does not touch `guests`, `households`, `invitations`, or `rsvp_*`.

---

## Answered — 2026-09-21

Four questions were put to the planner; the other six had recommendations with
no cost to being wrong and were taken as written, which is recorded here rather
than left implicit.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Where does a vendor's category come from? | **Its own `vendor_categories` table** — a separate taxonomy, not `budget_categories`. This is the option §3 and §11.1 argued against, chosen deliberately after that argument was put. See the note below |
| 2 | Eight stage values, no kanban this pass? | **Yes to both**, as recommended. A select and a filter; a board if the list ever gets long enough to want one |
| 3 | Notes as a dated log, or one free-text field? | **Both** — `vendor_notes` as the dated, pinnable log, plus `vendors.notes` for the throwaway one-liner that does not deserve an entry |
| 4 | Can one budget line have more than one vendor? | **No.** One nullable FK; a line split between two suppliers is two lines |
| 5 | A printable day-of contact sheet? | **Yes** — `/vendors/contact-sheet`, reusing the print CSS `/invitations/print` already has |
| 6 | Keep `source`, `recommended_by`, `gut_score`? | **Keep all three, drop `price_band`**, as recommended. Real numbers live on budget lines |
| 7 | Are vendor tasks via budget lines enough? | **Yes, and read-only**, as recommended. A join, not a new concept |
| 8 | Confirming no automatic name matching | **Confirmed.** Exact-string grouping, the planner presses the button, the trigram matcher stays unused |
| 9 | Confirming documents/quotes/contracts are out | **Confirmed.** They need a storage bucket and a retention story; that is its own spec |
| 10 | Does `run_sheet_items.owner` stay free text? | **No — it gains a vendor link**, changed from the recommendation. `0009`'s own comment anticipated this, and the planner asked for it now rather than as a follow-up |

### On question 1, written down so it is a choice and not a surprise

§3 and §11.1 both argued for `budget_categories`: "Flowers" is one concept, and
two independent lists start identical and drift within a month — the budget
says Flowers, the vendor page says Florist, and nothing reconciles them. That
argument was put in the question itself and the separate table was chosen
anyway, which is the planner's call to make.

**What it buys:** a vendor can be categorised before any budget line exists,
which is the common case while you are still researching, and vendor
categories can be shaped for vendors ("Photography", "Hair and makeup")
rather than for money.

**What it costs, and what the build does about it:** two lists that can
disagree. The build does one thing to soften that and no more — `0029`
**seeds `vendor_categories` from each wedding's existing budget category
names**, so the two lists start aligned rather than starting empty and being
invented separately. They are free to diverge from that point, which is what
was asked for. Nothing syncs them afterwards, and nothing should: a sync would
be the single taxonomy by the back door, with a worse failure mode.

---

## Build status — 2026-09-21 (session 29)

`npm run typecheck`, `npm test` (608, up from 582), `./scripts/verify-migrations.sh`
(424 assertions, up from 388), `./scripts/verify-migrations-single-tx.sh`,
`./scripts/verify-bootstrap.sh` and `npm run build` all pass.

### Done

| Step | What exists | Where |
| --- | --- | --- |
| 1 | `vendor_stage`, `vendor_categories`, `vendors`, `vendor_contacts`, `vendor_notes`, the one-primary partial unique index, `budget_items.vendor_id`, `run_sheet_items.vendor_id`, `v_vendors`, and the two view redefinitions | `supabase/migrations/0029_vendors.sql` |
| 2 | `VENDOR_STAGES`, `stageIsCommitted`, `sortVendors`, the URL filter, `committedWithoutBudget`; `searchVendors`, `findExactVendor` | `src/lib/vendors.ts`, `vendor-search.ts` (+ 41 tests) |
| 3 | Four row types, `VendorView`, the stage union, `vendor_id` on two rows, and the three `Relationships` entries §7 warned about | `src/lib/types/database.ts` |
| 4 | Queries and actions — vendor/contact/note CRUD, archive/restore/delete, the budget link, the backfill, the run-sheet link | `src/server/queries/vendors.ts`, `src/server/actions/vendors.ts` |
| 5 | `/vendors` — grouped list, URL filters, archived mode, inline add, the backfill panel, the committed-without-budget warning | `vendor-list.tsx` |
| 6 | `/vendors/[id]` — header, contacts, notes, money, read-only tasks | `vendor-detail.tsx` |
| 7 | `VendorPicker` on `/budget`, `vendor_id` through the action, the vendor name as a conditional link | `vendor-picker.tsx`, `budget-item-fields.tsx`, `budget-item-row.tsx` |
| — | `/vendors/contact-sheet` (Answered Q5), and `Nav` | `contact-sheet/page.tsx`, `nav.tsx` |
| 10 | Seed vendors on both weddings, `supabase/tests/12_vendors.sql` (36 assertions) | `supabase/seed.sql`, `tests/12_vendors.sql` |

### Six things the build changed, because this spec predates four later ones

1. **`0013_vendors.sql` is `0029_vendors.sql`.** Moodboards took `0013` in
   session 17. Likewise `supabase/tests/05_vendors.sql` is `12_vendors.sql`.

2. **There is no `base_currency` any more.** Spec 18 removed multi-currency in
   `0019`, so `committed_base`/`paid_base`/`outstanding_base` are `committed`,
   `paid` and `outstanding`, in NZD minor units. The §8 test about "two lines
   in two currencies" is not a test that can exist now.

3. **The enum is NOT in its own file.** §9 step 1 implies the `0024` split, but
   that rule is about `alter type ... add value`, not `create type` — `0017`
   creates three enums and uses them in the same script. The single-transaction
   check confirms it.

4. **`v_budget_items` had to be redefined before `v_vendors`**, not after as
   §3's ordering suggests: `v_vendors` reads `v_budget_items.vendor_id`, so
   creating it first fails with "column bi.vendor_id does not exist".

5. **`v_coach_runs`-style column discipline applies to `v_budget_items` too.**
   It was reproduced verbatim from `0021` with exactly two lines changed
   (`vendor_name` becoming a `coalesce`, and `vendor_id` appended last), rather
   than re-derived — re-deriving it would risk silently changing the money.

6. **Notes cannot embed their author.** §7 assumed an embed; `vendor_notes.author_id`
   references `auth.users` and `collaborators` is a separate table keyed by
   `user_id`, so there is no relationship to embed through. The name is looked
   up in a second query and joined in TypeScript.

### Also found while running the full pass

`./scripts/verify-bootstrap.sh` had been **failing since session 27** —
`0023` added a fifth built-in question (the decline note) and the check still
expected four. Nothing to do with vendors; fixed here because this is the
first spec since then whose test plan runs it.

### Not done, and worth knowing

- **Nothing has been opened in a browser.** The `VendorPicker` combobox, the
  backfill panel and the contact sheet's print layout are all unseen.
- **`0029` is not applied to the live project** — nor is anything from `0022`
  onwards. They apply in order.
- **No vendor category editor UI.** Categories are seeded from the budget's
  names by `0029` and can be created by `createVendorCategory`, but no screen
  calls it yet — the detail page's category select offers what exists. A
  planner wanting "Hair and makeup" has no button for it.
- **The run-sheet vendor link has no UI either.** `run_sheet_items.vendor_id`
  and `setRunSheetItemVendor` exist and are tested; `/run-sheet` does not show
  or set them yet.
- **`/budget?item=<id>` click-through is assumed, not verified.** Spec 6 §7
  says that opens the line's popup on load; that was not re-checked here.
- **No dashboard tile**, per §5. Deliberate.

## 1. What this is, and what it deliberately isn't

`docs/wedding-platform-spec.md` describes V2 as one large feature: a vendor
pipeline with kanban stages, versioned quotes with PDFs attached, contracts
that generate payment schedules, a Gmail-backed unified inbox, and triage
rules. Spec 6 already pulled the *money* half of that forward and shipped it,
deliberately leaving the vendor half behind — `budget_items.vendor_name` is
free text, with an explicit note that "if a full vendor CRM ships later, this
text field is the natural migration target for a real FK" (spec 6 §2, Out).

This spec is that migration target, and nothing more than that. It is the
**smallest useful vendor record**: who they are, how to reach them, what was
said, and which budget lines they're responsible for. Concretely, it takes
three things the planner is otherwise keeping in a phone's contacts app, a
notes app, and a spreadsheet column, and puts them on one page next to the
money already in the system.

**It is not the V2 vendor CRM.** No Gmail, no inbox, no document storage, no
versioned quotes, no contract parsing, no payment-schedule generation, no
`/vendors/compare`. Those stay V2 proper. The test for whether something
belongs here: does it work with nothing but a text field and a foreign key?
Contacts and notes do. Quotes-with-PDFs need a storage bucket this project
does not have and has never configured, and are out.

The one thing this does add beyond "notes and contacts" is the budget link,
because that is where a vendor record stops being a nicer address book and
starts being worth the schema: the florist's phone number is more useful
sitting next to "Flowers — £800 contracted, £200 deposit paid, balance due
14 March" than it is in a phone.

## 2. Scope

**In:**
- A `vendors` record per wedding: name, category, stage, website, a general
  email/phone/address, a free-text `notes` field for the one-liner that
  doesn't deserve a dated note, plus the three "how did we find them"
  fields the platform spec already named (`source`, `recommended_by`,
  `gut_score`).
- **Contacts**, many per vendor: name, role ("day-of coordinator", "owner"),
  email, phone, one flagged primary, own notes. The reason this is a table
  and not two columns on `vendors`: the venue you book and the venue
  coordinator who answers on the day are routinely different people, and
  the second one is the one you need at 6am.
- **Notes as a dated log**, many per vendor, newest first, pinnable —
  "quoted £3.2k over the phone, valid 30 days," "said they can do the
  arch if we supply the flowers." An append-and-edit log rather than one
  growing textarea, so a note carries a date and an author without the
  planner typing either (§11.3).
- **The budget link:** `budget_items.vendor_id`, a real nullable foreign key
  alongside the existing free-text `vendor_name`. `/budget`'s "Vendor
  (optional)" text input becomes a type-to-filter picker with inline create;
  a linked line's vendor name becomes a link to that vendor.
- **The reverse view:** a vendor page showing every budget line linked to
  them with spec 6's live numbers (current, paid, outstanding, next payment
  due), summed into a single per-vendor committed/paid/outstanding figure.
- **A read-only task list per vendor**, derived by reading spec 6 §7's
  `v_budget_item_tasks` across that vendor's budget lines. No new link
  table: a task is already linkable to a budget line, and a budget line is
  now linkable to a vendor, so "tasks about this vendor" is a join, not a
  new user-facing concept (§11.7).
- **A planner-confirmed backfill** of the free-text vendor names already on
  budget lines — `/vendors` lists the distinct names with no vendor record
  and offers one click to create the vendor and link every line carrying
  that name.
- `/vendors` and `/vendors/[id]`, plus a "Vendors" entry in `Nav`.

**Out, explicitly:**
- **No automatic name matching, ever.** A budget line reading
  "The Old Barn" and a vendor named "The Old Barn" are not linked until the
  planner says so — the backfill above is one click, but it is a click.
  Same rule, for the same reason, as spec 6 §10.7's "manual, never automatic
  or derived."
- No kanban board. `stage` is a column and a filter in this pass, not a
  drag-between-columns screen (§11.2). Spec 5's rank list is the only drag
  surface this app has, and it earned that by being the feature; a seven-row
  vendor list does not.
- No quotes, contracts, documents, or file uploads of any kind. No storage
  bucket is configured for this project and configuring one is its own piece
  of work (auth rules, size limits, virus posture, a retention story).
- No Gmail, no inbox, no `email_threads`, no `email_rules`.
- No payments or money columns on `vendors`. Every number on a vendor page
  is read from spec 6's views. A vendor with a price in two places is a
  vendor with two prices that disagree — the same argument the platform
  spec makes against a `budget_items.paid` column.
- No vendor-facing surface. Vendors never log in, get a token, or receive
  anything from this app. Nothing here touches `message_log` or the cron
  sender.
- No change to `run_sheet_items.owner`, which stays free text. `0009`'s own
  comment anticipates a vendor FK here; wiring it is a small, separable
  follow-up and is not in this pass (§11.10).

## 3. Data model

```
vendors           id, wedding_id, name, category_id (nullable),
                  stage (vendor_stage, default 'researching'),
                  website, email, phone, address, notes,
                  source, recommended_by, gut_score (smallint 1-5, nullable),
                  archived_at, created_at, updated_at
                  unique (id, wedding_id)

vendor_contacts   id, wedding_id, vendor_id, name, role, email, phone,
                  is_primary (bool, default false), notes, sort_order,
                  created_at, updated_at
                  unique (id, wedding_id)

vendor_notes      id, wedding_id, vendor_id, body, pinned (bool, default
                  false), author_id (auth.users, on delete set null),
                  created_at, updated_at
                  unique (id, wedding_id)

budget_items      + vendor_id (nullable)   -- new column, nothing else changes
```

- **Tenancy**, per `docs/HANDOFF.md` §5 rule 1: `wedding_id` on all three,
  `unique (id, wedding_id)` on each parent, composite foreign keys on every
  child — `(vendor_id, wedding_id)` → `vendors` on delete cascade for
  contacts and notes, `(category_id, wedding_id)` → `budget_categories` on
  delete set null. All three tables go into the RLS `tenant_tables` array in
  the same migration that creates them.
- **`category_id` points at `budget_categories`** rather than a second
  taxonomy of its own (§11.1). "Flowers" is one concept in this app, and two
  independent category lists — one on the budget page, one on the vendor
  page — start identical and drift within a month. Nullable, because a
  vendor being researched has no budget line and therefore no category yet,
  and because spec 6 §10.6 lets a category be deleted out from under its
  rows.
- **`stage`** is a new enum, `vendor_stage`, with the platform spec's seven
  values plus one: `researching`, `enquiry_sent`, `quote_received`,
  `shortlisted`, `booked`, `deposit_paid`, `complete`, `declined`. The extra
  value is `declined` — the vendor who quoted double, whose record you keep
  precisely so you don't email them again in three weeks having forgotten.
- **`gut_score`** is `smallint`, 1–5, nullable, checked. Free text would be
  unsortable and a `numeric` invites a 3.7 nobody can justify.
- **`archived_at`** is the soft delete, matching `lists.archived_at`. §6
  covers what hard-deleting a vendor does to the rows pointing at it.
- **`vendor_contacts.is_primary`**: at most one per vendor, enforced with a
  partial unique index — `unique (vendor_id) where is_primary`. Enforced in
  the database and not just in the action, because `v_vendors` (below) joins
  on it expecting one row; two primaries would duplicate every vendor on
  `/vendors` rather than fail loudly.
- **`vendor_notes.body`** is plain text. No markdown rendering, no
  attachments, no mentions. `created_at` is the note's date; a note about
  something that happened last Tuesday says so in its body.
- **`budget_items.vendor_id`** is `on delete set null`. A deleted vendor
  must never take a budget line — and by extension a payment schedule — with
  it. §6.

**Migration (new file, `0013_vendors.sql`):** create `vendor_stage`, the
three tables, the partial unique index, the `budget_items.vendor_id` column;
add the three tables to the RLS `tenant_tables` array; create `v_vendors`;
and redefine the two existing views below. Append-only, per
`docs/HANDOFF.md` §8 — `0010`/`0011` are not edited.

**Views:**

- **`v_vendors`** (`security_invoker = true`) — one row per non-archived
  vendor, carrying what `/vendors` needs without N+1 queries: every
  `vendors` column, plus `category_name`, `primary_contact_name` /
  `_email` / `_phone` (left join on `is_primary`), `contact_count`,
  `note_count`, `last_note_at`, `budget_line_count`, `committed_base`,
  `paid_base`, `outstanding_base` (summed from `v_budget_items`'s existing
  `computed_current_base` / `paid_base` / `outstanding_base` — this view
  does no money arithmetic of its own beyond `sum()`), `next_payment_due`
  (min `due_date` across that vendor's unpaid payments), and
  `open_task_count` (from `v_budget_item_tasks` where `done_at is null`).
- **`v_budget_items`** — redefined, not edited in place (same move, and same
  reasoning, as `0011`): `bi.vendor_name` becomes
  `coalesce(v.name, bi.vendor_name) as vendor_name`, left-joining `vendors`.
  Same column name, same position, same type, so `create or replace view` is
  legal and **every existing caller keeps working untouched** — the budget
  row, the payment calendar, the links popup, and the contracted-follow-up
  task title all keep reading `vendor_name` and now simply get the linked
  vendor's live name when there is one. A rename on `/vendors/[id]` shows up
  on `/budget` with no sync step and no trigger. `vendor_id` is appended as
  a new last column, per `create or replace view`'s append-only rule.
- **`v_reminders_due`** — redefined for the same reason: its payment branch
  titles rows `coalesce(bi.vendor_name, bi.label)` straight off
  `budget_items`, so without this the weekly digest would keep mailing the
  old free-text name after a rename. Becomes
  `coalesce(v.name, bi.vendor_name, bi.label)`. Column list unchanged.

## 4. How the free-text name and the FK coexist

`budget_items.vendor_name` is not dropped, and this is deliberate — three
reasons, in order of how much they matter:

1. **A line can legitimately have no vendor record.** "£150 — cake stand
   hire, from the village hall's cupboard" doesn't deserve a vendor; the
   text field stays the cheap option, exactly as it is today.
2. **Nothing has to be migrated on day one.** The column keeps working, the
   backfill is opt-in and per-name, and a planner who never visits
   `/vendors` sees no change on `/budget` beyond the input becoming a picker
   they can still type a bare name into.
3. **It is the snapshot after a delete.** `linkBudgetItemToVendor` writes
   the vendor's name into `vendor_name` as well as setting `vendor_id`. The
   view prefers the vendor's live name, so the snapshot is invisible while
   the link exists — but when a vendor is hard-deleted and `vendor_id` goes
   null, the budget line still reads "The Old Barn" instead of going blank.

**The backfill**, on `/vendors`: a dismissible panel listing every distinct
`vendor_name` on a budget line with `vendor_id is null`, each with a count
("The Old Barn — 3 lines") and one button that creates the vendor and links
all of them. No fuzzy matching, no similarity threshold, no automatic run —
exact string grouping only, and a human pressing the button. Note that this
app already owns a trigram matcher (`src/lib/import/trigram.ts`); it is
deliberately **not** used here. Guest import earns fuzzy matching because a
CSV from a relative has real typos in it; a budget line's vendor name was
typed by the planner in this app, and "The Old Barn" vs "Old Barn" is as
likely to be two genuinely different suppliers as one.

## 5. Screens

| Route | What it does |
| --- | --- |
| `/vendors` | The list. Grouped by category (uncategorised last), each row: name (link), stage chip, primary contact with `mailto:`/`tel:` links, committed vs. paid in `base_currency`, next payment due, note count. Filters for stage, category, and a text query, held in the URL exactly as `/guests` holds its filters — a filtered vendor list is a link. An "Add vendor" inline form (name + category + stage, everything else on the detail page). The backfill panel from §4 above the list while it has anything in it. Archived vendors behind a `?archived=1` toggle, never mixed into the default list. |
| `/vendors/[id]` | The detail page, four cards. **Header:** name, category, stage (inline select, saves on change), website/email/phone/address, source, recommended_by, gut_score, the one-line `notes` field — all inline-editable, reusing `InlineText` from the guests screens. **Contacts:** rows of name/role/email/phone with add, edit, remove, and "make primary". **Notes:** an add box at the top, then pinned notes, then the rest newest-first, each with its date, author, pin toggle, edit and delete. **Money:** every linked budget line with its label, basis, current, paid, outstanding and next payment date, click-through to `/budget?item=<id>` (spec 6 §7 already opens that line's popup on load), a per-vendor total, a "Link a budget line…" combobox and an unlink control per row. Below it, the read-only task list from `v_budget_item_tasks`, each clicking through to `/lists/[id]?highlight=<id>` — again, already built by spec 6 §7. |
| `/budget` | One change: `BudgetItemFields`' "Vendor (optional)" text input becomes `VendorPicker` — type-to-filter over the wedding's vendors, click to link, "+ Create vendor" inline, and "use as plain text" for the no-record case. `BudgetItemRow`'s vendor name links to `/vendors/[id]` when `vendor_id` is set, and stays plain text when it isn't. |
| `Nav` | A "Vendors" link, after "Budget". This is the fourteenth destination; spec 3's hamburger already handles the count below `sm:`, so no nav rework is needed. |

No dashboard tile. The dashboard already carries Budget and Tasks tiles, and
the honest answer to "what number would a Vendors tile show" is one the
Budget tile shows better.

**`VendorPicker`** is `HouseholdPicker` with the nouns changed — the same
type-to-filter-then-inline-create combobox, over `src/lib/vendor-search.ts`
(a near-copy of `household-search.ts`, matching name, category and primary
contact). Filtering happens in memory over what the page already loaded: a
wedding has tens of vendors, not the hundreds of households that pattern was
built for.

## 6. Deleting a vendor

Two levels, because the two intentions are genuinely different:

- **Archive** (`archived_at`) is the default control and is reversible.
  Everything stays linked; the vendor leaves the default list. This is what
  "we didn't go with them" means, and it's why `declined` exists as a stage
  rather than a reason to delete.
- **Delete** is behind a confirm that names what goes: contacts and notes
  cascade (they have no meaning without the vendor), and every linked budget
  line has `vendor_id` set to null while keeping its snapshot name, its
  category, its numbers and its payment schedule. Deleting a vendor must
  never delete money.

That confirm counting rows before it destroys them is the same posture
`removeQuestion` takes over `rsvp_answers` (`docs/HANDOFF.md` §5 rule 9):
notes are the reason the vendor record existed, so the planner is told how
many they are about to lose rather than finding out afterwards.

## 7. Server actions, queries, and pure logic

`src/lib/vendor-search.ts` — `searchVendors(vendors, query)`, substring over
name, category and primary contact. Unit-tested, mirroring
`household-search.test.ts`.

`src/lib/vendors.ts` — the pure logic worth testing away from a database,
per `docs/HANDOFF.md` §8: `VENDOR_STAGES` with display labels and an explicit
order, `stageIsCommitted(stage)` (booked/deposit_paid/complete — used for
the list's grouping and any "committed but unbudgeted" warning),
`sortVendors`, and the filter predicate `/vendors` applies to its URL params.

`src/server/actions/vendors.ts` — `createVendor`, `updateVendor`,
`archiveVendor`, `restoreVendor`, `deleteVendor`, `addVendorContact`,
`updateVendorContact`, `removeVendorContact`, `setPrimaryVendorContact`
(clears the old primary and sets the new one in one action, so the partial
unique index is never transiently violated), `addVendorNote`,
`updateVendorNote`, `deleteVendorNote`, `toggleVendorNotePin`,
`linkBudgetItemToVendor` (sets `vendor_id` and writes the name snapshot,
§4), `unlinkBudgetItemFromVendor`, and
`createVendorFromBudgetLines(name, categoryId)` — the backfill button: one
vendor, then every budget line in this wedding whose `vendor_name` equals
that exact string and whose `vendor_id` is null, linked in one write. All
returning `ActionResult`, all following "blank form field means null; absent
key means untouched."

`src/server/queries/vendors.ts` — `listVendors` (reads `v_vendors`),
`getVendor`, `listVendorContacts`, `listVendorNotes`,
`listVendorBudgetLines` (reads `v_budget_items` filtered by `vendor_id`),
`listVendorTasks` (reads `v_budget_item_tasks` across those lines),
`listUnlinkedVendorNames` (the backfill panel's source). All `cache()`d.

Existing code that changes: `budget-item-fields.tsx` (the picker),
`budget-item-row.tsx` (the vendor name becomes a conditional link),
`src/server/actions/budget.ts` (`vendor_id` through the zod schema and both
writes), `src/server/queries/budget.ts` (select the new column),
`src/lib/types/database.ts` (three new row types, the `vendor_stage` union,
`vendor_id` on `BudgetItemRow`/`BudgetItemView`), and `nav.tsx`.

**One trap worth naming in advance:** `src/lib/types/database.ts`'s
`Relationships` arrays. `/vendors/[id]` wants embedded selects
(`vendors(*, vendor_contacts(*))`), and per `docs/HANDOFF.md` §5 rule 5 an
embed whose relationship is missing from that array resolves to `never`,
which compiles fine and silently loses all type safety. Every embed this
feature adds needs its relationship entry in the same change.

**Seed data:** `supabase/seed.sql` gets vendors, contacts and notes on
**both** weddings, not one — the existing file's own comment explains why
("a tenancy test with one tenant proves nothing"), and the cross-wedding
assertions in §8 need the second tenant to have something to fail against.

## 8. Test plan

- Unit: `src/lib/vendor-search.ts` (name, category and contact matches,
  empty query returns everything, case-insensitivity) and
  `src/lib/vendors.ts` (stage ordering, `stageIsCommitted`, the URL-param
  filter predicate over a fixture list).
- SQL, a new `supabase/tests/05_vendors.sql`, asserting: cross-wedding RLS
  on all three tables (a vendor in wedding A invisible to a collaborator on
  wedding B); the composite FK actually refusing a contact in wedding A
  attached to a vendor in wedding B, service role included; the partial
  unique index refusing a second primary contact; `v_vendors`'
  `committed_base`/`paid_base`/`outstanding_base` equalling the sum of that
  vendor's `v_budget_items` rows for a vendor with two lines in two
  currencies, one part-paid; `next_payment_due` ignoring paid payments;
  deleting a vendor leaving its budget lines present with `vendor_id null`
  and the snapshot `vendor_name` intact, its payments untouched, and its
  contacts and notes gone; and `v_budget_items.vendor_name` returning the
  vendor's live name after a rename while a line with no `vendor_id` still
  returns its own text.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `./scripts/verify-bootstrap.sh`, `npm run build`.
- Browser pass: create a vendor from `/vendors`; add two contacts and make
  the second primary, confirm the first stops being primary and `/vendors`
  shows the second; add three notes, pin the middle one, confirm order;
  edit and delete a note. Create a budget line with a plain typed vendor
  name, confirm `/vendors` offers to create that vendor, press it, confirm
  the line is linked and its name on `/budget` is now a link. Rename the
  vendor, confirm `/budget`, the payment calendar and a triggered digest
  all show the new name with no other action. Link a second budget line in
  a different currency, confirm the vendor page's total matches the two
  lines' `base_currency` figures. Click through from a budget line on the
  vendor page and confirm `/budget` opens with that line's popup. Archive
  the vendor, confirm it leaves the list and its budget lines are
  untouched; restore it; then delete it and confirm the confirm dialog
  names the contact and note counts, and that afterwards both budget lines
  still exist, still carry their numbers and payments, and read as plain
  text.

## 9. Build order

1. `0013_vendors.sql` — enum, three tables, the partial unique index,
   `budget_items.vendor_id`, RLS array, `v_vendors`, and the two view
   redefinitions. **Only after §11 is answered** — question 1 changes this
   file's shape.
2. `src/lib/vendors.ts` and `src/lib/vendor-search.ts` + unit tests.
3. `src/lib/types/database.ts`: row types, the stage union, `vendor_id`,
   and the `Relationships` entries for every embed §7 adds.
4. `src/server/queries/vendors.ts` and `src/server/actions/vendors.ts` —
   vendor CRUD and contacts first, proving tenancy and the primary-contact
   index end to end before any screen exists.
5. `/vendors`: the list, the inline add form, URL-held filters, the
   archived toggle.
6. `/vendors/[id]`: header, contacts card, notes card.
7. The budget link: `vendor_id` through `budget.ts`'s action and query,
   `VendorPicker`, `BudgetItemFields`, the conditional link in
   `BudgetItemRow`.
8. `/vendors/[id]`'s money card and read-only task list, reading spec 6's
   views.
9. The §4 backfill panel and `createVendorFromBudgetLines`.
10. `Nav`, seed data, `supabase/tests/05_vendors.sql`.
11. Full check pass + browser pass per §8.

Steps 1–6 are a complete, useful feature on their own — an address book with
notes, which is most of what was asked for. If the budget link turns out to
want more discussion than §11 settles, 7–9 can be deferred without stranding
anything.

## 10. What this leaves for V2 proper

Named here so the next session doesn't have to re-derive what was left out
on purpose: quotes as versioned records with the PDF attached, contracts and
the payment schedules they generate, the Gmail inbox and thread linking,
`/vendors/compare`, the two-sided "what we owe them / what they owe us"
lists, and the kanban pipeline. Every one of them is additive on top of this
schema — `vendors.id` is the foreign key they all hang off, which is the
main thing this pass exists to establish.

## 11. Open questions — need the planner's answers before anything is built

1. **Where does a vendor's category come from?** Recommendation: reuse
   `budget_categories` via a nullable `category_id` (§3), so "Flowers" is
   one row that both pages read. Alternative: free text on `vendors`, which
   is cheaper and lets a vendor be categorised before the budget line
   exists, at the cost of two lists that drift. A third option — its own
   `vendor_categories` table — is the one I'd argue against: it's the same
   taxonomy twice with extra steps.
2. **Stage: the eight values in §3, and no kanban this pass?**
   Recommendation: yes to both — a select and a filter now, a board later if
   the list ever gets long enough to want one.
3. **Notes as a dated log, or one free-text field?** Recommendation: the
   log (`vendor_notes`), plus the single-line `vendors.notes` for the
   throwaway one-liner. The log is what makes "what did they actually say
   in March" answerable. If you'd rather have one textarea, `vendor_notes`
   comes out of §3 entirely and this gets noticeably smaller.
4. **Can one budget line have more than one vendor?** Recommendation: no —
   one nullable FK, and a line split between two suppliers is two lines.
   Making it many-to-many costs a join table and makes the "£800 — who is
   this with" question ambiguous on every screen. Say so now if the answer
   is yes; retrofitting it later is a migration, not an edit.
5. **A printable day-of contact sheet** (`/vendors/contact-sheet`, every
   vendor and primary contact on one page, print CSS reused from
   `/invitations/print`)? Recommendation: yes, and it's about an hour — but
   it's my idea, not something you asked for, so it's a question rather
   than scope.
6. **Keep `source`, `recommended_by` and `gut_score`?** Recommendation:
   keep all three — they're free, they're in the platform spec already, and
   "who recommended them" is genuinely hard to reconstruct later. I'd drop
   the platform spec's `price_band`: real numbers live on budget lines, and
   a £/££/£££ band next to "£3,200 contracted" is noise.
7. **Are vendor tasks via budget lines enough?** Recommendation: yes, and
   read-only (§2) — a direct `vendor_id` on `list_items`, or a third join
   table, would mean two ways to express the same relationship and two
   places to look for it.
8. **Confirming the no-automatic-matching rule** (§4): exact-string
   grouping, planner presses the button, trigram matching deliberately
   unused. Recommendation: confirm. Flagging it because guest import does
   the opposite, on purpose, and the inconsistency is the kind of thing
   that looks like an oversight later.
9. **Confirming documents/quotes/contracts are out of this pass.** They
   need a storage bucket that does not exist yet. Recommendation: confirm —
   and if file attachments are the thing you actually want most, say so,
   because that's a different spec with a real infrastructure step in it.
10. **Confirming `run_sheet_items.owner` stays free text** for now, rather
    than becoming a vendor FK (`0009`'s own comment anticipates this).
    Recommendation: confirm, and pick it up as a small separate change once
    vendors exist and there's something to point at.
