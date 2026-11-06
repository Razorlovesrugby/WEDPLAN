import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PersonRow } from "@/lib/types/database";

/**
 * Everyone a task can be handed to who isn't one of the two collaborators
 * (spec 39). Removed people are included — a task that still holds one needs
 * its name — and callers filter on `deleted_at` where they offer a choice.
 */
export const getPeople = cache(async (weddingId: string): Promise<PersonRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return data ?? [];
});
