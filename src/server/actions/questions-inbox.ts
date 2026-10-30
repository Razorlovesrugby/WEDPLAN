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
 * "Ask a question" under the site's FAQ.
 *
 * Unlike the guestbook nothing a guest writes here is ever shown to anyone but
 * the couple, so there is nothing to moderate and no `arrivalStatus()` — every
 * question is born `new`. (Named `questions-inbox` because `questions.ts` is
 * the RSVP questions.)
 *
 * The slug is the only thing the caller controls; the household comes from the
 * token if there is one, never from an id sent by the browser. The 1000-
 * character limit is checked here and in the database.
 */

const askSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().nullable().optional(),
  body: z.string().trim().min(1, "Write your question first.").max(1000, "Keep it under 1000 characters."),
  authorName: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(200).optional(),
});

export async function askQuestion(payload: unknown): Promise<ActionResult> {
  const parsed = askSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That didn't look right.");
  }

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) {
    return fail("That's a lot of questions at once. Give it a few minutes.");
  }

  const supabase = createAdminClient();
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
  let householdName: string | null = null;
  if (parsed.data.token && looksLikeToken(parsed.data.token)) {
    const { data: invitation } = await supabase
      .from("invitations")
      .select("household_id, households(display_name)")
      .eq("wedding_id", wedding.id)
      .eq("token_hash", hashInviteToken(parsed.data.token))
      .is("deleted_at", null)
      .maybeSingle();
    householdId = invitation?.household_id ?? null;
    householdName = invitation?.households?.display_name ?? null;
  }

  const { error } = await supabase.from("guest_questions").insert({
    wedding_id: wedding.id,
    household_id: householdId,
    author_name: parsed.data.authorName || householdName,
    contact: parsed.data.contact || null,
    body: parsed.data.body,
  });

  if (error) return fail("We couldn't send that. Try again in a moment.");

  await recordAttempt(ipHash, true);
  revalidatePath("/site/questions");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

export async function setQuestionStatus(
  id: string,
  status: "new" | "answered" | "dismissed",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("guest_questions")
    .update({ status })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/questions");
  return ok(undefined);
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // A real delete, like a guestbook note: a question is not guest data the
  // no-hard-delete rule protects, and the audit log keeps what was asked.
  const { error } = await supabase
    .from("guest_questions")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/questions");
  return ok(undefined);
}
