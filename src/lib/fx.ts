/**
 * Currency conversion math and the fx_rate lookup's fallback ladder (spec 6,
 * section 3 and section 5's `getFxRate`), kept pure and out of
 * src/server/queries/fx.ts so the ladder's *decision* can be unit-tested
 * without a database or a real network call — the query module supplies the
 * three inputs (today's cache row, a live API result, the most recent stale
 * cache row) and this module only decides which one wins.
 */

export type FxLookupInputs = {
  /** fx_rates row for (base, quote, today), if one exists. */
  cachedToday: number | null;
  /** Result of calling the external API — null if it wasn't tried, or failed, or the pair isn't covered. */
  liveRate: number | null;
  /** Most recent fx_rates row for (base, quote) regardless of age. */
  cachedStale: number | null;
};

export type FxResolution =
  | { status: "cache_hit"; rate: number }
  | { status: "live"; rate: number }
  | { status: "stale_fallback"; rate: number }
  | { status: "manual_required" };

/**
 * The ladder from spec 6, section 5: today's cache first, then a live call,
 * then the most recent stale cache regardless of age, then manual entry —
 * never a blocked save. Only a "live" resolution needs writing back to
 * fx_rates; the caller does that, since this function has no I/O.
 */
export function resolveFxRate(inputs: FxLookupInputs): FxResolution {
  if (inputs.cachedToday !== null) return { status: "cache_hit", rate: inputs.cachedToday };
  if (inputs.liveRate !== null) return { status: "live", rate: inputs.liveRate };
  if (inputs.cachedStale !== null) return { status: "stale_fallback", rate: inputs.cachedStale };
  return { status: "manual_required" };
}

/**
 * "Units of base_currency per 1 unit of this row's own currency" applied to a
 * minor-units amount. A null fx_rate means the row's own currency already
 * matches base_currency (see budget_items.fx_rate's column comment).
 */
export function convertAmount(amountMinor: number, fxRate: number | null): number {
  return Math.round(amountMinor * (fxRate ?? 1));
}
