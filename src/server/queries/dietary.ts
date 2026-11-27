import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { DietaryNeed } from "@/lib/dietary";

/**
 * Every structured dietary need in the wedding, by guest (spec 57 Part H).
 * A plain object, not a Map, so a server component can hand it to a client
 * component. Guests with none are absent.
 */
export const getDietaryNeeds = cache(async (weddingId: string): Promise<Record<string, DietaryNeed[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guest_dietary_needs")
    .select("guest_id, tag, is_allergy, other_text")
    .eq("wedding_id", weddingId);
  if (error) throw new Error(`Could not load dietary needs: ${error.message}`);
  const out: Record<string, DietaryNeed[]> = {};
  for (const r of data ?? []) {
    (out[r.guest_id] ??= []).push({ tag: r.tag, isAllergy: r.is_allergy, otherText: r.other_text });
  }
  return out;
});
