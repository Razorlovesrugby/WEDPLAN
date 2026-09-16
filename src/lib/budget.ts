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
};

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
 * through contracted -> quoted -> estimated; every other basis ignores those
 * three and recomputes live from the current guest count or component rows.
 */
export function computeCurrent(
  item: BudgetItemInput,
  counts: GuestCounts,
  components: ConsumptionComponentInput[] = [],
): number {
  switch (item.quantityBasis) {
    case "flat":
      return item.contracted ?? item.quoted ?? item.estimated ?? 0;
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
}
