import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeCurrent } from "@/lib/budget";
import type {
  BudgetCategoryRow,
  BudgetCategoryTotalsView,
  BudgetItemView,
  BudgetSummaryView,
  ConsumptionComponentRow,
  PaymentRow,
} from "@/lib/types/database";

/**
 * `cache()` deduplicates within a single render pass — see
 * src/server/queries/wedding.ts for the same convention.
 */

export const listBudgetCategories = cache(async (weddingId: string): Promise<BudgetCategoryRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_categories")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load budget categories: ${error.message}`);
  return data ?? [];
});

/**
 * Reads v_budget_category_totals (spec 19) — one row per category: what it
 * was meant to cost, what it currently costs, and the gap both ways. Ordered
 * to match listBudgetCategories so the two zip together on /budget.
 */
export const listBudgetCategoryTotals = cache(async (weddingId: string): Promise<BudgetCategoryTotalsView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_budget_category_totals")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Could not load budget category totals: ${error.message}`);
  return data ?? [];
});

/** Reads v_budget_items — every column plus the live computed/derived money figures. See spec 6, section 3. */
export const listBudgetItems = cache(async (weddingId: string): Promise<BudgetItemView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_budget_items")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load budget items: ${error.message}`);
  return data ?? [];
});

/** Every consumption_components row for the wedding, grouped by budget_item_id at the call site. */
export const listConsumptionComponents = cache(
  async (weddingId: string): Promise<ConsumptionComponentRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("consumption_components")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`Could not load consumption components: ${error.message}`);
    return data ?? [];
  },
);

/**
 * The same adult/child/seat counts `v_budget_items` computes for a per-unit
 * or consumption line (RSVP-confirmed once any RSVP exists, else invited —
 * spec 6, section 10, decision 1), scoped to one event when given. Powers
 * the item and consumption-component editors' live preview, which mirrors
 * this in src/lib/budget.ts rather than round-tripping on every keystroke.
 */
export const getGuestCounts = cache(
  async (
    weddingId: string,
    eventId: string | null = null,
    forceInvited = false,
  ): Promise<{ adult: number; child: number; seat: number }> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .rpc("budget_guest_counts", { p_wedding_id: weddingId, p_event_id: eventId, p_force_invited: forceInvited })
      .single();
    if (error) throw new Error(`Could not load guest counts: ${error.message}`);
    return { adult: Number(data.adult), child: Number(data.child), seat: Number(data.seat) };
  },
);

/**
 * The standing figure `/guests/rank` shows near the cut line: the total of
 * every per-unit and consumption line, divided by seats, using **invited**
 * counts always — never RSVP-confirmed, regardless of what `/budget` and the
 * dashboard show (spec 6, section 10, decision 1; section 4). Recomputes
 * `computed_current` client-server-side with src/lib/budget.ts's pure
 * mirror rather than reading v_budget_summary.per_head_seat, because that
 * view's figure switches to RSVP-confirmed counts once any RSVP exists —
 * exactly the behaviour this one must not have.
 *
 * `manual` (spec 6.1) is excluded alongside `flat` — a quantity-priced line
 * like "12 centrepieces" isn't a per-guest cost just because it has a
 * quantity, matching `v_budget_summary`'s own per-head filter.
 */
export const getPerSeatCostInvited = cache(async (weddingId: string): Promise<number | null> => {
  const [items, components] = await Promise.all([listBudgetItems(weddingId), listConsumptionComponents(weddingId)]);
  const nonFlat = items.filter((i) => i.quantity_basis !== "flat" && i.quantity_basis !== "manual");
  if (nonFlat.length === 0) return null;

  const eventIds = [...new Set(nonFlat.map((i) => i.event_id))];
  const countsByEvent = new Map(
    await Promise.all(
      eventIds.map(async (eventId) => [eventId, await getGuestCounts(weddingId, eventId, true)] as const),
    ),
  );

  const componentsByItem = new Map<string, ConsumptionComponentRow[]>();
  for (const c of components) {
    const list = componentsByItem.get(c.budget_item_id) ?? [];
    list.push(c);
    componentsByItem.set(c.budget_item_id, list);
  }

  let total = 0;
  for (const item of nonFlat) {
    const counts = countsByEvent.get(item.event_id) ?? { adult: 0, child: 0, seat: 0 };
    total += computeCurrent(
      {
        quantityBasis: item.quantity_basis,
        unitPrice: item.unit_price,
        estimated: item.estimated,
        quoted: item.quoted,
        contracted: item.contracted,
        gstTreatment: item.gst_treatment,
        // Ignored for every basis this function keeps (spec 19 §4: an
        // allocation only reaches computed_current through `flat`, which is
        // filtered out above) — passed so this mirror stays faithful to the
        // view it duplicates.
        allocatedAmount: item.allocated_amount,
      },
      counts,
      (componentsByItem.get(item.id) ?? []).map((c) => ({
        guestBasis: c.guest_basis,
        servingsPerGuestPerHour: c.servings_per_guest_per_hour,
        durationHours: c.duration_hours,
        pricePerServing: c.price_per_serving,
        wastageBufferPct: c.wastage_buffer_pct,
      })),
    );
  }

  const { seat } = await getGuestCounts(weddingId, null, true);
  if (seat === 0) return null;
  return Math.round((total / seat) * 100) / 100;
});

export const getBudgetSummary = cache(async (weddingId: string): Promise<BudgetSummaryView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_budget_summary")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the budget summary: ${error.message}`);
  return data;
});

export type UpcomingPayment = PaymentRow & { item_label: string; item_vendor_name: string | null };

export const getUpcomingPayments = cache(async (weddingId: string): Promise<UpcomingPayment[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*, budget_items(label, vendor_name)")
    .eq("wedding_id", weddingId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not load payments: ${error.message}`);
  return (data ?? []).map((row) => {
    const { budget_items, ...payment } = row as PaymentRow & {
      budget_items: { label: string; vendor_name: string | null } | null;
    };
    return { ...payment, item_label: budget_items?.label ?? "", item_vendor_name: budget_items?.vendor_name ?? null };
  });
});
