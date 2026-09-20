"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { fail, ok, type ActionResult } from "./result";

/**
 * One-tap Yes / No from the invitation email (spec 22 §8).
 *
 * The email's buttons point at the household's own address carrying
 * `?reply=yes`. The page then applies it from the browser rather than during
 * the server render, which is not a detail — **a link in an email is fetched
 * by things that are not the guest.** Corporate mail scanners and link
 * previewers follow every URL in a message, and a write that happened on GET
 * would record an answer nobody gave. Applying it from a mounted client
 * component means a scanner sees a page and a person sees their reply.
 *
 * Three rules, each preventing a specific way this goes wrong:
 *
 *   1. It only fills what is unanswered. A forwarded email tapped by the
 *      wrong person cannot overwrite a considered reply.
 *   2. It covers every guest in the household and every event they are
 *      invited to — then the page says exactly what it did, editable.
 *   3. It is idempotent and grants nothing. `?reply=` is a hint applied to a
 *      page the reader already had the address for.
 */

const replySchema = z.object({
  token: z.string(),
  reply: z.enum(["yes", "no"]),
});

export async function applyReply(payload: unknown): Promise<ActionResult<{ filled: number }>> {
  const parsed = replySchema.safeParse(payload);
  if (!parsed.success) return fail("That reply didn't look right");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) return fail("That invitation link is no longer valid.");

  const { context } = resolved;
  if (context.locked) return fail("RSVPs have closed. Get in touch with the couple directly.");

  const supabase = createAdminClient();
  const answered = new Set(
    context.rsvps
      .filter((row) => row.status !== "pending")
      .map((row) => `${row.guest_id}:${row.event_id}`),
  );

  const toFill = context.invites.filter(
    (invite) => !answered.has(`${invite.guest_id}:${invite.event_id}`),
  );
  if (toFill.length === 0) return ok({ filled: 0 });

  const now = new Date().toISOString();
  const { error } = await supabase.from("rsvps").upsert(
    toFill.map((invite) => ({
      wedding_id: context.wedding.id,
      guest_id: invite.guest_id,
      event_id: invite.event_id,
      status: parsed.data.reply,
      responded_at: now,
    })),
    { onConflict: "guest_id,event_id" },
  );
  if (error) return fail("Could not save that. Try the buttons on the form below.");

  await supabase
    .from("invitations")
    .update({ first_response_at: now })
    .eq("id", context.invitationId)
    .eq("wedding_id", context.wedding.id)
    .is("first_response_at", null);

  return ok({ filled: toFill.length });
}

/**
 * The optional message after a decline (spec 22 §3a, Q4).
 *
 * Stored as an answer to the built-in household-scope question rather than in
 * a column of its own, so it arrives on `/questions` and the household screen
 * beside every other answer instead of in a field one screen knows about.
 * `0023` guarantees the question exists for every wedding.
 */
export async function saveDeclineNote(payload: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ token: z.string(), note: z.string().trim().max(2000) })
    .safeParse(payload);
  if (!parsed.success) return fail("That message didn't look right");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) return fail("That invitation link is no longer valid.");

  const { context } = resolved;
  const supabase = createAdminClient();

  const { data: question } = await supabase
    .from("rsvp_questions")
    .select("id")
    .eq("wedding_id", context.wedding.id)
    .eq("builtin_key", "decline_note")
    .maybeSingle();

  // A wedding created before 0023 and somehow missed by its backfill would
  // land here. Losing the note silently is worse than saying so.
  if (!question) return fail("We couldn't save that message. Sorry — please email us instead.");

  const { data: existing } = await supabase
    .from("rsvp_answers")
    .select("id")
    .eq("wedding_id", context.wedding.id)
    .eq("question_id", question.id)
    .eq("household_id", context.household.id)
    .maybeSingle();

  const row = {
    wedding_id: context.wedding.id,
    question_id: question.id,
    household_id: context.household.id,
    value: parsed.data.note as unknown as never,
    answered_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("rsvp_answers").update(row).eq("id", existing.id)
    : await supabase.from("rsvp_answers").insert(row);

  if (error) return fail("We couldn't save that message. Sorry — please email us instead.");
  return ok(undefined);
}
