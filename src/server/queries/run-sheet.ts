import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RunSheetItemView } from "@/lib/types/database";

/**
 * One event's run sheet, ordered by computed start time — "time TBD" items
 * (null starts_at) sort last, then by their own sort_order among
 * themselves (spec 5, part B, B5).
 */
export const listRunSheetItems = cache(
  async (weddingId: string, eventId: string): Promise<RunSheetItemView[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_run_sheet_items")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("event_id", eventId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });

    if (error) throw new Error(`Could not load the run sheet: ${error.message}`);
    return data ?? [];
  },
);

/** Which events already have at least one run sheet item — for the /run-sheet picker. */
export const getEventIdsWithRunSheetItems = cache(async (weddingId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("run_sheet_items")
    .select("event_id")
    .eq("wedding_id", weddingId);

  if (error) throw new Error(`Could not load run sheets: ${error.message}`);
  return new Set((data ?? []).map((row) => row.event_id));
});
