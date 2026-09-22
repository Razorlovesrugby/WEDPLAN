import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DrinkPlanView } from "@/lib/types/database";

/**
 * Reading drink plans (`docs/planning-spreadsheet-gaps.md` §5, Pattern C).
 *
 * `v_drink_plans` resolves the headcount live from RSVPs, so nothing is
 * cached beyond the request and nothing is stored — drag a household above
 * the cut line and the shopping list moves on the next read. That is the
 * behaviour the whole feature exists for, and it is why this file has no
 * "refresh" anything.
 */
export const listDrinkPlans = cache(async (weddingId: string): Promise<DrinkPlanView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_drink_plans")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order")
    .order("label");

  if (error) throw new Error(`Could not load drink plans: ${error.message}`);
  return (data ?? []) as DrinkPlanView[];
});

export const getDrinkPlan = cache(
  async (weddingId: string, id: string): Promise<DrinkPlanView | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_drink_plans")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("id", id)
      .maybeSingle();
    return (data as DrinkPlanView | null) ?? null;
  },
);
