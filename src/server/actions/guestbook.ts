"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWedding } from "@/server/queries/wedding";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { clientIpHash, isThrottled, recordAttempt } from "@/server/rsvp/resolve";
import { arrivalStatus } from "@/lib/site/participation";
import { fail, ok, type ActionResult } from "./result";

/**
 * The guestbook (spec 25 §12).
 *
 * Spec 23 §8 cut this feature outright, for one reason: "a moderation
 * surface". Reopening it rests entirely on `arrivalStatus()` — a note from a
 * household's own link publishes on arrival because that reader holds a
 * credential spec 21 minted for them; a note from the shared address waits.
 *
 * **If that rule is ever weakened, this feature should go back out with it.**
 * Without it, a public URL with a textarea on it is a comment section attached
 * to somebody's wedding, and the couple are the moderators.
 *
 * The 500-character limit is checked here AND in the database, because a limit
 * that lives only in a form is not a limit.
 */

const signSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().nullable().optional(),
  body: z.string().trim().min(1, "Write something first.").max(500, "Keep it under 500 characters."),
  authorName: z.string().trim().max(80).optional(),
});

export async function signGuestbook(payload: unknown): Promise<ActionResult<{ published: boolean }>> {
  const parsed = signSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That didn't look right.");
  }

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) {
    return fail("That's a lot of notes at once. Give it a few minutes.");
  }

  const supabase = createAdminClient();

  // The slug is the only thing the caller controls. Nothing downstream takes
  // an id from the client.
  const { data: wedding } = await supabase
    .from("weddings")
    .select("id")
    .eq("slug", parsed.data.weddingSlug)
    .maybeSingle();

  if (!wedding) {
    await recordAttempt(ipHash, false);
    return fail("We couldn't find that wedding.");
  }

  let householdId: string | null = null;
  let guestName: string | null = null;
  if (parsed.data.token && looksLikeToken(parsed.data.token)) {
    const { data: invitation } = await supabase
      .from("invitations")
      .select("household_id, households(display_name)")
      .eq("wedding_id", wedding.id)
      .eq("token_hash", hashInviteToken(parsed.data.token))
      .is("deleted_at", null)
      .maybeSingle();
    householdId = invitation?.household_id ?? null;
    guestName = invitation?.households?.display_name ?? null;
  }

  const status = arrivalStatus(householdId);

  const { error } = await supabase.from("guest_notes").insert({
    wedding_id: wedding.id,
    household_id: householdId,
    // Whatever they typed, else the household we already know — so somebody
    // arriving from their own link never has to type their own name.
    author_name: parsed.data.authorName || guestName,
    body: parsed.data.body,
    status,
  });

  if (error) return fail("We couldn't save that. Try again in a moment.");

  await recordAttempt(ipHash, true);
  revalidatePath("/site/guestbook");
  return ok({ published: status === "approved" });
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

export async function setNoteStatus(
  id: string,
  status: "new" | "approved" | "ignored",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("guest_notes")
    .update({ status })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/guestbook");
  return ok(undefined);
}

export async function deleteNote(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // A real delete. A guestbook note is not guest data in the sense the
  // platform's no-hard-delete rule protects — nothing is reconstructed from it
  // and a piece of abuse should leave no trace on the couple's account.
  const { error } = await supabase
    .from("guest_notes")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/guestbook");
  return ok(undefined);
}
