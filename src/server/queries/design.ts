import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { previewHouseholds, type PreviewHousehold } from "@/lib/site/preview-households";

/**
 * Who a Design tab's preview can be shown as (spec 42 §5.3, from spec 27 E7):
 * every household, the one with the most events first. Its own file, not
 * `site.ts`, because `site.ts` is read by the public pages guests open, and
 * planner-only changes stay out of those (spec 42 §6).
 */
export const getPreviewHouseholds = cache(async (weddingId: string): Promise<PreviewHousehold[]> => {
  const supabase = await createClient();
  const [{ data: households }, { data: invitations }] = await Promise.all([
    supabase
      .from("households")
      .select("id, display_name")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .order("display_name")
      .limit(300),
    // One row per household, with its events nested, so it stays inside the row cap.
    supabase
      .from("invitations")
      .select("household_id, invitation_events(event_id)")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .limit(300),
  ]);
  return previewHouseholds(households ?? [], invitations ?? []);
});
