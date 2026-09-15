import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { RsvpAnswerRow, RsvpQuestionRow } from "@/lib/types/database";

export type AnsweredQuestion = {
  question: Pick<RsvpQuestionRow, "id" | "label" | "type" | "help_text" | "sort_order">;
  value: RsvpAnswerRow["value"];
  answered_at: string;
};

type AnswerRow = {
  value: RsvpAnswerRow["value"];
  answered_at: string;
  rsvp_questions: AnsweredQuestion["question"] | null;
};

/**
 * Answers to a guest's own questions — scope "guest". Shared,
 * household-scope answers are not repeated per member; see
 * getHouseholdAnswers.
 *
 * The question is embedded rather than looked up separately so a question
 * later deactivated — see removeQuestion in server/actions/questions.ts —
 * still shows its label here. Its answers are the reason it was kept instead
 * of deleted.
 */
export const getGuestAnswers = cache(
  async (weddingId: string, guestId: string): Promise<AnsweredQuestion[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rsvp_answers")
      .select("value, answered_at, rsvp_questions(id, label, type, help_text, sort_order)")
      .eq("wedding_id", weddingId)
      .eq("guest_id", guestId);

    if (error) throw new Error(`Could not load answers: ${error.message}`);
    return shapeAnswers(data ?? []);
  },
);

/** Answers scoped to the household as a whole, answered once per family. */
export const getHouseholdAnswers = cache(
  async (weddingId: string, householdId: string): Promise<AnsweredQuestion[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rsvp_answers")
      .select("value, answered_at, rsvp_questions(id, label, type, help_text, sort_order)")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId);

    if (error) throw new Error(`Could not load answers: ${error.message}`);
    return shapeAnswers(data ?? []);
  },
);

/** Same order as the RSVP form itself: sort_order, then label to break ties. */
function shapeAnswers(rows: AnswerRow[]): AnsweredQuestion[] {
  return rows
    .filter((row): row is AnswerRow & { rsvp_questions: AnsweredQuestion["question"] } =>
      row.rsvp_questions !== null,
    )
    .map((row) => ({ question: row.rsvp_questions, value: row.value, answered_at: row.answered_at }))
    .sort(
      (a, b) =>
        a.question.sort_order - b.question.sort_order || a.question.label.localeCompare(b.question.label),
    );
}
