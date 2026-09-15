# Feature spec: Budget management

**Status: proposed. Nothing built. Per `docs/specs/README.md`, no server
action, query, screen, or migration beyond schema gets built until the Open
Questions section (§9) has answers.**

**Depends on:** V1 (`weddings`, `households`, `guests`, `events`) plus, for
the reminders sync specifically (§5), spec 1 (lists/timeline) and spec 2
(reminders) — both already built. Does **not** depend on spec 5.

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

## 2. Scope

**In:**
- Categories and line items with the four-number model (estimated, quoted,
  contracted, paid — paid always derived from `payments`, never typed).
- A payment schedule per line item, syncing into the existing
  timeline/reminders surfaces (§5) so an upcoming deposit shows up the same
  way an overdue checklist item does — one place to look, not two.
- A general **per-unit costing mechanism**: any line item can be priced as
  a flat number (today's only option, kept as the default) *or* as a unit
  price that scales live with the guest count — per adult, per child, or
  per seat (adult + child). This is the mechanism that answers "food
  calcs" and "alcohol calcs": both are a per-adult (and usually a separate,
  lower per-child) unit price, computed against `v_households`' existing
  adult/child/seat counts, not a bespoke catering or bar table.
- A live, wedding-level **per-head figure**: total of every per-unit line
  item, divided by headcount, shown as a standing number and specifically
  surfaced on `/guests/rank` next to the cut line — "each seat above the
  line currently costs about £X" — because that's the number that actually
  changes what a planner decides while dragging.
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
- No detailed **consumption** calculator (bottles of wine needed for 80
  people over 5 hours, glasses per guest per hour by drink type). The
  per-unit mechanism covers "£X per adult for the bar package," which is
  how most UK venues actually quote alcohol; a true consumption model is
  materially fuzzier (needs its own assumptions the planner would have to
  configure) and is flagged as a possible follow-up in §9.5, not built now.
- No multi-currency conversion. `currency` is stored per row (platform-wide
  rule), defaults to `weddings.base_currency` on every new item, and mixed
  currencies simply sum at face value with no FX — see §9.3.
- No automatic task generation ("booking a vendor creates a chase task").
  That's V2's fuller "contract generates payment schedule generates tasks"
  loop; this spec's sync (§5) is one direction only — payments appear in
  reminders, nothing generates new list items.

## 3. Data model

```
budget_categories   id, wedding_id, name, sort_order, created_at, updated_at

budget_items         id, wedding_id, category_id, event_id (nullable),
                      label, vendor_name (text, nullable), currency,
                      quantity_basis (flat|per_adult|per_child|per_seat),
                      unit_price (int minor units, nullable),
                      estimated (int minor units, nullable),
                      quoted (int minor units, nullable),
                      contracted (int minor units, nullable),
                      notes, created_at, updated_at

payments              id, wedding_id, budget_item_id, due_date, amount
                      (int minor units), currency, paid_at, reference,
                      paid_by, notes, created_at, updated_at
```

- **`quantity_basis`** is the per-head mechanism: `flat` means `estimated`/
  `quoted`/`contracted` are entered directly, exactly like today's implied
  model. Any other value means the "current number" for that line is
  `unit_price × <live count>` instead — `per_adult` reads
  `v_households`-summed `adult_count`, `per_child` reads `child_count`,
  `per_seat` reads `seat_count` (adults + children, matching
  `v_households.seat_count`'s existing "infants don't occupy a seat"
  rule). `event_id`, when set, scopes that count to guests invited to that
  specific event rather than the whole wedding — relevant for a reception-
  only catering line on a wedding with a separate, smaller rehearsal
  dinner.
- `estimated`/`quoted`/`contracted` stay nullable and independently
  settable even on a non-flat item — a per-adult line still needs an
  *estimated* unit price before you have a *contracted* one; each of the
  three numbers is its own snapshot of unit price × count at the time it
  was entered, not recomputed retroactively. Only the **live figure**
  shown on screen (§3 view, below) recomputes continuously; the three
  stored numbers behave exactly like today's flat ones once entered.
- **`budget_items.paid` is not a column**, per the platform spec's own
  rule for this exact table — paid is `sum(payments.amount) where
  payments.paid_at is not null`, exposed through a view.
- `payments.due_date` with `paid_at` null is what the reminders sync (§5)
  reads. `payments` doesn't need its own status enum — "paid" is `paid_at
  is not null`, matching `invitations.sent_at` / `rsvps.responded_at`'s
  existing "timestamp, not boolean" convention.

**Views:**

- **`v_budget_items`** — every `budget_items` row plus: `computed_current`
  (the live number: `unit_price × count` for a non-flat item, else
  `coalesce(contracted, quoted, estimated)` — "the best number we currently
  have," never collapsing the three into one stored figure, per the
  platform spec's explicit warning against that), `paid` (derived, above),
  `outstanding` (`computed_current - paid`).
- **`v_budget_summary`** — one row per wedding: `total_estimated`,
  `total_quoted`, `total_contracted`, `total_paid`, `total_outstanding`
  (all summed from `v_budget_items`), plus `per_head_adult` and
  `per_head_seat` — sum of `computed_current` across `per_adult`/`per_seat`
  items respectively, divided by the relevant live count. This is what
  `/guests/rank` and the dashboard tile read.
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
`budget_categories`, `budget_items`, `payments`; add all three to the RLS
`tenant_tables` array; create the three views above (`v_reminders_due`
depends on spec 1's `v_timeline_items` existing, which it already does).

## 4. Screens

| Route | What it does |
| --- | --- |
| `/budget` | Categories as sections, each a table of items with the four numbers + live current + variance; "Add category," "Add item" with the basis picker (flat vs. per-adult/child/seat) and a live preview of what the current headcount makes that line cost; a payment calendar below, chronological, overdue highlighted the same way `/timeline` highlights overdue items |
| `/` (dashboard) | New "Budget" tile: total committed vs. paid, upcoming payment count, per-head figure — same visual family as spec 2's "Tasks" tile |
| `/guests/rank` | A small standing figure near the cut line: current per-seat cost, reading `v_budget_summary.per_head_seat` — the payoff feature, makes the cost of dragging one more household above the line visible while you're actually dragging it |

No `/budget/[id]` detail route — a category's items are a handful of rows
each, not enough to need a drill-down; keep it one page, matching how
spec 1 kept `/lists` a single page per list rather than paginating.

## 5. Server actions & queries

`src/server/actions/budget.ts`: `createBudgetCategory`,
`renameBudgetCategory`, `deleteBudgetCategory` (refuses if it still has
items — no cascade delete of money data), `createBudgetItem`,
`updateBudgetItem`, `deleteBudgetItem`, `recordPayment`, `updatePayment`,
`markPaymentPaid(id, paidAt)`, `deletePayment`.

`src/server/queries/budget.ts`: `listBudgetCategories`,
`listBudgetItems` (reads `v_budget_items`), `getBudgetSummary` (reads
`v_budget_summary`), `getUpcomingPayments`.

`src/server/queries/reminders.ts` (spec 2, existing): the digest query and
dashboard tile queries switch their source view per §3's
`v_reminders_due`; no new query file needed for this half, just a source
swap inside code that already exists.

## 6. What "sync with reminders and lists" means here, precisely

Two things, and explicitly not more, since the planner's ask was specific:

1. **A payment with an unpaid due date behaves like an overdue task** in
   every surface spec 2 already built: the dashboard's "Overdue" / "Due
   this week" tiles, and the weekly digest email — via `v_reminders_due`
   (§3), reusing spec 2's existing cron/email/dedupe plumbing rather than
   building a second one.
2. **Nothing else.** A budget item does not create a list item; a list
   item does not create a budget item; marking a payment paid does not
   touch any list. If the planner wants "chase the caterer for the final
   headcount by X" as a checklist item, they add it themselves on
   `/lists`, same as today — see §9.4 for whether that should change.

## 7. Test plan

- Unit: a `src/lib/budget.ts` module for the per-unit computation
  (`computed_current` given a basis, unit price, and counts) — pure logic
  per `docs/HANDOFF.md` section 8, tested directly rather than only through
  the view, same "duplicate the view's logic deliberately, test against
  the SQL suite" pattern `tier.ts` already establishes for exactly this
  reason (a client-side preview while typing a unit price needs the same
  answer as the server, without a round trip).
- SQL test suite addition (`supabase/tests/`) asserting `v_budget_items`'s
  `paid`/`outstanding` derivation and `v_budget_summary`'s per-head math
  against seeded households of known adult/child/seat counts.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh`,
  `npm run build`.
- Browser pass: create a flat item and a per-adult item, confirm the
  live preview matches actual `adult_count`; record a partial payment,
  confirm `paid`/`outstanding` update with no page refresh beyond the
  action's `revalidatePath`; set a payment due date in the past and
  confirm it appears on the dashboard's overdue tile and in a manually
  triggered digest send; change the cut line on `/guests/rank` (if spec 5
  Part A has shipped) or drag a household across the existing cut line
  and confirm the per-seat figure updates live.

## 8. Build order

1. `0010_budget.sql` — tables, RLS, the three views.
2. `src/lib/budget.ts` (pure per-unit computation) + unit tests.
3. `src/server/actions/budget.ts`, `src/server/queries/budget.ts`.
4. Swap spec 2's digest/dashboard queries onto `v_reminders_due`; extend
   the digest email template to render a payment row distinctly from a
   list-item row (different verb: "due" vs. "overdue task").
5. `/budget` screen: categories/items table first (flat items only,
   proving the four-number + payment plumbing end to end), basis picker
   and live preview second.
6. Dashboard "Budget" tile.
7. `/guests/rank` per-seat figure.
8. Full check pass + browser pass per §7.

## 9. Open questions

1. **Which headcount drives the per-head figures — invited (top cut tier,
   pre-RSVP) or confirmed (RSVP yes)?** Early in planning there's no RSVP
   data at all, so the number has to mean "invited" then; once responses
   land, "confirmed" is the more honest catering number. Recommend: the
   `/guests/rank` figure (a pre-RSVP, deciding-who-to-invite screen) always
   uses invited/tier counts, since that's the number actually moving while
   dragging; the `/budget` and dashboard figures switch to RSVP-confirmed
   counts once any RSVPs exist for the wedding, falling back to invited
   counts before that. Needs an explicit decision either way before build.
2. **Do infants ever carry a cost basis of their own** (a "high chair
   meal," a smaller alcohol allowance) or are they always excluded, matching
   `v_households.seat_count`'s existing exclusion? Recommend: excluded,
   consistent with seating; a planner who wants to budget for infant meals
   uses a flat line item instead.
3. **Multi-currency, for real or not.** The platform-wide rule (every money
   row carries a `currency` column) is kept regardless, but is any real
   conversion needed — a deposit paid in a second currency for an overseas
   honeymoon or venue — or does everything on this wedding sit in one
   currency and the column is pure future-proofing? Recommend: no
   conversion logic now; mixed-currency totals in `v_budget_summary` sum
   face value and the UI flags it rather than silently misadding, revisit
   only if a real cross-currency line shows up.
4. **Does booking/contracting a vendor line ever generate a task?** V2's
   fuller vision has a contract generate a payment schedule which generates
   tasks. This spec's §6 deliberately stops at "payments appear as
   reminders." Confirm that's the right stopping point for this pass, or
   whether even a narrow version (contracting an item prompts "add a
   checklist item to chase final numbers?") is wanted now.
5. **Consumption-style alcohol/catering calculator** (drinks per guest per
   hour × event duration × price per unit, split by drink type) as a
   follow-up beyond the per-unit mechanism in §3 — worth its own future
   spec once the simpler per-adult/per-child pricing is in use and its
   gaps are concretely felt, or worth building now alongside it? Recommend
   deferring; the assumptions involved (consumption rates) are subjective
   per wedding and are easiest to get right once there's a real one to
   calibrate against.
6. **Category deletion when items exist** — §5 says refuse; is "move its
   items to another category first" the right UX, or should deletion be
   allowed with items falling back to "Uncategorised"? Recommend the
   refuse-and-require-empty rule, matching spec 4's "no destructive writes"
   posture generally, but flagging since it's a genuine UX friction point
   if a planner wants to rename/merge categories after the fact.
