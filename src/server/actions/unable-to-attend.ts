"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The planner recording that a guest can't come (spec 29 §4.4).
 *
 * The case is the person who texts "we can't make it" — the same fact the
 * save-the-date button records, entered by hand, with `via = 'planner'` so the
 * screen can say who told whom. Clearing it is the same action the other way.
 *
 * This writes the flag on `guests` and nothing else. It never touches `rsvps`,
 * and it does not un-invite anyone: the guest stays invited, and is simply not
 * counted (migration 0034, `guest_excluded_from_counts`).
 *
 * Planner-session writes go through RLS like every other action here; the
 * guest-facing write is `save-the-date-reply.ts`, a different door with a
 * different credential.
 */

const uuid = z.string().uuid();

export async function setGuestUnableToAttend(
  guestId: string,
  unable: boolean,
): Promise<ActionResult> {
  if (!uuid.safeParse(guestId).success) return fail("That guest no longer exists");
  const wedding = await requireWedding();
  const supabase = await createClient();

  const base = supabase
    .from("guests")
    .update(
      unable
        ? { unable_to_attend_at: new Date().toISOString(), unable_to_attend_via: "planner" as const }
        : { unable_to_attend_at: null, unable_to_attend_via: null },
    )
    .eq("wedding_id", wedding.id)
    .eq("id", guestId)
    .is("deleted_at", null);

  // Setting an already-set flag keeps the first time, and keeps whoever told
  // us: a guest's own answer must not be rewritten as the planner's.
  const { data, error } = await (unable ? base.is("unable_to_attend_at", null) : base).select(
    "household_id",
  );
  if (error) return fail(error.message);

  revalidatePath("/invitations");
  revalidatePath("/guests");
  revalidatePath("/guests/rank");
  revalidatePath("/budget");
  revalidatePath("/");
  const householdId = data?.[0]?.household_id;
  if (householdId) revalidatePath(`/households/${householdId}`);
  return ok(undefined);
}
