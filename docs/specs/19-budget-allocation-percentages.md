# Feature spec: Budget — an overall budget, percentage allocations, and allocation-derived estimates

**Status: built end to end, session 23 (2026-09-20).** All six of §9's
questions were answered the same day — the planner took the recommendation
on every one (§12) — and then said to build it.
`0020_budget_allocations.sql`, the allocation math in `src/lib/budget.ts`,
the starter table in `src/lib/budget-allocations.ts`, three new server
actions, `listBudgetCategoryTotals`, and all four `/budget` surfaces plus
the dashboard line. See §13 for what shipped, the one place the build
corrected this spec, and what was actually verified. **§8's suggested
percentages shipped as written and are still the placeholder §12 decision 6
describes** — the mechanism is agreed, those specific numbers are not, and
they are one array to edit.

**Depends on:** spec 6 / 6.1 (budget) and spec 18 (NZD-only + GST), all
built. Reads spec 6's `budget_categories` / `budget_items` /
`v_budget_items` / `v_budget_summary` and spec 18's `gst_treatment`;
touches no other feature's schema.

## 1. What this solves

The planner's ask, in their own words:

> I'd like to be able to put in the overall budget for the wedding and
> then for the different sections within the budget provide a percentage
> of what that should make up of the overall budget (i.e. venue 12%) and
> then for that section to total all the different estimates or quotes or
> actual spend, etc, against what the percentage assigned is to see if
> we're tracking over or under as a %. […] Then the 'estimate' section for
> each exact budget item could be done as a % of that overall budget
> section. I.e. under drinks 80% alcohol, 10% non alcohol, 10% glassware
> hire — and that would give the estimate we should be working to for that
> item. […] Basically an allocation field that would feed into the
> estimate unless the estimate is filled in itself.

Spec 6 built the budget **bottom-up**: you know a florist costs $2,400, so
you type $2,400, and the totals add themselves up. What it never gave you
is a **top-down** number — "we have $40,000; roughly what should flowers
be?" — which is the number you actually need first, before a single quote
exists, and the one every "what percentage of your budget should go on X"
article on the internet is about.

This spec adds that second direction and joins the two together:

1. **An overall budget** for the wedding — one figure.
2. **A percentage per category**, which turns the overall budget into a
   target amount for that category ("Venue 12%" → $4,800 of $40,000).
3. **A rollup per category** — everything spec 6 already computes for the
   lines in it (estimates, quotes, contracted figures, actual payments)
   totalled against that target, shown as over/under in both dollars and
   percent.
4. **A percentage per line**, of its own category's target, which becomes
   that line's estimate when no estimate has been typed — the "allocation
   field that would feed into the estimate unless the estimate is filled
   in itself".

Two of those percentages stack: Drinks is 8% of the wedding ($3,200), and
Alcohol is 80% of Drinks ($2,560). Nothing here replaces a real quote —
the moment a real number exists, it wins (§4).

## 2. Scope

**In:**
- `weddings.total_budget` — one nullable integer, minor units, NZD (spec
  18 removed every other currency). Editable inline at the top of
  `/budget`.
- `budget_categories.allocation_pct` — this category's target share of
  `total_budget`, as a percentage. Nullable: a category with no percentage
  behaves exactly as it does today.
- `budget_items.allocation_pct` — this line's target share of **its
  category's target amount**, as a percentage. Also nullable.
- The derived-estimate rule (§4): a line with an allocation but no typed
  `estimated` uses its allocation as its estimate, everywhere an estimate
  is used today — including as the last rung of `computed_current`'s
  existing `contracted → quoted → estimated` ladder for a flat line.
- A per-category rollup (§5): target amount, current total, over/under in
  dollars and as a percentage, and what share of the overall budget that
  category is *actually* taking.
- A wedding-level rollup: total allocated (as a percentage and an amount),
  what's left unallocated, and total current spend-or-forecast against
  `total_budget`.
- A starter set of typical percentages the planner can apply in one click
  to categories that don't have one yet (§8) — the direct answer to "I'm
  seeing lots of content about what % of budget to spend on different
  things".

**Out, explicitly:**
- **No enforcement anywhere.** Percentages that sum to 103% save fine and
  show a warning; a line over its allocation saves fine and shows a
  variance. Same "warn, don't hard-block" posture spec 5 Part B takes for
  schedule conflicts and spec 6 §5 took for a failed FX lookup.
- **No auto-rebalancing.** Changing Venue from 12% to 15% does not take 3%
  off anything else. The remainder shows up in the "unallocated" figure
  and that's the whole feedback mechanism.
- **No history.** Allocations are current-state columns; there's no record
  of what a category's percentage was last month, and no "you've moved
  this three times" surface. If that turns out to matter it's a later,
  separate thing.
- **No allocation on payments.** A payment is money that moved; the
  allocation model lives entirely on the plan side (estimate/target), same
  split spec 18 drew for GST.
- **No per-event allocations.** A line's `event_id` still scopes its live
  guest counts (spec 6 §3) and nothing else; there is no "the rehearsal
  dinner gets 10% of the budget" grain.
- **No change to `estimated`/`quoted`/`contracted` as stored values.**
  The allocation never writes into them, and they are never recomputed —
  spec 6 §3's "each is its own snapshot" rule holds unchanged. The
  allocation is a *fallback that's computed on read*, not a default that
  gets written on save. This matters: it means changing the overall budget
  updates every derived estimate at once, and clearing a typed estimate
  falls straight back to the allocation with nothing stale left behind.

## 3. Data model

```
weddings            total_budget     integer null check (total_budget is null
                                     or total_budget >= 0)
                    -- minor units (cents), NZD. The first money column on
                    -- weddings; null means "no overall budget set", which is
                    -- how every existing row starts and is a first-class
                    -- state (§4: every derived figure is null without it).

budget_categories   allocation_pct   numeric(5,2) null
                                     check (allocation_pct is null or
                                            (allocation_pct >= 0 and
                                             allocation_pct <= 100))
                    -- percent of weddings.total_budget. 12.50 is legal;
                    -- 120 is not.

budget_items        allocation_pct   numeric(5,2) null
                                     check (allocation_pct is null or
                                            (allocation_pct >= 0 and
                                             allocation_pct <= 100))
                    -- percent of THIS ITEM'S CATEGORY's target amount, not
                    -- of the overall budget. 80% of Drinks, not 80% of the
                    -- wedding.
```

No new tables, so no change to the RLS `tenant_tables` array — three
columns on three tables that are already tenant-scoped and already
policed. `numeric` rather than integer because "12.5%" is a thing a
planner will type; `numeric(5,2)` rather than a float for the same
no-float-rounding reason every money column is an integer.

**Views.** All three are `security_invoker = true`, matching every
existing budget view.

- **`v_budget_items`** gains four columns:
  - `allocation_pct` — passed through from the table.
  - `allocated_amount` — this line's target in minor units:
    `round(round(total_budget × category.allocation_pct / 100) ×
    item.allocation_pct / 100)`. **Null** if any of the three inputs is
    null. Rounded at both steps, in minor units, so it's always a whole
    number of cents.
  - `effective_estimated` — `coalesce(estimated, allocation_estimate)`,
    where `allocation_estimate` is `allocated_amount` adjusted for GST per
    §4. This is the number the rest of the app should read wherever it
    reads an estimate.
  - `estimate_source` — `'entered' | 'allocation' | 'none'`, so a screen
    can mark a figure the planner never typed without re-deriving the
    reason. Plain text, not an enum type: it's a view-only discriminant,
    same as `v_budget_item_tasks.linked_via_list`.

  and changes one: `computed_current`'s `flat` branch becomes
  `coalesce(contracted, quoted, effective_estimated)` in place of
  `coalesce(contracted, quoted, estimated)`. Every other basis is
  untouched — a `per_adult` line's current figure is still `unit_price ×
  live count`, and an allocation on it is a comparison target only (§4).
  The GST wrapper spec 18 added stays exactly where it is, outermost.

- **`v_budget_category_totals`** (new) — one row per category:
  `wedding_id`, `category_id`, `name`, `sort_order`, `allocation_pct`,
  `allocated_amount` (`round(total_budget × allocation_pct / 100)`, null
  without both), `total_estimated` (summing `effective_estimated`),
  `total_current`, `total_paid`, `total_outstanding`, `variance_amount`
  (`total_current - allocated_amount`), `variance_pct` (`variance_amount /
  allocated_amount × 100`, null when the target is null or zero),
  `share_of_budget_pct` (`total_current / total_budget × 100` — what this
  category is *actually* taking, against the `allocation_pct` it was
  *meant* to take), `item_count`, and `allocation_only_count` (lines whose
  `estimate_source = 'allocation'`, which is what tells the planner how
  much of `total_current` is still a guess — see §9 question 1).

- **`v_budget_summary`** gains `total_budget`, `total_allocated_pct` (sum
  of the categories' percentages), `total_allocated_amount` (sum of their
  target amounts), `unallocated_amount` (`total_budget -
  total_allocated_amount` — computed from the amounts, not the
  percentages, so rounding remainders land here rather than silently
  disappearing), `total_current` (which it doesn't currently expose at
  all), and `budget_variance` (`total_current - total_budget`). Its
  existing columns and their names are unchanged, so every current caller
  keeps working.

**Migration: `supabase/migrations/0020_budget_allocations.sql`.** Append-only,
per `docs/HANDOFF.md` §8. `v_budget_summary` and `v_budget_items` are
**dropped and recreated in that order** (dependency order), not
`CREATE OR REPLACE VIEW`'d — the same thing `0019` and `0017` did, for the
same reason: Postgres won't let a replace rename or reorder an output
column, and doing it by drop-and-recreate is the pattern this repo has
already got working twice. `v_budget_category_totals` is created after
both, `revoke all … from anon` / `grant select … to authenticated` like
every other view here.

## 4. The core rule: how an allocation becomes an estimate

The planner's sentence — *"an allocation field that would feed into the
estimate unless the estimate is filled in itself"* — is the whole
mechanic, and it's worth being exact about, because it decides what three
other numbers do.

**Precedence, per line:**

| State | `effective_estimated` | `estimate_source` |
| --- | --- | --- |
| `estimated` typed | the typed figure | `entered` |
| No `estimated`, allocation resolvable | the allocation-derived figure | `allocation` |
| Neither | null | `none` |

"Allocation resolvable" means all three of `weddings.total_budget`, the
category's `allocation_pct`, and the line's `allocation_pct` are non-null.
Miss any one and the line behaves exactly as it does today — this is why
the feature is safely additive to a wedding that never sets a budget.

**Four consequences, stated so nothing is inferred:**

1. **A typed estimate always wins, and clearing it falls back.** There's
   no third state where a line is "detached" from its allocation. Emptying
   the estimate field on `/budget` returns that line to its allocation
   figure on the next render, because the fallback is computed on read and
   the allocation was never copied anywhere.
2. **The derived estimate reaches `computed_current` only through the flat
   basis.** For `per_adult`, `per_child`, `per_seat`, `manual` and
   `consumption`, `computed_current` is recomputed from the unit price,
   quantity, or component rows and has never consulted `estimated` at all
   — that doesn't change. This is exactly right for the planner's own
   drinks example: "Alcohol, 80% of Drinks" is most naturally a
   consumption line (spec 6 §3), where the allocation is the **target the
   calculator's answer gets compared against**, not an input to it. Seeing
   "$2,560 allocated, $3,100 calculated, 21% over" on that line is the
   point of the feature.
3. **A line can carry both a real number and an allocation**, and should.
   Once a quote lands, `quoted` (or `contracted`) wins for
   `computed_current` under the existing ladder, the allocation stays put,
   and the line keeps showing its target-versus-actual. Allocations aren't
   scaffolding to be deleted once real numbers arrive.
4. **The overall budget is the only thing that moves everything.** Change
   `total_budget` from $40,000 to $45,000 and every category target, every
   derived estimate, and every variance moves on the next read. Nothing
   needs recomputing or backfilling, because nothing was stored.

**GST (spec 18).** An overall budget is a number out of a bank account, so
it's a GST-inclusive figure: when you say "$40,000", you mean $40,000
leaves your account. A GST-**exclusive** line grosses up by 15% inside
`computed_current`, so a naively derived estimate would land the line 15%
over its own allocation the moment it was created — the feature would look
broken on exactly the lines it was working correctly on. So:

```
allocation_estimate = allocated_amount                      when inclusive
allocation_estimate = round(allocated_amount / 1.15)        when exclusive
```

which makes the line's `computed_current` land **on** its allocation
either way. This is §9 question 4, and it's the one piece of this spec
that's a genuine judgement call rather than a mechanical consequence.

**Rounding.** Every derived figure rounds to whole minor units at each
step (category target first, then the line's share of it), so a category's
line allocations can be a cent or two off its own target. That difference
shows in the category's own "allocated vs. allocated-to-lines" figure and
is not worth engineering away — the same remainder logic is why
`unallocated_amount` is computed from amounts rather than percentages.

## 5. What "over or under as a %" means, exactly

The ask has two readings and they're different numbers, so `/budget` shows
both per category (§9 question 2):

Worked example — overall budget **$40,000**, Venue allocated **12%**
(= $4,800), Venue's lines currently totalling **$5,100**:

| Figure | Value | Reads as |
| --- | --- | --- |
| `allocated_amount` | $4,800 | "12% of $40,000" |
| `total_current` | $5,100 | spec 6's existing per-line "best number we have", summed |
| `variance_amount` | +$300 | over by $300 |
| `variance_pct` | +6.25% | over its own allocation by 6.25% |
| `share_of_budget_pct` | 12.75% | is actually taking 12.75% of the wedding, against 12% planned |

`total_current` is deliberately spec 6's existing `computed_current` per
line — contracted beats quoted beats estimated, per-unit and consumption
lines recompute live, GST applied — so the rollup means the same thing as
the numbers already on the page, and "estimates or quotes or actual spend,
etc." is handled by a ladder that already exists rather than a second one.
`total_paid` and `total_outstanding` sit alongside it for the "actual
spend" half of that sentence.

At wedding level the same three figures appear against `total_budget`
itself, plus **allocated 97% · $1,200 unallocated**, which is the number
that tells the planner their percentages don't add up yet — the gentlest
possible version of the "must sum to 100" rule this spec deliberately
doesn't enforce (§2, §9 question 3).

## 6. Screens

| Route | What's new |
| --- | --- |
| `/budget` | **A budget header block**, above the existing five summary figures: the overall budget (inline-editable, empty state "Set an overall budget to allocate by percentage"), total allocated as % and $, unallocated $, and current total vs. budget with its over/under. The existing Estimated/Quoted/Contracted/Paid/Outstanding row stays as-is beneath it. |
| `/budget` | **Per category header** (`category-header.tsx`): a small `%` input beside the name, showing the target amount live as you type ("12% · $4,800"), then the rollup — current, variance in $ and %, and actual share — with a thin bar making over/under visible at a glance. A category with no percentage shows a muted "Set %" affordance and nothing else, so an un-allocated wedding's page looks like it does today. |
| `/budget` | **Per line** (`budget-item-fields.tsx`, `budget-item-row.tsx`): an "Allocation %" field next to the estimate, with a live hint under it — "10% of Drinks ($3,200) = $320" — and, when the estimate field is empty, the estimate showing that derived figure greyed with an "from allocation" marker rather than blank. The row shows target vs. current and its variance the same way the category header does. When the category has no percentage or the wedding has no overall budget, the field is still editable but the hint reads "Set a % on Drinks to turn this into an amount" — allocations entered in any order eventually resolve. |
| `/budget` | **"Suggest percentages"** (§8) in the header block, when at least one category has no allocation yet. |
| `/` (dashboard) | The existing Budget tile gains one line: overall budget vs. current total, with the same over/under colouring the Outstanding figure already uses. No new query — it already reads `v_budget_summary`. |
| `/guests/rank` | Unchanged. Its per-seat figure reads `computed_current` (spec 18 §6) and picks up allocation-derived estimates on flat lines for free. |

No new route. `/budget` is still one page, per spec 6 §4's decision
against a detail route.

## 7. Server actions & queries

`src/server/actions/budget.ts`:
- `setTotalBudget(amountMinor: number | null)` — its own action rather
  than a field on `updateWeddingSettings`, because that action's zod
  schema validates the whole settings form at once (name, timezone and
  reminder window all required) and can't take a partial write from
  another screen. This is the same reasoning `settings.ts`'s own header
  comment gives for `setCapacity` / `setCutLine` living in `rank.ts`.
- `setCategoryAllocation(categoryId: string, pct: number | null)`.
- `createBudgetItem` / `updateBudgetItem` gain `allocation_pct` as an
  ordinary validated optional field (`z.coerce.number().min(0).max(100)`,
  nullable), next to spec 18's `gst_treatment`.

`src/server/queries/budget.ts`:
- `listBudgetCategoryTotals(weddingId)` — reads
  `v_budget_category_totals`, one call, joined to the existing category
  list on the page by id.
- `listBudgetItems` and `getBudgetSummary` need no change: they
  `select("*")` from views that now carry the new columns. Their return
  types in `src/lib/types/database.ts` grow the new fields.
- `getPerSeatCostInvited` passes each item's `allocated_amount` into
  `computeCurrent` alongside `gst_treatment`, so the standing per-seat
  figure on `/guests/rank` uses the same fallback the view does.

`src/lib/budget.ts` (pure, unit-tested, per `docs/HANDOFF.md` §8 — no new
module; this is the budget-math file and it's still under 150 lines):
- `pctOf(amountMinor, pct)` → `Math.round(amountMinor * pct / 100)`.
- `categoryTarget(totalBudget, categoryPct)` and
  `itemAllocation(categoryTarget, itemPct)` — both null-propagating,
  because "no budget set" is the common case, not an error.
- `allocationEstimate(allocatedAmount, gstTreatment)` — the ÷1.15 of §4.
- `effectiveEstimated(item)` and `estimateSource(item)`.
- `variance(current, allocated)` → `{ amount, pct }`, null-safe.
- `BudgetItemInput` gains `allocatedAmount?: number | null`, consulted by
  `computeCurrent`'s `flat` branch only. Every existing caller keeps
  working unchanged, since it's optional and absent means today's
  behaviour.

These duplicate the view's SQL deliberately, the same way `computeCurrent`
already duplicates `v_budget_items` — the item editor needs a live preview
while typing without a round trip, and if the two ever disagree, either
`budget.test.ts` or `supabase/tests/03_budget.sql` fails.

## 8. Starter percentages

"I'm seeing lots of content about what % of budget to spend on different
things" is half the ask, and a blank percentage field answers none of it.

Proposal: a static, hardcoded list in `src/lib/budget-allocations.ts` —
category name, suggested percentage, one-line rationale — and a "Suggest
percentages" control that fills in **only categories that currently have
none**, matching on name (case-insensitive), leaving everything else
untouched and everything editable afterwards. Roughly the shape the
industry consensus takes:

| Category | Suggested |
| --- | --- |
| Venue & hire | 20% |
| Catering | 20% |
| Drinks | 10% |
| Photography & video | 12% |
| Attire & beauty | 8% |
| Flowers & styling | 8% |
| Music & entertainment | 7% |
| Stationery & website | 3% |
| Rings | 3% |
| Celebrant & licence | 2% |
| Transport & accommodation | 3% |
| Cake & extras | 2% |
| Contingency | 2% |

**These numbers need the planner's sign-off before they ship** (§9
question 6). They're a reasonable composite of what wedding-industry
budget breakdowns publish, but this session has no live source to cite,
NZ-specific splits differ from the US ones most of that content assumes,
and a suggested percentage that's confidently wrong is worse than a blank
field — it's a number the planner will anchor on. Treat the table as a
placeholder to correct, not a finding.

Alternative, if that's not wanted: drop §8 entirely and ship the rest.
Nothing else in this spec depends on it.

## 9. Open questions

**All six were answered on 2026-09-20 — see §12.** They're left here as
originally written, rather than rewritten into statements, so the
reasoning behind each answer stays legible next to the answer itself.

These were the decisions only the planner could make; questions 1 and 4
change what the headline number means, so they blocked the migration too,
not just the screens.

1. **Should an allocation-derived estimate count toward a category's
   current total, and so toward its over/under?**
   *Recommend yes*, with `allocation_only_count` shown ("4 of 7 lines
   still using their allocation") so the number is never mistaken for
   firm. The whole point is seeing the plan's shape before any quotes
   exist; excluded, every category reads wildly "under" for the first six
   months and the feature says nothing until it's too late to act on.
   Answering "no" means `total_current` counts only typed/real figures and
   the derived estimate is a per-line planning number only — a smaller,
   more conservative feature, and a one-line change to the view.

2. **"Over or under as a %" — of the allocation, or as a share of the
   overall budget?** *Recommend both* (§5): +6.25% over its own
   allocation, and taking 12.75% against 12% planned. They answer
   different questions and both are cheap once the rollup view exists. If
   only one, the first is the more actionable.

3. **Percentages that don't sum to 100 — warn only?** *Recommend yes,
   warn only*, via the "allocated 97% · $1,200 unallocated" figure and
   nothing more. Blocking a save because a work-in-progress adds to 103%
   would be the most annoying possible version of this feature.

4. **Is the overall budget a GST-inclusive figure, and should an exclusive
   line's derived estimate be divided by 1.15 so it lands on its
   allocation?** *Recommend yes to both* (§4). Answering "no" is
   defensible if the budget is thought of as a pre-GST planning number,
   but then every GST-exclusive line reads 15% over target by
   construction, and that needs saying on screen.

5. **Category target entry: percentage only, or also a dollar amount that
   back-computes the percentage?** *Recommend percentage only for now* —
   the target amount is shown live as you type, so the dollar figure is
   never hidden, and one stored representation means changing the overall
   budget moves everything coherently. "Type $5,000 and we'll store the
   equivalent %" is a nice later addition, and is genuinely ambiguous
   about what should happen when the overall budget then changes.

6. **The starter percentages (§8): in or out, and are those numbers
   right?** *Recommend in*, with the planner correcting the table first.
   It's the part of the ask ("no clue what we should be allocating") that
   the mechanism alone doesn't answer.

## 10. Build order

Assumes the questions above are answered; steps 4–6 are separately
shippable, so the feature is useful before all of it exists.

1. `0020_budget_allocations.sql` — the three columns, `v_budget_items` and
   `v_budget_summary` dropped and recreated, `v_budget_category_totals`
   created.
2. `src/lib/budget.ts` — `pctOf`, `categoryTarget`, `itemAllocation`,
   `allocationEstimate`, `effectiveEstimated`, `estimateSource`,
   `variance`, and `computeCurrent`'s new optional input, with unit tests
   for each (§11).
3. `setTotalBudget`, `setCategoryAllocation`, `allocation_pct` on the two
   item actions; `listBudgetCategoryTotals`; the `database.ts` type
   additions.
4. `/budget`'s budget header block — overall budget, allocated,
   unallocated, current vs. budget. Useful alone: it answers "are we over
   in total" before any category has a percentage.
5. Category allocations: the `%` input on the category header and the
   rollup row beneath it.
6. Line allocations: the "Allocation %" field, the live derived-estimate
   hint, the greyed derived estimate with its marker, and the per-line
   variance.
7. The dashboard tile line.
8. Starter percentages (§8), if question 6 says so.
9. Full check pass per §11.

## 11. Test plan

- **Unit (`src/lib/budget.test.ts`)**: `pctOf` rounding at half-cent
  boundaries; `categoryTarget` / `itemAllocation` null-propagation with
  each of the three inputs missing in turn; the planner's own worked
  example end to end ($40,000 → Drinks 8% → $3,200 → alcohol 80% /
  non-alcohol 10% / glassware 10% → $2,560 / $320 / $320, summing back to
  $3,200); `allocationEstimate` at both GST treatments, asserting that an
  exclusive line's `computeCurrent` lands **on** its allocation and not
  15% above it; `effectiveEstimated` / `estimateSource` across all three
  states of §4's table; `computeCurrent` with an `allocatedAmount` on a
  `flat` line with and without a typed estimate, and on a `per_adult` and
  a `consumption` line confirming the allocation does **not** change their
  figure; `variance` for over, under, exactly on target, and a null
  allocation.
- **SQL (`supabase/tests/03_budget.sql`)**: a seeded wedding with
  `total_budget = 4000000`, two allocated categories and one unallocated
  one, asserting `v_budget_items.allocated_amount` /
  `effective_estimated` / `estimate_source` per line; every
  `v_budget_category_totals` column against hand-computed numbers,
  including `variance_pct` and `share_of_budget_pct`; the new
  `v_budget_summary` columns including `unallocated_amount` with a
  deliberate rounding remainder; and the null cases (no overall budget, no
  category percentage) confirming every derived column is null and
  `computed_current` is unchanged from its pre-allocation value.
- `npm run typecheck`, `npm test`, `./scripts/verify-migrations.sh` (as a
  non-root user — `initdb` refuses to run as root), `npm run build`.
- **Browser pass** (never yet possible in this project — see
  `docs/HANDOFF.md`): set an overall budget, confirm the header figures;
  allocate two categories and confirm the unallocated figure and the
  over-100% warning; add a line with an allocation and no estimate,
  confirm the estimate shows derived and marked, and that the category
  rollup moves; type a real estimate over it, confirm it wins; clear it,
  confirm the allocation comes back; flip that line to GST exclusive and
  confirm its current figure still lands on its allocation; change the
  overall budget and confirm every target, estimate and variance moves
  with it; delete a category's percentage and confirm its lines degrade to
  today's behaviour rather than to zeroes.

## 12. Answered (2026-09-20)

The planner's answer to §9 was *"go with recommended for all."* Each
decision below is therefore the recommendation as §9 stated it, recorded
here as settled.

Because every recommendation was the one this spec's body was already
written around, **§2 through §8 need no changes** — the data model, the
precedence rule, the rollup columns and the screens all already describe
the decided behaviour. This section is the record of the decision, not a
correction to the body.

1. **An allocation-derived estimate counts toward its category's current
   total, and so toward the over/under.** `v_budget_items.effective_estimated`
   feeds `computed_current`'s flat branch (§4), and
   `v_budget_category_totals.total_current` sums it like any other figure.
   `allocation_only_count` is shipped alongside it and shown on screen
   ("4 of 7 lines still using their allocation"), so a forecast is never
   mistaken for a firm number. This is the version that shows the plan's
   shape before any quotes exist.
2. **Over/under is shown both ways**, per category: `variance_pct`
   (against that category's own allocation) and `share_of_budget_pct`
   (what it's actually taking, against the percentage it was meant to
   take). §5's worked example is the reference — +6.25% over, and 12.75%
   against 12% planned.
3. **Percentages are never enforced.** Sums over or under 100% save
   normally; the only feedback is the wedding-level "allocated 97% ·
   $1,200 unallocated" figure. No save is ever blocked by an allocation —
   same warn-don't-block posture as spec 5 Part B and spec 6 §5.
4. **The overall budget is a GST-inclusive figure, and a GST-exclusive
   line's derived estimate divides by 1.15** so the line's
   `computed_current` lands exactly on its allocation rather than 15%
   above it (§4's `allocation_estimate` formula). Nothing else about spec
   18's GST handling changes.
5. **Category targets are entered as a percentage only**, with the dollar
   amount shown live as it's typed. No dollar-amount entry that
   back-computes a percentage — a single stored representation is what
   makes changing the overall budget move every target coherently. The
   reverse entry mode stays a possible later addition.
6. **The starter percentages (§8) are in**, as a static list in
   `src/lib/budget-allocations.ts` applied only to categories with no
   percentage yet, via a "Suggest percentages" control on `/budget`.
   **The numbers in §8's table are still a placeholder.** The
   recommendation this answer accepted was "in, with the planner
   correcting the table first," and that correction hasn't happened yet:
   this session had no live source to cite, and NZ splits differ from the
   US breakdowns most of that content assumes. Build steps 1–7 don't
   depend on it; build step 8 should not ship the table unreviewed.

**What this does not authorize.** Per `CLAUDE.md`, these answers are
content for this spec, not a green light to write code. The build order
in §10 stands ready, and nothing in it starts until the planner says to
build it.

## 13. Build status (2026-09-20)

Built in §10's order, in one session, immediately after §12's answers.

**Schema** — `supabase/migrations/0020_budget_allocations.sql`: three
nullable columns (`weddings.total_budget`, `budget_categories.allocation_pct`,
`budget_items.allocation_pct`), `v_budget_items` and `v_budget_summary`
dropped and recreated, and the new `v_budget_category_totals`. No new
tables, so the RLS `tenant_tables` array is untouched. Append-only: nothing
already landed was edited.

**Pure logic** — `src/lib/budget.ts` gained `pctOf`, `categoryTarget`,
`itemAllocation`, `allocationEstimate`, `effectiveEstimated`,
`estimateSource` and `variance`, plus an optional `allocatedAmount` on
`BudgetItemInput` that `computeCurrent` consults in its `flat` branch only.
`src/lib/budget-allocations.ts` holds §8's starter table and its matcher.

**Server** — `setTotalBudget`, `setCategoryAllocation` and
`applySuggestedAllocations` in `src/server/actions/budget.ts` (the first is
its own action for the reason §7 gives: `updateWeddingSettings` validates
the whole settings form and can't take a partial write);
`allocation_pct` added to the item create/patch schema;
`listBudgetCategoryTotals` in `src/server/queries/budget.ts`.

**Screens** — a new `BudgetHeader` (overall budget, allocated, unallocated,
current vs. budget, "Suggest percentages"); `CategoryHeader` gained the `%`
input and the rollup bar with both variance readings and the
"n of m lines still using their allocation" note; `BudgetItemFields` gained
the allocation field and its live hint; `BudgetItemRow` gained an
"Allocated" figure, the greyed "from allocation" estimate, and the
per-line variance; the dashboard's Budget tile gained an "Against budget"
stat that only appears once an overall budget exists.

**One correction to this spec.** §4 and §12 decision 4 said a GST-exclusive
line's derived estimate "lands **on** its allocation". In integer minor
units it lands *within a cent*: ÷1.15 then ×1.15 doesn't always round-trip
(an allocation of $1,000.00 derives an estimate of $869.57, which grosses
back up to $1,000.01). The behaviour is right and the discrepancy is one
cent at most; `src/lib/budget.ts` and the migration both say so where it
matters, and `budget.test.ts` asserts the bound rather than pretending to
exactness.

**Verification actually run this session:** `npm run typecheck` (clean),
`npm test` (473 tests, up from 437 — 36 new across `budget.test.ts` and the
new `budget-allocations.test.ts`), `./scripts/verify-migrations.sh` (250
SQL assertions, up from 211 — `03_budget.sql` gained a section 5 covering
the two-step percentage, the derived estimate and its GST divide, the
allocation deliberately *not* feeding a `per_adult` line, both variance
readings against §5's worked example, every null path, and removing the
overall budget degrading every line to its pre-spec-19 behaviour), and
`npm run build` (clean, all 30 routes).

**Not verified, same caveat as every session since 12:** none of this has
run against a live Supabase project, and nothing has been opened in a
browser. §11's browser pass is still outstanding in full.
