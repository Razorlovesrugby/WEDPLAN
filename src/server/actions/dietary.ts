"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseDietaryNeeds } from "@/lib/dietary";
import { replaceGuestNeeds } from "@/server/dietary-write";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * A guest's structured dietary needs (spec 57 Part H), saved as a whole set.
 * Used from the guest page, the guest table and the seating screen; the RSVP
 * form saves the same set through its own, token-scoped action.
 */
export async function saveGuestDietaryNeeds(guestId: string, needs: unknown): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!z.string().uuid().safeParse(guestId).success) return fail("That guest doesn't exist");
  const supabase = await createClient();
  const guest = await supabase.from("guests").select("id").eq("id", guestId).eq("wedding_id", wedding.id).is("deleted_at", null).maybeSingle();
  if (guest.error) return fail(guest.error.message);
  if (!guest.data) return fail("That guest doesn't exist");

  const problem = await replaceGuestNeeds(supabase, wedding.id, guestId, parseDietaryNeeds(needs));
  if (problem) return fail(problem);

  revalidatePath("/guests");
  revalidatePath(`/guests/${guestId}`);
  revalidatePath("/seating");
  revalidatePath("/events", "layout");
  return ok(undefined);
}
