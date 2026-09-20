/**
 * Pure per-unit and consumption costing logic for spec 6 (budget management).
 *
 * Duplicates `v_budget_items`'s `computed_current` CASE expression
 * deliberately, the same "duplicate the view's logic, test against the SQL
 * suite" pattern `src/lib/tier.ts` already establishes — a client-side
 * preview while typing (the item editor's live total, the consumption
 * component editor's per-row and summed totals) needs the same answer as the
 * server without a round trip. If the two ever disagree, one of
 * `budget.test.ts` or `supabase/tests/03_budget.sql` fails.
 *
 * Deliberately decoupled from src/lib/types/database.ts, same reasoning as
 * src/lib/reminders/digest.ts's DigestItem — a narrow shape any caller
 * (server query, client preview, test fixture) can build without this module
 * needing to know the database's row types at all.
 */

export type QuantityBasis = "flat" | "per_adult" | "per_child" | "per_seat" | "consumption" | "manual";
export type GuestBasis = "per_adult" | "per_seat";
export type GstTreatment = "inclusive" | "exclusive";
/** Where a line's estimate came from (spec 19 §4) — typed, derived from its allocation, or nowhere yet. */
export type EstimateSource = "entered" | "allocation" | "none";

/** Hardcoded NZ GST rate (spec 18) — not a per-wedding or per-line setting. */
export const GST_RATE = 0.15;

/** Grosses up an amount by GST_RATE when the line is entered excl. GST; a no-op when inclusive. */
export function applyGst(amountMinor: number, treatment: GstTreatment): number {
  return treatment === "exclusive" ? Math.round(amountMinor * (1 + GST_RATE)) : amountMinor;
}

/**
 * Whatever live guest counts a caller has already scoped — to the whole
 * wedding, or (when a budget_items row carries an event_id) to guests
 * invited to that one event, and to RSVP-confirmed or invited-tier
 * households per the rule in supabase/migrations/0010_budget.sql's
 * `budget_guest_population`. This module has no opinion on how a count was
 * scoped; it only consumes the result.
 */
export type GuestCounts = {
  adult: number;
  child: number;
  seat: number;
};

export type ConsumptionComponentInput = {
  guestBasis: GuestBasis;
  /** Servings per guest per hour, e.g. 1.5 glasses of wine per adult per hour. */
  servingsPerGuestPerHour: number;
  durationHours: number;
  /** Minor units (pence/cents). */
  pricePerServing: number;
  /** e.g. 0.1 for a 10% wastage buffer. */
  wastageBufferPct: number;
};

export type BudgetItemInput = {
  quantityBasis: QuantityBasis;
  /** Minor units. Unused (and expected null) for `consumption`. */
  unitPrice: number | null;
  estimated: number | null;
  quoted: number | null;
  contracted: number | null;
  /** Multiplier for `manual` (spec 6.1) — decimals allowed, defaults to 1 when null. Unused for every other basis. */
  quantity?: number | null;
  /** Whether every money figure on this line was entered incl. or excl. GST (spec 18). Defaults to "inclusive" — today's behaviour. */
  gstTreatment?: GstTreatment;
  /**
   * This line's target in minor units (spec 19) — its `allocation_pct` of its
   * category's own target, already resolved by the caller via
   * `categoryTarget` + `itemAllocation`. Null/absent whenever any of the
   * overall budget, the category's percentage, or the line's percentage is
   * missing, which is the common case and not an error. Consulted by
   * `computeCurrent` for the `flat` basis only — see `effectiveEstimated`.
   */
  allocatedAmount?: number | null;
};

// ---------------------------------------------------------------------------
// Allocation (spec 19)
// ---------------------------------------------------------------------------

/**
 * A percentage of an amount, in whole minor units. Rounded at every step
 * (never accumulated as a float), so a category's line allocations can land
 * a cent or two off the category's own target — that remainder is real and
 * shows in the rollup rather than being engineered away.
 */
export function pctOf(amountMinor: number, pct: number): number {
  return Math.round((amountMinor * pct) / 100);
}

/** A category's target: its share of the overall budget. Null-propagating — "no budget set" is a first-class state. */
export function categoryTarget(totalBudget: number | null | undefined, categoryPct: number | null | undefined): number | null {
  if (totalBudget === null || totalBudget === undefined) return null;
  if (categoryPct === null || categoryPct === undefined) return null;
  return pctOf(totalBudget, categoryPct);
}

/** A line's target: its share of its category's target. Same null-propagation. */
export function itemAllocation(target: number | null | undefined, itemPct: number | null | undefined): number | null {
  if (target === null || target === undefined) return null;
  if (itemPct === null || itemPct === undefined) return null;
  return pctOf(target, itemPct);
}

/**
 * The allocation expressed as an *estimate*, which is a pre-GST figure for a
 * line entered excl. GST (spec 19 §12, decision 4): the overall budget is
 * money leaving a bank account, so it is GST-inclusive, and an exclusive
 * line grosses back up by 15% inside `computeCurrent`. Dividing first means
 * the line lands on its allocation instead of 15% above it — to within a
 * cent, since integer minor units can't always round-trip a 15% gross-up.
 */
export function allocationEstimate(
  allocatedAmount: number | null | undefined,
  treatment: GstTreatment = "inclusive",
): number | null {
  if (allocatedAmount === null || allocatedAmount === undefined) return null;
  return treatment === "exclusive" ? Math.round(allocatedAmount / (1 + GST_RATE)) : allocatedAmount;
}

/**
 * "The estimate we're working to": what was typed, else what the allocation
 * implies. A typed estimate always wins, and clearing it falls straight back
 * to the allocation — there is no third, detached state, because nothing is
 * ever written into `estimated` (spec 19 §2, §4).
 */
export function effectiveEstimated(item: BudgetItemInput): number | null {
  return item.estimated ?? allocationEstimate(item.allocatedAmount, item.gstTreatment ?? "inclusive");
}

export function estimateSource(item: BudgetItemInput): EstimateSource {
  if (item.estimated !== null && item.estimated !== undefined) return "entered";
  if (item.allocatedAmount !== null && item.allocatedAmount !== undefined) return "allocation";
  return "none";
}

/**
 * Current against target. `pct` is the over/under against the target itself
 * ("6.25% over its allocation"), null when there's no target to be over —
 * the other reading of "over or under as a %", share of the whole budget,
 * belongs to the category rollup, which knows the budget.
 */
export function variance(current: number, allocated: number | null | undefined): { amount: number; pct: number | null } | null {
  if (allocated === null || allocated === undefined) return null;
  const amount = current - allocated;
  return { amount, pct: allocated > 0 ? Math.round((amount / allocated) * 10000) / 100 : null };
}

function countFor(basis: GuestBasis, counts: GuestCounts): number {
  return basis === "per_adult" ? counts.adult : counts.seat;
}

/** Serving count for one consumption component, rounded up — you can't buy a fractional serving. */
export function componentServings(component: ConsumptionComponentInput, counts: GuestCounts): number {
  const count = countFor(component.guestBasis, counts);
  return Math.ceil(
    component.servingsPerGuestPerHour * component.durationHours * count * (1 + component.wastageBufferPct),
  );
}

export function componentTotal(component: ConsumptionComponentInput, counts: GuestCounts): number {
  return componentServings(component, counts) * component.pricePerServing;
}

export function consumptionTotal(components: ConsumptionComponentInput[], counts: GuestCounts): number {
  return components.reduce((sum, c) => sum + componentTotal(c, counts), 0);
}

/**
 * "The best number we currently have," in the item's own currency — never
 * collapsing estimated/quoted/contracted into one stored figure (the
 * platform spec's explicit warning against that). A flat item falls back
 * through contracted -> quoted -> the effective estimate (typed, else
 * derived from the line's allocation — spec 19); every other basis ignores
 * all of those and recomputes live from the current guest count or component
 * rows, so an allocation on a per-unit or consumption line is a comparison
 * target only, never an input.
 */
export function computeCurrent(
  item: BudgetItemInput,
  counts: GuestCounts,
  components: ConsumptionComponentInput[] = [],
): number {
  const amount = (() => {
    switch (item.quantityBasis) {
      case "flat":
        return item.contracted ?? item.quoted ?? effectiveEstimated(item) ?? 0;
      case "per_adult":
        return Math.round((item.unitPrice ?? 0) * counts.adult);
      case "per_child":
        return Math.round((item.unitPrice ?? 0) * counts.child);
      case "per_seat":
        return Math.round((item.unitPrice ?? 0) * counts.seat);
      case "consumption":
        return consumptionTotal(components, counts);
      case "manual":
        return Math.round((item.quantity ?? 1) * (item.unitPrice ?? 0));
    }
  })();
  return applyGst(amount, item.gstTreatment ?? "inclusive");
}
