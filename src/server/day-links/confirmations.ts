import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * "Got it" is cleared when a task's time changes (spec 54 §6.11). A schedule
 * shift moves many items at once, so take the start and end of every item
 * before, run the shift, then clear the confirmation of each item that moved.
 */
export async function snapshotTimes(weddingId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("run_sheet_items").select("id, starts_at, ends_at").eq("wedding_id", weddingId);
  return new Map((data ?? []).map((i) => [i.id, `${Date.parse(i.starts_at)}|${Date.parse(i.ends_at)}`]));
}

export async function clearConfirmedForMoved(weddingId: string, before: Map<string, string>): Promise<string | null> {
  const supabase = await createClient();
  const after = await supabase.from("run_sheet_items").select("id, starts_at, ends_at").eq("wedding_id", weddingId);
  if (after.error) return after.error.message;
  const moved = (after.data ?? []).filter((i) => before.get(i.id) !== `${Date.parse(i.starts_at)}|${Date.parse(i.ends_at)}`).map((i) => i.id);
  if (moved.length === 0) return null;
  const { error } = await supabase.from("run_sheet_item_assignees").update({ confirmed_at: null }).eq("wedding_id", weddingId).in("item_id", moved);
  return error?.message ?? null;
}
