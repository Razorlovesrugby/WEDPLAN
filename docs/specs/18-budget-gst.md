# Feature spec: Budget — NZD only, and a GST inclusive/exclusive toggle

**Status: built end to end, session 22 (2026-09-18).** Two changes,
decided directly by the planner in the same conversation this spec was
first drafted in, and built the same session. Part A removes spec 6's
whole multi-currency/FX mechanism — every wedding is NZD only now, full
stop. Part B is the GST toggle originally asked for: a plain tick-box per
line, inclusive or exclusive, with a hardcoded 15% uplift when exclusive.
Part A exists because Part B's first draft raised a question (does GST
apply before or after FX conversion?) that the planner resolved by
removing FX entirely rather than answering it.

**Depends on:** Spec 6 / 6.1 (budget), already built. Supersedes spec 6
§3's `fx_rate`/`currency`/`fx_rates` mechanism and §5's `getFxRate` — those
sections describe what spec 6 built at the time and are left as the
historical record; this spec is what to read for how budget money handling
actually works now.

## 1. What changed, and why

The first draft of this spec proposed only a GST toggle, layered on top of
spec 6's already-built FX conversion — and raised, as an open question,
whether GST should gross up before or after a foreign-currency line
converts to `base_currency`. The planner's answer skipped the question
entirely: *"Can we please remove foreign currency as a concept generally?
Everything's just going to be NZD. Just don't worry about conversions...
GST is just a tick box, include, exclude. If it's exclude, then add 15%
hardcoded on top."*

That collapses two specs into one. **Part A** deletes spec 6's FX
mechanism — `budget_items.currency`/`fx_rate`, `payments.currency`/
`fx_rate`, the `fx_rates` cache table, `getFxRate`'s live lookup against
`api.frankfurter.app` (this app's only outbound third-party API call
outside email) — because it now serves no purpose: every wedding budgets
in NZD, so there is nothing to convert. **Part B** is the GST toggle as
originally asked, simplified by Part A's removal: no ordering question,
because there is no second currency operation to order it against.

## 2. Part A — NZD only, removing FX

**In:**
- Drop `weddings.base_currency`, `budget_items.currency`,
  `budget_items.fx_rate`, `payments.currency`, `payments.fx_rate`, and the
  `fx_rates` table entirely.
- Delete `src/lib/fx.ts` (the pure conversion math and `resolveFxRate`'s
  cache/live/stale/manual ladder), `src/lib/fx.test.ts`, and
  `src/server/queries/fx.ts` (`getFxRate`, the live lookup + cache-write).
- `formatMoney()` (`src/lib/format.ts`) drops its `currency` parameter —
  every amount is NZD, formatted with `Intl.NumberFormat("en-NZ", {
  style: "currency", currency: "NZD" })`.
- Every budget screen and component that showed a currency picker, an FX
  rate, or a "rate not available, enter manually" state loses that UI —
  there is nothing left to pick or override.

**Out:**
- No migration path for a wedding that was actually using a foreign
  currency — there has never been a live project, so there is no real data
  to migrate (see `docs/HANDOFF.md`). The dropped columns are gone, not
  deprecated.
- No reintroduction of a currency concept anywhere else in the schema
  (`weddings.base_currency` was FX-only; nothing else read it).

## 3. Part B — the GST toggle

**In:**
- New column on `budget_items`: `gst_treatment`, enum
  (`inclusive` | `exclusive`), **default `inclusive`** — every existing row
  keeps its current total exactly as-is the moment this ships; a planner
  only sees a number change once they explicitly flip a line to exclusive.
- A `GST_RATE` constant (`0.15`, hardcoded — not a per-wedding or per-line
  setting) and an `applyGst` helper in `src/lib/budget.ts`, unit-tested the
  same "pure computation" way every other piece of budget math in that
  file already is.
- `computeCurrent` (and `v_budget_items.computed_current`) gross up by
  ×1.15 when `gst_treatment = 'exclusive'`, applied to the basis's total —
  flat, per_adult, per_child, per_seat, manual, and the summed consumption
  total alike, all six, one rule, one toggle per line (not per field, not
  per component).
- The item editor (`budget-item-fields.tsx`) gets a GST select: "GST
  inclusive" / "GST exclusive (+15%)".
- The item row shows a "GST exclusive (+15%)" note next to the basis label
  when set, so an exclusive line's total isn't a mystery next to what was
  typed.
- `v_budget_summary`'s totals and `/guests/rank`'s per-head figure pick
  this up for free — both already sum `computed_current`, and GST uplift
  happens inside `computed_current` itself, one layer upstream of
  everything that reads it.

**Out:**
- No per-payment GST field. A `payments` row already records the real
  amount that changed hands — whatever tax the vendor actually charged is
  already baked into that number. GST treatment applies only to the
  estimate/quote/contract/current side of a line, never to a payment.
- `estimated`/`quoted`/`contracted` are **not** rewritten by the toggle —
  they stay exactly what the planner typed, same "each is its own
  snapshot, never recomputed retroactively" rule spec 6 §3 already states
  for basis/unit-price changes. Only the *live* current figure changes how
  it's computed from them.

## 4. Data model

```
budget_items   gst_treatment  budget_gst_treatment not null default 'inclusive'
               -- new enum: 'inclusive' | 'exclusive'
               -- currency, fx_rate: DROPPED (part A)

payments       -- currency, fx_rate: DROPPED (part A)

weddings       -- base_currency: DROPPED (part A)

fx_rates       -- DROPPED entirely (part A)
```

Migration: `supabase/migrations/0019_budget_nzd_and_gst.sql`. `
v_budget_items` and `v_budget_summary` are **dropped and recreated**, not
`CREATE OR REPLACE VIEW`'d — Postgres refuses to let that rename or drop an
output column, and merging `computed_current`/`computed_current_base` into
one `computed_current` (there being only one currency left) is exactly
that; same issue `0017_budget_section_links.sql` hit for
`v_budget_item_tasks` and solved the same way. `computed_current`'s CASE
expression is unchanged except for one added wrapper:
`round(<existing per-basis total> * case when gst_treatment = 'exclusive'
then 1.15 else 1 end)`. The `_base` suffix retires everywhere — `paid` and
`outstanding` are just the numbers now.

## 5. Screens

| Route | What's new |
| --- | --- |
| `/budget` | Item editor: a GST select in place of the old currency input. An exclusive line's row shows "GST exclusive (+15%)" next to its basis. No more currency picker, FX rate display, or manual-override control anywhere on the page. |
| `/` (dashboard), `/guests/rank` | No new UI — both already read `v_budget_summary` / `computed_current`, so the 15% uplift is folded into every total and per-head figure they show; `formatMoney` calls across both pages drop their now-gone `currency` argument. |

## 6. Server actions & queries

`src/server/actions/budget.ts`: `createBudgetItem` / `updateBudgetItem`
gain `gst_treatment` as an ordinary validated field (fixed enum); the
`currency` zod schema and `resolveFxRateFor` (which called `getFxRate`) are
removed, along with every `fx_rate` snapshot-on-write branch in both
budget item and payment actions.

`src/server/queries/budget.ts`: `getPerSeatCostInvited` drops its
`convertAmount(current, item.fx_rate)` call (there is nothing left to
convert) and passes the item's `gst_treatment` into `computeCurrent`
instead, so the standing per-seat figure on `/guests/rank` grosses up
exclusive lines exactly like every other total does.

No new query file for either part — `listBudgetItems` / `getBudgetSummary`
already read `v_budget_items` / `v_budget_summary`, which carry both
changes once the views changed.

## 7. Decided (2026-09-18)

Everything below was an open question in this spec's first draft; the
planner's message resolved all of them at once.

1. **GST applies only to the live current figure, not the stored
   snapshots.** `estimated`/`quoted`/`contracted` stay exactly as typed;
   only `computed_current` (and everything derived from it) grosses up.
2. **One toggle per line**, matching how `currency` used to be one-per-line
   before Part A removed it — not per-field, not per-component.
3. **Hardcoded 15%, not configurable.** `GST_RATE` is a constant in
   `src/lib/budget.ts`, not a database column.
4. **No FX-vs-GST ordering question** — Part A removed FX, so there is
   nothing to order GST against.
5. **Consumption-mode lines gross up once, on the summed total** — same
   "one toggle per line" reasoning as decision 2; `consumption_components.
   price_per_serving` is untouched.
6. **Every existing row defaults to `gst_treatment = 'inclusive'`** on
   migration, so no wedding's current totals change the moment this ships.

## 8. Test plan

- Unit (`src/lib/budget.test.ts`): `applyGst` at both treatments;
  `computeCurrent` with `gstTreatment: "exclusive"` across all six bases
  (flat, each per-unit basis, manual, consumption), confirming a 15%
  uplift on top of the existing basis math and no change at all when
  `"inclusive"` or omitted (the default).
- SQL (`supabase/tests/03_budget.sql`): the fixture set now includes a
  GST-exclusive flat item (Photographer, contracted 100000 → 115000) and a
  GST-exclusive `per_adult` item (DJ, 4000 × 10 adults = 40000 → 46000, to
  prove the uplift isn't flat-basis-specific), with every
  `computed_current`/`outstanding`/`v_budget_summary` total and per-head
  figure in the file recalculated and asserted against the new numbers.
  The old non-base-currency USD fixture is gone along with every
  `currency`/`fx_rate` column from every insert in the file.
- Browser pass: add a line, confirm it defaults to "GST inclusive" with no
  visible change to its total; flip it to exclusive, confirm the row's
  total updates live by 15% with no page refresh; confirm the dashboard
  tile, `/budget`'s summary row, and `/guests/rank`'s per-head figure all
  reflect the uplift; confirm no currency picker or FX UI remains anywhere
  on `/budget`.

**Verification actually run this session:** `./scripts/verify-migrations.sh`
(211 SQL assertions, up from 187 before this session — `01_tenancy.sql`
through `07_coach.sql`, all passing against a throwaway PostgreSQL 16
cluster), `npm run typecheck` (clean), `npm test` (437 tests, up from 436:
`fx.test.ts`'s 7 tests removed, 8 new GST cases added), `npm run build`
(clean, static export of all 30 routes). Same live/browser caveat as every
session since 12 — none of this has run against a real Supabase project or
opened in an actual browser.
