import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName } from "@/lib/format";
import type { RsvpAnswerRow, RsvpQuestionRow } from "@/lib/types/database";
import { listInvites } from "./invites";

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

// ---------------------------------------------------------------------------
// Every answer to every question, for the results (spec 49)
// ---------------------------------------------------------------------------

/** The API's row cap (`max_rows`). */
const PAGE = 1000;

export type OverviewGuest = {
  id: string;
  name: string;
  household_id: string;
  household_name: string;
};

export type OverviewAnswer = Pick<RsvpAnswerRow, "question_id" | "guest_id" | "household_id" | "value" | "answered_at">;

export type AnswersOverview = {
  questions: RsvpQuestionRow[];
  answers: OverviewAnswer[];
  /** Guests invited to at least one event, not deleted: who a per-guest question asks. */
  guests: OverviewGuest[];
  /** Their households: who a per-household question asks. */
  households: { id: string; name: string }[];
};

/**
 * Read everything the results screens and the answers CSV need, once.
 * Answers and guests are read in pages: 200 guests × 6 questions passes the
 * API's 1000-row cap.
 */
export const getAnswersOverview = cache(async (weddingId: string): Promise<AnswersOverview> => {
  const supabase = await createClient();

  const [questions, invites] = await Promise.all([
    supabase
      .from("rsvp_questions")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    listInvites(weddingId),
  ]);
  if (questions.error) throw new Error(`Could not load questions: ${questions.error.message}`);

  const answers: OverviewAnswer[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("rsvp_answers")
      .select("question_id, guest_id, household_id, value, answered_at")
      .eq("wedding_id", weddingId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load answers: ${error.message}`);
    answers.push(...((data ?? []) as OverviewAnswer[]));
    if (!data || data.length < PAGE) break;
  }

  type GuestRead = {
    id: string;
    first_name: string;
    last_name: string | null;
    preferred_name: string | null;
    household_id: string;
    households: { display_name: string; deleted_at: string | null } | null;
  };
  const guestRows: GuestRead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("guests")
      .select("id, first_name, last_name, preferred_name, household_id, households(display_name, deleted_at)")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load guests: ${error.message}`);
    guestRows.push(...((data ?? []) as unknown as GuestRead[]));
    if (!data || data.length < PAGE) break;
  }

  const invited = new Set(invites.filter((row) => row.invited).map((row) => row.guest_id));
  const guests = guestRows
    .filter((g) => invited.has(g.id) && g.households && !g.households.deleted_at)
    .map((g) => ({
      id: g.id,
      name: guestName(g),
      household_id: g.household_id,
      household_name: g.households!.display_name,
    }))
    .sort((a, b) => a.household_name.localeCompare(b.household_name) || a.name.localeCompare(b.name));

  const households = new Map<string, string>();
  for (const g of guests) households.set(g.household_id, g.household_name);

  return {
    questions: (questions.data ?? []) as RsvpQuestionRow[],
    answers,
    guests,
    households: [...households].map(([id, name]) => ({ id, name })),
  };
});
