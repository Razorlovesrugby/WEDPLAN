# Feature spec: Budget — GST inclusive/exclusive per line

**Status: proposed, not built — no migration, no screen change.** Per
`docs/specs/README.md`, this is a proposal plus a list of decisions only the
planner can make; §6 is that list. Small, additive change to spec 6 / 6.1
(budget management), itself already built.

**Depends on:** Spec 6 / 6.1 (budget), already built. Nothing else.

## 1. What this changes

Every money figure on a `budget_items` row today — `estimated`, `quoted`,
`contracted`, and the live `computed_current` for a per-unit/manual/
consumption line — is one number with no notion of tax. Real vendor quotes
don't arrive consistently: a venue might quote "$4,000 incl GST," a
florist "$800 + GST." Right now the only way to handle the second case is
for the planner to do the 15% maths by hand before typing it in — same
"silent hand-maths that drifts" problem spec 6 itself was built to replace
for FX conversion (§3 of that spec) and for per-head costing.

This adds a per-line toggle — **GST inclusive** (today's implicit
behaviour; nothing about an existing line changes) or **GST exclusive** —
and when a line is exclusive, every total that sums it (the item's own
live current figure, and everything downstream: `v_budget_items`,
`v_budget_summary`, the dashboard tile, the `/guests/rank` per-head figure)
adds 15% on top, live, the same way FX conversion already grosses a
foreign-currency line up to `base_currency` without a separate save step.

## 2. Scope

**In:**
- New column on `budget_items`: `gst_treatment`, enum
  (`inclusive` | `exclusive`), **default `inclusive`** — every existing row
  keeps its current total exactly as-is the moment this ships; a planner
  only sees a number change once they explicitly flip a line to exclusive.
- A `GST_RATE` constant (`0.15`, matching NZ's 15% rate) and an `applyGst`
  helper in `src/lib/budget.ts`, unit-tested the same "pure computation"
  way every other piece of budget math in that file already is.
- `computeCurrent` (and `v_budget_items.computed_current`) gross up by
  ×1.15 when `gst_treatment = 'exclusive'`, applied to the basis's total
  (flat/per_adult/per_child/per_seat/manual/consumption — all six, one
  rule) — see §6 q4 for exactly where this sits relative to FX conversion.
- The item editor (`budget-item-fields.tsx`) gets a GST select next to
  currency: "GST inclusive" / "GST exclusive (+15%)".
- The item row shows the grossed-up figure feeding the totals plus the
  excl-GST number it was computed from, so an exclusive line's total isn't
  a mystery next to what was typed (e.g. "$920 (excl GST: $800)").
- `v_budget_summary`'s totals and `/guests/rank`'s per-head figure pick
  this up for free — both already sum `computed_current_base`, and GST
  uplift happens inside `computed_current` itself, one layer upstream of
  everything that reads it.

**Out:**
- No per-payment GST field. A `payments` row already records the real
  amount that changed hands — whatever tax the vendor actually charged is
  already baked into that number. GST treatment applies only to the
  estimate/quote/contract/current side of a line (§6 q1), never to a
  payment.
- No configurable rate. Hardcoded 15%, not a per-wedding or per-line
  setting — this schema has no locale/country concept anywhere else, and
  adding one just for a tax rate is scope beyond what was asked. See §6
  q3 for the fallback if that turns out to be wrong.
- No change to how FX conversion, per-unit costing, or the consumption
  calculator work otherwise — GST is one more multiplier alongside `fx_rate`
  and the existing basis math, not a redesign of any of it.

## 3. Data model

```
budget_items   gst_treatment  budget_gst_treatment not null default 'inclusive'
               -- new enum: 'inclusive' | 'exclusive'
```

- No new table — one enum, one column, same shape as 6.1's `quantity`
  addition. Migration is the next free number in sequence (this rebase has
  landed duplicate numbers before — e.g. two `0016`s, two `0017`s — see
  `docs/HANDOFF.md`'s note on migration numbering; whatever's free when
  this is built).
- `v_budget_items.computed_current`'s existing CASE expression (per basis)
  gets wrapped once: `round(<existing per-basis total> * case when
  gst_treatment = 'exclusive' then 1.15 else 1 end)`. `computed_current_base`
  is unchanged downstream of that — it's still `computed_current × fx_rate`
  — since the GST uplift already happened inside `computed_current`.
- `src/lib/budget.ts`: `BudgetItemInput` gains `gstTreatment: "inclusive" |
  "exclusive"`; `computeCurrent` applies the new `applyGst(amount,
  treatment)` helper as its last step, mirrored against the SQL view exactly
  like every other basis already is, per that file's own "duplicate the
  view's logic, test against the SQL suite" rule.
- `estimated`/`quoted`/`contracted` themselves are **not** rewritten by this
  — they stay exactly what the planner typed, same "each is its own
  snapshot, never recomputed retroactively" rule spec 6 §3 already states
  for basis/unit-price changes. `gst_treatment` only changes how the *live*
  current figure is computed from them, not what's stored.

## 4. Screens

| Route | What's new |
| --- | --- |
| `/budget` | Item editor: a GST select next to currency. An exclusive line's row shows both numbers — the grossed-up current total (what feeds every summary) and the excl-GST figure underneath in muted text |
| `/` (dashboard), `/guests/rank` | No new UI — both already read `v_budget_summary` / `computed_current_base`, so the 15% uplift is already folded into every total and per-head figure they show |

## 5. Server actions & queries

`src/server/actions/budget.ts`: `createBudgetItem` / `updateBudgetItem`
gain `gst_treatment` as an ordinary field, validated the same way
`quantity_basis` already is (a fixed enum, rejects anything else).

No new query file — `listBudgetItems` / `getBudgetSummary` already read
`v_budget_items` / `v_budget_summary`, which carry the uplift once the view
changes.

## 6. Open questions — need the planner's answers before anything is built

1. **Does GST apply only to the live "current" figure that feeds totals,
   or should the `estimated`/`quoted`/`contracted` snapshots also display
   grossed-up in the table?** Recommendation: only the current figure —
   the three snapshots stay exactly as typed (§3), with a small "+ GST"
   label for context. Grossing up each snapshot for display too is doable,
   but it means three more numbers per row need a live "adjusted" variant
   instead of one, for a table that's already four columns wide.
2. **One toggle per line, or could a single line need different treatment
   on different fields** (e.g. the estimate was excl-GST, but the signed
   contract came back incl)? Recommendation: one toggle per line, matching
   how `currency` is also one-per-line — flip it when the line's own
   answer changes (a quote becoming a contract with different tax
   treatment is the same kind of edit as a currency change already is).
   Per-field toggles would be real complexity for a genuinely rare case.
3. **Hardcode 15%, or make the rate configurable?** Recommendation:
   hardcode it as `GST_RATE` now — matches exactly what was asked, and
   nothing else in this schema has a country/locale concept to hang a
   configurable rate off of. If a different rate is ever needed (a
   UK/EU wedding on VAT, say), that's a small follow-up — a `gst_rate`
   column on `budget_items` or `weddings` defaulting to `0.15` — not a
   redesign of this feature.
4. **GST vs. FX ordering, for a line priced in a foreign currency.**
   Recommendation: gross up by GST first, in the line's own currency, then
   FX-convert the grossed-up figure to `base_currency` — matches how an
   actual invoice works (tax is charged in the vendor's currency, the
   total is what you convert).
5. **Consumption-mode lines: gross up once on the summed total, or per
   component?** Recommendation: once, on the line's summed total — same
   "one toggle per line" reasoning as q2. `consumption_components.
   price_per_serving` stays exactly as entered, same way it's already
   unaffected by the line-level `fx_rate`.
6. **Confirming the default.** Every existing row gets `gst_treatment =
   'inclusive'` on migration, so nothing about a wedding's current totals
   changes the moment this ships. Recommendation: confirm — the
   alternative (leaving it unset/null and forcing a choice on every past
   line) has no real benefit and would silently change historical totals
   for weddings already using the budget.

## 7. Test plan

- Unit (`src/lib/budget.test.ts`): `applyGst` at both treatments; `computeCurrent`
  with `gst_treatment: "exclusive"` across all six bases (flat, each
  per-unit basis, manual, consumption), confirming a 15% uplift on top of
  the existing basis math and no change at all for `"inclusive"`.
- SQL (`supabase/tests/03_budget.sql`): a seeded exclusive-GST line
  asserting `v_budget_items.computed_current` and `computed_current_base`
  both carry the 15% uplift; a second case combining GST-exclusive with a
  non-base-currency line to assert the ordering from §6 q4 (GST applied
  before FX, not after).
- Browser pass: add a line, confirm it defaults to "GST inclusive" with no
  visible change to its total; flip it to exclusive, confirm the row's
  total updates live by 15% with no page refresh and the excl-GST figure
  still shows the originally-typed number; confirm the dashboard tile,
  `/budget`'s summary row, and `/guests/rank`'s per-head figure all reflect
  the uplift.
