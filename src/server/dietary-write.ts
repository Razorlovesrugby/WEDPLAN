import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diffNeeds, type DietaryNeed } from "@/lib/dietary";
import type { Database, DietaryTag } from "@/lib/types/database";

/** The needs a guest has now, in the shape the library uses. */
export async function readGuestNeeds(supabase: SupabaseClient<Database>, weddingId: string, guestId: string): Promise<{ needs: DietaryNeed[]; error: string | null }> {
  const { data, error } = await supabase
    .from("guest_dietary_needs")
    .select("tag, is_allergy, other_text")
    .eq("wedding_id", weddingId)
    .eq("guest_id", guestId);
  if (error) return { needs: [], error: error.message };
  return { needs: (data ?? []).map((r) => ({ tag: r.tag, isAllergy: r.is_allergy, otherText: r.other_text })), error: null };
}

/**
 * Makes `next` the guest's whole set of needs: changed tags are upserted,
 * removed ones deleted, untouched ones left alone. Each write's error is
 * returned (an unchecked upsert is how spec 49 lost every RSVP answer).
 * Returns null on success. The caller has already checked the guest belongs
 * to `weddingId`; the composite foreign key refuses a mismatch regardless.
 */
export async function replaceGuestNeeds(
  supabase: SupabaseClient<Database>,
  weddingId: string,
  guestId: string,
  next: readonly DietaryNeed[],
): Promise<string | null> {
  const current = await readGuestNeeds(supabase, weddingId, guestId);
  if (current.error) return current.error;
  const { upsert, remove } = diffNeeds(current.needs, next);

  if (upsert.length > 0) {
    const { error } = await supabase.from("guest_dietary_needs").upsert(
      upsert.map((n) => ({ wedding_id: weddingId, guest_id: guestId, tag: n.tag, is_allergy: n.isAllergy, other_text: n.otherText })),
      { onConflict: "guest_id,tag" },
    );
    if (error) return error.message;
  }
  if (remove.length > 0) {
    const { error } = await supabase
      .from("guest_dietary_needs")
      .delete()
      .eq("wedding_id", weddingId)
      .eq("guest_id", guestId)
      .in("tag", remove as DietaryTag[]);
    if (error) return error.message;
  }
  return null;
}
