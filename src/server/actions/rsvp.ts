"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { coerceAnswer } from "@/lib/rsvp-answers";
import { fail, ok, type ActionResult } from "./result";
import type { GuestRow } from "@/lib/types/database";

/**
 * The public RSVP write.
 *
 * The token is re-resolved here rather than trusting anything the form sends.
 * The client supplies answers; it never supplies a household id, a guest id
 * that it did not receive, or a wedding id. Every id in the payload is checked
 * against the set this token actually owns before a single row is written.
 */

/**
 * An answer is a string for every question type except multi_select, which is
 * an array. `value` is jsonb, so the array is stored as an array rather than
 * as a joined string that nothing could query back out.
 */
const answerValue = z.union([
  z.string().max(2000),
  z.array(z.string().max(200)).max(50),
]);

const submissionSchema = z.object({
  token: z.string(),
  guests: z
    .array(
      z.object({
        guestId: z.string().uuid(),
        /** Only used for a plus-one whose name the household is filling in. */
        name: z.string().trim().max(80).optional(),
        dietary: z.string().trim().max(500).optional(),
        accessibility: z.string().trim().max(500).optional(),
        responses: z.array(
          z.object({
            eventId: z.string().uuid(),
            status: z.enum(["yes", "no", "maybe", "pending"]),
          }),
        ),
        answers: z.record(z.string().uuid(), answerValue).optional(),
      }),
    )
    .max(40),
  householdAnswers: z.record(z.string().uuid(), answerValue).optional(),
});

export async function submitRsvp(payload: unknown): Promise<ActionResult<{ saved: number }>> {
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) return fail("Something in that form didn't look right");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) {
    return fail(
      resolved.reason === "throttled"
        ? "Too many attempts. Wait a few minutes and try again."
        : "That invitation link is no longer valid.",
    );
  }

  const { context } = resolved;
  if (context.locked) {
    return fail("RSVPs have closed. Get in touch with the couple directly.");
  }

  const weddingId = context.wedding.id;
  const ownGuestIds = new Set(context.guests.map((guest) => guest.id));
  const invitedEventIds = new Set(context.events.map((event) => event.id));
  const questionById = new Map(context.questions.map((question) => [question.id, question]));

  // Anything not belonging to this household is dropped silently rather than
  // erroring: a malformed id is either a bug or an attack, and neither is
  // worth an error message that confirms what exists.
  const guests = parsed.data.guests.filter((guest) => ownGuestIds.has(guest.guestId));

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let saved = 0;

  for (const guest of guests) {
    const record = context.guests.find((candidate) => candidate.id === guest.guestId)!;

    // A plus-one is a real guest record whose name the household supplies.
    // Only a guest flagged is_plus_one can be renamed this way, and only ever
    // by the household that owns them.
    // Typed rather than Record<string, …>: an index signature widens the
    // update argument and throws away the column types entirely.
    const patch: Partial<
      Pick<GuestRow, "first_name" | "last_name" | "dietary" | "accessibility">
    > = {};
    if (record.is_plus_one && guest.name) {
      const [first, ...rest] = guest.name.split(/\s+/);
      patch.first_name = first ?? record.first_name;
      patch.last_name = rest.length > 0 ? rest.join(" ") : null;
    }
    if (guest.dietary !== undefined) patch.dietary = guest.dietary || null;
    if (guest.accessibility !== undefined) patch.accessibility = guest.accessibility || null;

    if (Object.keys(patch).length > 0) {
      await supabase
        .from("guests")
        .update(patch)
        .eq("id", guest.guestId)
        .eq("wedding_id", weddingId)
        .eq("household_id", context.household.id);
    }

    for (const response of guest.responses) {
      if (!invitedEventIds.has(response.eventId)) continue;

      const { error } = await supabase.from("rsvps").upsert(
        {
          wedding_id: weddingId,
          guest_id: guest.guestId,
          event_id: response.eventId,
          status: response.status,
          responded_at: response.status === "pending" ? null : now,
        },
        { onConflict: "guest_id,event_id" },
      );
      if (error) return fail("Could not save one of the answers. Nothing was lost — try again.");
      saved++;
    }

    for (const [questionId, value] of Object.entries(guest.answers ?? {})) {
      const question = questionById.get(questionId);
      if (!question || question.scope !== "guest") continue;
      const answer = coerceAnswer(question, value);
      await supabase.from("rsvp_answers").upsert(
        {
          wedding_id: weddingId,
          question_id: questionId,
          guest_id: guest.guestId,
          household_id: null,
          value: answer ?? null,
          answered_at: now,
        },
        { onConflict: "question_id,guest_id" },
      );
    }
  }

  for (const [questionId, value] of Object.entries(parsed.data.householdAnswers ?? {})) {
    const question = questionById.get(questionId);
    if (!question || question.scope !== "household") continue;
    const answer = coerceAnswer(question, value);
    await supabase.from("rsvp_answers").upsert(
      {
        wedding_id: weddingId,
        question_id: questionId,
        guest_id: null,
        household_id: context.household.id,
        value: answer ?? null,
        answered_at: now,
      },
      { onConflict: "question_id,household_id" },
    );
  }

  await supabase
    .from("invitations")
    .update({ first_response_at: now })
    .eq("id", context.invitationId)
    .eq("wedding_id", weddingId)
    .is("first_response_at", null);

  // The planner's views are stale now. The RSVP page itself re-reads on load.
  revalidatePath("/");
  revalidatePath("/guests");
  revalidatePath("/invitations");

  return ok({ saved });
}
