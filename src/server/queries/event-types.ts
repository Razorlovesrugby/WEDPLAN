import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { EventTypeRow } from "@/lib/types/database";

/** Every type of the wedding, hidden ones included, in order (spec 51). */
export const getEventTypes = cache(async (weddingId: string): Promise<EventTypeRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load event types: ${error.message}`);
  return data ?? [];
});
