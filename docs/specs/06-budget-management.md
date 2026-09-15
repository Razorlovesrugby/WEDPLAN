# Feature spec: Budget management

**Status: decided, not yet built. Amended 2026-09-15: every question in §9
has an answer, recorded there as decisions. Three of those decisions
(§9.3, §9.4, §9.5) moved real scope from "out" to "in" relative to the
first draft — live FX conversion, a consumption-based costing calculator,
and prompted task generation on contracting a line are all now part of
this spec, not follow-ups. §2–§8 below reflect that expanded scope
directly; nothing here is provisional.**

**Depends on:** V1 (`weddings`, `households`, `guests`, `events`) plus, for
the reminders sync (§6), spec 1 (lists/timeline) and spec 2 (reminders) —
both already built. Does not depend on spec 5. Additionally now depends on
a live external FX rate lookup (§3, §9.3) — the first outbound
third-party API call this app makes outside of email sending, worth
flagging since it's a new class of dependency (availability, latency,
what happens when it's down) rather than just new schema.

## 1. What this replaces

The other spreadsheet: the one with a column for "estimated," a column for
"actual," and a running total that's wrong the moment a deposit clears
because nobody went back and updated the formula. `docs/wedding-platform-spec.md`
already named the shape this should take in V2 — four numbers per line
(estimated, quoted, contracted, paid), paid always derived from actual
payments rather than hand-typed — and separately named "live per-head
marginal cost" as "the one number that matters most." This spec pulls that
scope forward, narrowed to money only: no vendor pipeline, no inbox, no
Gmail. A vendor's *name* shows up on a budget line; their contact,
quotes-with-PDFs, contract, and email thread do not exist here and are
still V2 proper.

It also goes a step past what the platform spec sketched: "per-head
marginal cost" as one aggregate number is a reasonable dashboard figure,
but it isn't how catering and bar quotes actually arrive — those come as
"£X per adult," "£Y per child," or genuinely as a consumption estimate
("2 glasses of wine per guest per hour"). §3 builds the general mechanism
for the first two and a real calculator for the third, rather than one
rollup figure standing in for all of it.

## 2. Scope

**In:**
- Categories and line items with the four-number model (estimated, quoted,
  contracted, paid — paid always derived from `payments`, never typed).
- A payment schedule per line item, syncing into the existing
  timeline/reminders surfaces (§6) so an upcoming deposit shows up the same
  way an overdue checklist item does — one place to look, not two.
- A general **per-unit costing mechanism**: any line item can be priced as
  a flat number (today's implied default) *or* as a unit price that scales
  live with the guest count — per adult, per child, or per seat (adult +
  child). Reads `v_households`' existing adult/child/seat counts directly;
  no bespoke catering or bar table for this case.
- A **consumption-based costing mode**, for lines that aren't a flat
  per-head price — most alcohol packages, and some catering. A line in
  this mode is made of one or more components (e.g. "Red wine," "Beer,"
  "Soft drinks"), each with its own guest basis, a serving rate per guest
  per hour, an event duration, and a price per serving. See §3.
- A live, wedding-level **per-head figure**: total of every per-unit and
  consumption line, divided by headcount, shown as a standing number and
  specifically surfaced on `/guests/rank` next to the cut line — "each
  seat above the line currently costs about £X" — because that's the
  number that actually changes what a planner decides while dragging.
- **Live FX conversion.** A line or payment in a currency other than the
  wedding's `base_currency` looks up a real exchange rate automatically
  and snapshots it onto that row, so summary totals convert to
  `base_currency` without the planner doing currency maths by hand. See §3
  and §9.3 for the exact mechanism and its failure handling.
- **Prompted follow-up tasks.** The first time a line's `contracted` value
  is set, the UI offers to add a checklist item to chase final numbers —
  opt-in per line, landing on a dedicated "Budget follow-ups" list. See §6.
- `/budget`: categories, the four-column table with variance, a payment
  calendar, and the per-head summary.
- A "Budget" tile on the dashboard (`/`), matching how spec 2 added a
  "Tasks" tile — count of upcoming/overdue payments, total committed vs.
  paid, the per-head figure.

**Out, explicitly:**
- No vendor pipeline (`vendors` table, kanban stages, contacts, quotes as
  versioned documents, contracts, Gmail). `budget_items.vendor_name` is
  free text, same "no FK to something that doesn't exist yet" rule spec 5
  Part B applies to `run_sheet_items.owner`. If a full vendor CRM ships
  later, this text field is the natural migration target for a real FK.
- No payment *processing* — recording a payment here means "the planner
  says this happened," not moving money. No Stripe, no bank integration.
- No cost basis for infants (§9.2 — always excluded from every per-head
  and consumption calculation, matching `v_households.seat_count`'s
  existing exclusion; a planner who wants an infant-specific line uses a
  flat item).
- No automatic task generation beyond the single prompted moment in §6 —
  nothing generates a task from a payment, a category, or any other event
  besides a line's first `contracted` value being set.

## 3. Data model

```
budget_categories    id, wedding_id, name, sort_order, created_at, updated_at

budget_items          id, wedding_id, category_id, event_id (nullable),
                       label, vendor_name (text, nullable), currency,
                       fx_rate (numeric, nullable),
                       quantity_basis (flat|per_adult|per_child|per_seat|consumption),
                       unit_price (int minor units, nullable),
                       estimated (int minor units, nullable),
                       quoted (int minor units, nullable),
                       contracted (int minor units, nullable),
                       contracted_task_created (bool, default false),
                       notes, created_at, updated_at

consumption_components id, wedding_id, budget_item_id, label,
                       guest_basis (per_adult|per_seat),
                       servings_per_guest_per_hour (numeric),
                       duration_hours (numeric),
                       price_per_serving (int minor units),
                       wastage_buffer_pct (numeric, default 0),
                       sort_order, created_at, updated_at

payments               id, wedding_id, budget_item_id, due_date, amount
                       (int minor units), currency, fx_rate (numeric,
                       nullable), paid_at, reference, paid_by, notes,
                       created_at, updated_at

fx_rates               base_currency, quote_currency, rate (numeric),
                       as_of (date), fetched_at (timestamptz)
                       -- global reference data, no wedding_id — same
                       -- shape as list_templates: shared across every
                       -- wedding, read-only via the API, written only by
                       -- the lookup path below
                       unique (base_currency, quote_currency, as_of)
```

- **`quantity_basis`** is the per-head mechanism. `flat` means
  `estimated`/`quoted`/`contracted` are entered directly — today's implied
  model. `per_adult` / `per_child` / `per_seat` mean the "current number"
  for that line is `unit_price × <live count>` — reading
  `v_households`-summed `adult_count`, `child_count`, or `seat_count`
  (adults + children; infants excluded, §2). `consumption` means the
  current number is instead the sum of that item's `consumption_components`
  rows (below); `unit_price` is unused and stays null for a consumption
  item. `event_id`, when set, scopes any of these live counts to guests
  invited to that specific event rather than the whole wedding — relevant
  for a reception-only catering line on a wedding with a smaller separate
  rehearsal dinner.
- **`consumption_components`** — one row per drink/food type within a
  consumption-mode line. Each row computes its own serving count
  independently: `ceil(servings_per_guest_per_hour × duration_hours ×
  <live count for guest_basis> × (1 + wastage_buffer_pct))`, times
  `price_per_serving`. A bar line might be three rows — "Wine" (per_adult,
  1.5 servings/hour), "Beer" (per_adult, 1 serving/hour), "Soft drinks"
  (per_seat, 1 serving/hour) — each independently priced and summed for
  the parent `budget_items` row's current total. `duration_hours` is
  entered by the planner in this pass; a natural follow-up once spec 5
  Part B (run sheet) exists is pulling it from that event's actual
  scheduled length instead — not built now, since this spec doesn't
  depend on spec 5.
- `estimated`/`quoted`/`contracted` stay nullable and independently
  settable even on a non-flat item — each is its own snapshot at the time
  it was entered, not recomputed retroactively when the basis, unit price,
  or component rows change later. Only the **live figure** (the view,
  below) recomputes continuously.
- **`budget_items.paid` is not a column**, per the platform spec's own
  rule for this exact table — paid is `sum(payments.amount) where
  payments.paid_at is not null`, converted to `base_currency` (below) and
  exposed through a view.
- **`fx_rate`** on `budget_items` and `payments`: "units of
  `weddings.base_currency` per 1 unit of this row's own `currency`."
  Null/`1` when the row's currency already matches base currency. Set
  once, automatically, the moment a row is created or its currency
  changes (§9.3) — an accounting-style snapshot, not a live-recomputed
  value, so a summary total doesn't silently shift because the market
  moved between two page loads. Editable by the planner if they have a
  better number (e.g. their bank's actual rate on the day).
- **`fx_rates`** is a small cache in front of the external lookup: keyed
  on `(base_currency, quote_currency, as_of)`, one row per currency pair
  per day. Reading or writing a budget row in a foreign currency first
  checks this table for today's rate; only calls the external API on a
  cache miss, and writes the result back. This means at most one external
  call per currency pair per day across every wedding using the app, not
  one per keystroke.
- `payments.due_date` with `paid_at` null is what the reminders sync (§6)
  reads. `payments` doesn't need its own status enum — "paid" is `paid_at
  is not null`, matching `invitations.sent_at` / `rsvps.responded_at`'s
  existing "timestamp, not boolean" convention.
- `budget_items.contracted_task_created` is the one piece of state the
  prompted-task feature needs: without it, editing a contracted value a
  second time (correcting a typo, say) would re-offer the same prompt.
  Set to `true` the moment the planner accepts the prompt *or* dismisses
  it — either answer means "don't ask again for this line."

**Views:**

- **`v_budget_items`** — every `budget_items` row plus: `computed_current`
  (the live number, in the row's *own* currency: `unit_price × count` for
  a per-unit item, the summed `consumption_components` total for a
  consumption item, else `coalesce(contracted, quoted, estimated)` — "the
  best number we currently have," never collapsing the three into one
  stored figure, per the platform spec's explicit warning against that),
  `computed_current_base` (the same figure × `fx_rate`, in
  `weddings.base_currency`), `paid` and `paid_base` (derived from
  `payments`, both currencies), `outstanding_base`
  (`computed_current_base - paid_base`).
- **`v_budget_summary`** — one row per wedding, all in `base_currency`:
  `total_estimated`, `total_quoted`, `total_contracted`, `total_paid`,
  `total_outstanding` (summed from `v_budget_items`'s `*_base` columns),
  plus `per_head_adult` and `per_head_seat` — sum of `computed_current_base`
  across the relevant per-unit/consumption items, divided by the relevant
  live count. This is what `/guests/rank` and the dashboard tile read.
- **`v_reminders_due`** — a union of spec 1's `v_timeline_items` (due
  `list_items`) and unpaid `payments` (`paid_at is null`, has a
  `due_date`), each row tagged with a `source` discriminant
  (`list_item | payment`). Spec 2's digest and dashboard tiles switch from
  querying `v_timeline_items` directly to querying this view, so an
  upcoming deposit shows up in the exact same "overdue / due this week"
  language a checklist item does, in the same weekly email, with no second
  digest to maintain. `/timeline` itself (spec 1's screen) is unaffected —
  it stays list-items-only, since a payment isn't a task to check off.

**Migration (new file, e.g. `0010_budget.sql`):** create
`budget_categories`, `budget_items`, `consumption_components`, `payments`,
`fx_rates`; add the first four to the RLS `tenant_tables` array (`fx_rates`
is global reference data, same treatment as `list_templates` — readable by
any authenticated collaborator, writable only by the server-role lookup
path, not by the tenant policy loop); create the views above.

## 4. Screens

| Route | What it does |
| --- | --- |
| `/budget` | Categories as sections, each a table of items with the four numbers + live current (in `base_currency`) + variance; "Add category," "Add item" with the basis picker (flat / per-adult / per-child / per-seat / consumption) — a consumption item's editor adds/removes component rows (label, guest basis, rate, duration, price) with a live computed total per row and summed for the item; a non-base-currency item shows the looked-up rate inline with an override control; a payment calendar below, chronological, overdue highlighted the same way `/timeline` highlights overdue items |
| `/` (dashboard) | New "Budget" tile: total committed vs. paid, upcoming payment count, per-head figure — same visual family as spec 2's "Tasks" tile |
| `/guests/rank` | A small standing figure near the cut line: current per-seat cost, reading `v_budget_summary.per_head_seat` — the payoff feature, makes the cost of dragging one more household above the line visible while you're actually dragging it; always computed from **invited** counts (§9.1), never RSVP counts, regardless of what `/budget` and the dashboard are showing |

No `/budget/[id]` detail route — a category's items are a handful of rows
each, not enough to need a drill-down; keep it one page, matching how
spec 1 kept `/lists` a single page per list rather than paginating.

**The contracting prompt** (§6) surfaces inline where `contracted` is
edited on `/budget` — a one-line confirm ("Add a checklist item to chase
final numbers for {label}?") immediately after the field is saved with a
non-null value for the first time, not a separate screen.

## 5. Server actions & queries

`src/server/actions/budget.ts`: `createBudgetCategory`,
`renameBudgetCategory`, `deleteBudgetCategory` (§9.6 — allowed even with
items still in it; any items move to an auto-created "Uncategorised"
category for the wedding rather than blocking the delete),
`createBudgetItem`, `updateBudgetItem` (this is what detects the
`contracted` null → non-null transition and returns whether the prompt
should show), `deleteBudgetItem`, `addConsumptionComponent`,
`updateConsumptionComponent`, `removeConsumptionComponent`,
`recordPayment`, `updatePayment`, `markPaymentPaid(id, paidAt)`,
`deletePayment`, `confirmBudgetFollowUp(budgetItemId)` (creates, or
reuses, the wedding's "Budget follow-ups" list and adds a `list_items` row
titled from the budget line's label and vendor name — see §6 for exactly
what it creates and doesn't), `dismissBudgetFollowUp(budgetItemId)` (just
sets `contracted_task_created = true` with no list write).

`src/server/queries/budget.ts`: `listBudgetCategories`,
`listBudgetItems` (reads `v_budget_items`), `getBudgetSummary` (reads
`v_budget_summary`), `getUpcomingPayments`.

`src/server/queries/fx.ts`: `getFxRate(currency, weddingId)` — the shared
lookup behind every non-base-currency row. Checks `fx_rates` for
`(wedding.base_currency, currency, today)` first; on a miss, calls an
external FX API (implementation choice for build time, not a product
decision — a no-API-key provider such as Frankfurter or open.er-api.com
avoids adding a secret to manage), writes the result into `fx_rates`, and
returns it. On lookup failure (the API is down, or the currency pair isn't
covered): falls back to the most recent cached rate for that pair
regardless of age, and if there is none at all, falls back to manual entry
— the row saves with `fx_rate = null` and a visible "rate not available,
enter manually" state, never a blocked save. Same "warn, don't hard-block"
posture spec 5 Part B uses for schedule conflicts.

`src/server/queries/reminders.ts` (spec 2, existing): the digest query and
dashboard tile queries switch their source view per §3's
`v_reminders_due`; no new query file needed for this half, just a source
swap inside code that already exists.

## 6. What "sync with reminders and lists" means here, precisely

Two things:

1. **A payment with an unpaid due date behaves like an overdue task** in
   every surface spec 2 already built: the dashboard's "Overdue" / "Due
   this week" tiles, and the weekly digest email — via `v_reminders_due`
   (§3), reusing spec 2's existing cron/email/dedupe plumbing rather than
   building a second one.
2. **Contracting a line can add one checklist item, opt-in, once.** The
   moment `contracted` moves from null to a real value, `/budget` offers
   the one-line prompt from §4. Accepting calls `confirmBudgetFollowUp`,
   which adds a plain `list_items` row — title `"Confirm final numbers
   with {vendor_name or label}"`, no auto-filled due date (the planner
   sets one if they want it in the reminders digest; guessing a date from
   the event would be wrong often enough not to bother) — to a
   wedding-level "Budget follow-ups" list, created the first time it's
   needed exactly like spec 1's other lazily-created lists. Declining
   calls `dismissBudgetFollowUp`. Either way, `contracted_task_created`
   flips to `true` and the prompt never shows again for that line — a
   later correction to the `contracted` figure doesn't re-trigger it.

**Nothing else.** No task generates a budget item; no other budget event
(recording a payment, marking one paid, creating a category) generates a
task; the checklist item created here is a completely ordinary
`list_items` row afterward, with no ongoing link back to the budget line
that spawned it.

## 7. Test plan

- Unit: a `src/lib/budget.ts` module for the per-unit and consumption
  computation (`computed_current` given a basis, unit price or component
  rows, and counts) — pure logic per `docs/HANDOFF.md` section 8, tested
  directly rather than only through the view, same "duplicate the view's
  logic deliberately, test against the SQL suite" pattern `tier.ts`
  already establishes (a client-side preview while typing needs the same
  answer as the server, without a round trip). Cases: flat, each per-unit
  basis, a consumption item with multiple components and a wastage buffer,
  an `event_id`-scoped count.
- Unit: `src/lib/fx.ts` or similar for the conversion math
  (`amount × fx_rate`) and the fallback ladder in `getFxRate` (cache hit,
  cache miss → live call, live call fails → stale cache, no cache at all →
  manual/null) with the external call mocked.
- SQL test suite addition (`supabase/tests/`) asserting `v_budget_items`'s
  `paid`/`outstanding_base` derivation and `v_budget_summary`'s per-head
  math against seeded households of known adult/child/seat counts,
  including a consumption-basis item and a non-base-currency item.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build`.
- Browser pass: create a flat item, a per-adult item, and a consumption
  item with two components, confirm each live preview matches actual
  guest counts; add an item in a non-base currency, confirm a rate is
  fetched and shown, override it manually, confirm the override sticks
  through a later edit rather than being silently refetched; record a
  partial payment, confirm `paid`/`outstanding` update with no page
  refresh beyond the action's `revalidatePath`; set a payment due date in
  the past and confirm it appears on the dashboard's overdue tile and in a
  manually triggered digest send; set `contracted` on a line for the first
  time, confirm the prompt appears, accept it, confirm the item lands on
  "Budget follow-ups" with no due date, edit `contracted` again and
  confirm the prompt does not reappear; drag a household across the
  existing cut line on `/guests/rank` and confirm the per-seat figure
  updates live using invited counts specifically.

## 8. Build order

1. `0010_budget.sql` — tables (including `consumption_components` and
   `fx_rates`), RLS, the three views.
2. `src/lib/budget.ts` (per-unit + consumption computation) and
   `src/lib/fx.ts` (conversion math) + unit tests for both.
3. `src/server/queries/fx.ts` (`getFxRate` with the cache/fallback ladder)
   — before any screen needs it, since budget item entry depends on it.
4. `src/server/actions/budget.ts`, `src/server/queries/budget.ts` —
   categories and flat items first, proving the four-number + payment
   plumbing end to end.
5. Per-unit basis (`per_adult`/`per_child`/`per_seat`) in the item editor
   and `computed_current`.
6. Consumption basis: `consumption_components` CRUD, the multi-row editor,
   summed `computed_current`.
7. Non-base-currency entry wired to `getFxRate`, with the manual-override
   control and the "rate not available" fallback state.
8. Swap spec 2's digest/dashboard queries onto `v_reminders_due`; extend
   the digest email template to render a payment row distinctly from a
   list-item row (different verb: "due" vs. "overdue task").
9. The contracting prompt: `contracted_task_created`,
   `confirmBudgetFollowUp` / `dismissBudgetFollowUp`, the "Budget
   follow-ups" list creation path.
10. Dashboard "Budget" tile.
11. `/guests/rank` per-seat figure, on invited counts.
12. Full check pass + browser pass per §7.

## 9. Decided (2026-09-15)

1. **Which headcount drives the per-head figures:** `/guests/rank`'s
   figure always uses **invited** (top cut tier) counts, since that's the
   number actually moving while the planner drags. `/budget` and the
   dashboard switch to **RSVP-confirmed** counts once any RSVPs exist for
   the wedding, falling back to invited counts before that.
2. **Infants never carry a cost basis of their own.** Always excluded from
   every per-head and consumption calculation, matching
   `v_households.seat_count`'s existing exclusion. A planner budgeting for
   an infant meal uses a flat line item instead.
3. **Real FX conversion, sourced from a live rate lookup**, not manual
   entry — see §3 and §5 (`getFxRate`) for the caching and fallback
   mechanism. Rates are snapshotted onto each row at entry/edit time, not
   recomputed on every read, so summary totals don't drift with the market
   between page loads.
4. **Contracting a line prompts an optional follow-up checklist item**,
   once per line — see §6 for the exact mechanism
   (`contracted_task_created`, the "Budget follow-ups" list, no
   auto-filled due date).
5. **The consumption-based calculator is built now**, as
   `consumption_components` (§3), not deferred — component rows with
   their own guest basis, serving rate, duration, and price, summed per
   line. Duration is planner-entered in this pass; pulling it from spec
   5 Part B's run sheet once that exists is a noted future integration,
   not a dependency of this spec.
6. **Deleting a budget category with items in it is allowed** — items fall
   back to an auto-created "Uncategorised" category for the wedding rather
   than blocking the delete.
