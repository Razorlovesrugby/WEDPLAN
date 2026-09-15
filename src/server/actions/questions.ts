"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * Custom RSVP questions.
 *
 * Until now these could only be created in SQL, which made "ask everyone
 * about the coach from the hotel" a job for whoever had the database open.
 *
 * Two rules here are worth knowing before changing anything:
 *
 *   A question is deactivated, not deleted, once it has answers. Deleting it
 *   cascades its answers away, and the answers are the reason it existed —
 *   "how many said they need the coach" stops being answerable the moment
 *   somebody tidies up a question after the replies are in.
 *
 *   Options are stored as a jsonb array of strings. The column has a check
 *   constraint that it is an array; this keeps it to an array of non-empty
 *   strings, which is what the RSVP form's select controls can render.
 */

const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "boolean",
  "single_select",
  "multi_select",
  "number",
] as const;

/** The two types whose options are the question. */
const SELECT_TYPES: readonly string[] = ["single_select", "multi_select"];

const questionSchema = z
  .object({
    label: z.string().trim().min(1, "Give the question a label").max(200),
    help_text: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v === undefined || v === "" ? null : v)),
    type: z.enum(QUESTION_TYPES),
    scope: z.enum(["guest", "household"]),
    required: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
    sort_order: z.coerce.number().int().min(0).max(999).optional(),
    active: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
    /** One option per line, as the textarea supplies them. */
    options: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (SELECT_TYPES.includes(value.type) && parseOptions(value.options).length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "A choice question needs at least two options, one per line",
      });
    }
  });

/** Lines to a deduplicated array, order preserved. */
function parseOptions(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const option = line.trim();
    if (option === "" || seen.has(option)) continue;
    seen.add(option);
    out.push(option);
  }
  return out;
}

function checkboxToBoolean(value: boolean | "on" | "" | undefined): boolean {
  return value === true || value === "on";
}

export async function saveQuestion(
  questionId: string | null,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = questionSchema.safeParse(fields);
  if (!parsed.success) {
    return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const options = SELECT_TYPES.includes(parsed.data.type) ? parseOptions(parsed.data.options) : [];

  const patch = {
    label: parsed.data.label,
    help_text: parsed.data.help_text,
    type: parsed.data.type,
    scope: parsed.data.scope,
    required: checkboxToBoolean(parsed.data.required),
    active: parsed.data.active === undefined ? true : checkboxToBoolean(parsed.data.active),
    sort_order: parsed.data.sort_order ?? 0,
    options,
  };

  if (questionId) {
    const { error } = await supabase
      .from("rsvp_questions")
      .update(patch)
      .eq("id", questionId)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);

    revalidatePath("/questions");
    return ok({ id: questionId });
  }

  const { data, error } = await supabase
    .from("rsvp_questions")
    .insert({ ...patch, wedding_id: wedding.id })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidatePath("/questions");
  return ok({ id: data.id });
}

/**
 * Remove a question — by deactivating it if anyone has answered.
 *
 * The distinction is not a nicety. `rsvp_answers` cascades on the question's
 * foreign key, so deleting a question that has been answered destroys every
 * answer to it, silently and unrecoverably. A question nobody has answered
 * carries nothing, so it is genuinely deleted rather than left cluttering the
 * screen.
 */
export async function removeQuestion(
  questionId: string,
): Promise<ActionResult<{ deactivated: boolean; answers: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("rsvp_answers")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", wedding.id)
    .eq("question_id", questionId);

  if (countError) return fail(countError.message);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("rsvp_questions")
      .update({ active: false })
      .eq("id", questionId)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);

    revalidatePath("/questions");
    return ok({ deactivated: true, answers: count ?? 0 });
  }

  const { error } = await supabase
    .from("rsvp_questions")
    .delete()
    .eq("id", questionId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePath("/questions");
  return ok({ deactivated: false, answers: 0 });
}

/** Move a question up or down the form. Sort order is a plain integer here —
 *  there are a handful of questions, not a list anyone drags at scale. */
export async function reorderQuestion(
  questionId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: questions, error } = await supabase
    .from("rsvp_questions")
    .select("id, sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return fail(error.message);

  const ordered = questions ?? [];
  const index = ordered.findIndex((question) => question.id === questionId);
  if (index === -1) return fail("That question no longer exists");

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return ok(undefined);

  // Rewrite the whole run rather than swapping two values: rows created in
  // SQL all share sort_order 0, and swapping zeroes changes nothing at all.
  const reordered = [...ordered];
  const moved = reordered[index]!;
  reordered[index] = reordered[swapWith]!;
  reordered[swapWith] = moved;

  for (const [position, question] of reordered.entries()) {
    if (question.sort_order === position) continue;
    const { error: updateError } = await supabase
      .from("rsvp_questions")
      .update({ sort_order: position })
      .eq("id", question.id)
      .eq("wedding_id", wedding.id);
    if (updateError) return fail(updateError.message);
  }

  revalidatePath("/questions");
  return ok(undefined);
}
