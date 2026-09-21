"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWedding } from "@/server/queries/wedding";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { clientIpHash, isThrottled, recordAttempt } from "@/server/rsvp/resolve";
import { fail, ok, type ActionResult } from "./result";

/**
 * Song requests (spec 23 §8, Q2).
 *
 * The planner chose to let anyone with the site address ask for a song, which
 * puts a write behind a URL that is not a credential. Three things make that
 * safe enough to be worth it:
 *
 *   **Rate limiting.** Shares the counter the RSVP path already uses, so a
 *   script filling the DJ's list stops being free.
 *   **Nothing is echoed.** What a guest types is never rendered back onto the
 *   public page — the list is planner-facing, and an open form that publishes
 *   what it receives is a billboard.
 *   **Attribution, not identity.** `asked_by` is an optional name. A request
 *   from a household's own page is attributed from its token instead, so the
 *   common case has a real name on it without anybody typing one.
 */

const requestSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().nullable().optional(),
  title: z.string().trim().min(1, "Which song?").max(200),
  artist: z.string().trim().max(200).optional(),
  askedBy: z.string().trim().max(80).optional(),
});

export async function requestSong(payload: unknown): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return fail("That didn't look right — a song needs a name at least.");

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) {
    return fail("That's a lot of songs at once. Give it a few minutes.");
  }

  const supabase = createAdminClient();

  // The slug is the only thing the caller controls, and it resolves to
  // exactly one wedding. Nothing downstream takes an id from the client.
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
  if (parsed.data.token && looksLikeToken(parsed.data.token)) {
    const { data: invitation } = await supabase
      .from("invitations")
      .select("household_id")
      .eq("wedding_id", wedding.id)
      .eq("token_hash", hashInviteToken(parsed.data.token))
      .is("deleted_at", null)
      .maybeSingle();
    householdId = invitation?.household_id ?? null;
  }

  const { error } = await supabase.from("song_requests").insert({
    wedding_id: wedding.id,
    household_id: householdId,
    title: parsed.data.title,
    artist: parsed.data.artist || null,
    asked_by: parsed.data.askedBy || null,
  });

  if (error) return fail("We couldn't add that one. Try again in a moment.");

  await recordAttempt(ipHash, true);
  revalidatePath("/site/songs");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

export async function setSongStatus(
  id: string,
  status: "new" | "approved" | "played" | "ignored",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("song_requests")
    .update({ status })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/songs");
  return ok(undefined);
}

export async function deleteSongRequest(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // A genuine delete, not a soft one: a song request is not guest data in the
  // sense the platform rule protects — nothing is reconstructed from it later
  // and a spam row should leave no trace.
  const { error } = await supabase
    .from("song_requests")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/songs");
  return ok(undefined);
}
