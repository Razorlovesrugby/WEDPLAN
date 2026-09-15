import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFxRate } from "@/lib/fx";

/**
 * The shared FX lookup behind every non-base-currency budget row (spec 6,
 * section 5). Not wrapped in React's cache() like the rest of
 * src/server/queries — a rate lookup can write back to fx_rates on a live
 * hit, and cache() is for deduplicating reads within one render, not for
 * memoising something with a side effect.
 */

export type FxRateResult = {
  rate: number | null;
  source: "same_currency" | "cache" | "live" | "stale" | "manual_required";
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchLiveRate(base: string, quote: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=1&from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[quote];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    // Network down, timed out, or the pair isn't covered — the ladder falls
    // through to a stale cache or manual entry. Never thrown further.
    return null;
  }
}

/**
 * Looks up the rate to convert `currency` into `weddingId`'s base_currency,
 * as of today. Checks fx_rates first (at most one external call per currency
 * pair per day, across every wedding using the app); on a miss, calls the
 * external API and writes the result back via the service role — fx_rates is
 * global reference data a signed-in collaborator's own client cannot write to
 * (see 0010_budget.sql's RLS), the same "writable only by the lookup path"
 * shape as list_templates being writable by nobody at all.
 *
 * Never throws and never blocks a save: a lookup failure with nothing cached
 * returns { rate: null, source: "manual_required" }, and the caller stores
 * fx_rate = null with a visible "rate not available, enter manually" state.
 */
export async function getFxRate(currency: string, weddingId: string): Promise<FxRateResult> {
  const supabase = await createClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("base_currency")
    .eq("id", weddingId)
    .maybeSingle();
  if (weddingError) throw new Error(`Could not load the wedding's base currency: ${weddingError.message}`);
  const baseCurrency = wedding?.base_currency ?? "GBP";

  if (currency === baseCurrency) return { rate: 1, source: "same_currency" };

  const today = todayIso();
  const { data: todayRow, error: todayError } = await supabase
    .from("fx_rates")
    .select("rate")
    .eq("base_currency", baseCurrency)
    .eq("quote_currency", currency)
    .eq("as_of", today)
    .maybeSingle();
  if (todayError) throw new Error(`Could not read the exchange rate cache: ${todayError.message}`);

  const liveRate = todayRow ? null : await fetchLiveRate(baseCurrency, currency);

  let staleRate: number | null = null;
  if (!todayRow && liveRate === null) {
    const { data: staleRow } = await supabase
      .from("fx_rates")
      .select("rate")
      .eq("base_currency", baseCurrency)
      .eq("quote_currency", currency)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    staleRate = staleRow?.rate ?? null;
  }

  const resolution = resolveFxRate({ cachedToday: todayRow?.rate ?? null, liveRate, cachedStale: staleRate });

  if (resolution.status === "live") {
    const admin = createAdminClient();
    await admin
      .from("fx_rates")
      .upsert(
        { base_currency: baseCurrency, quote_currency: currency, rate: resolution.rate, as_of: today },
        { onConflict: "base_currency,quote_currency,as_of" },
      );
  }

  if (resolution.status === "manual_required") return { rate: null, source: "manual_required" };
  const source = resolution.status === "cache_hit" ? "cache" : resolution.status === "live" ? "live" : "stale";
  return { rate: resolution.rate, source };
}
