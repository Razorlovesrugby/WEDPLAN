/**
 * Constraining a submitted answer to what its question will accept.
 *
 * Lives here rather than beside the action because a "use server" module may
 * only export async functions, and this needs to be directly testable: it is
 * the guard on a public endpoint, and the RSVP form is not the guard. Anyone
 * holding a link can post whatever they like to the action; the radios and
 * checkboxes on screen constrain the honest path only.
 *
 * A choice question's options are the entire point of it — they exist so the
 * caterer receives "Salmon" forty times rather than forty spellings of it. An
 * option that is not on the question is therefore dropped rather than stored.
 */

/** A string for every question type except multi_select, which is an array. */
export type AnswerValue = string | string[];

type QuestionShape = { type: string; options: unknown };

function optionsOf(question: QuestionShape): string[] {
  return Array.isArray(question.options) ? (question.options as unknown[]).map(String) : [];
}

/**
 * The value to store, or undefined when nothing usable is left — which the
 * caller writes as null, meaning "not answered".
 */
export function coerceAnswer(
  question: QuestionShape,
  value: AnswerValue,
): string | string[] | undefined {
  const options = optionsOf(question);

  if (question.type === "multi_select") {
    const submitted = Array.isArray(value) ? value : [value];
    // Deduplicated, and ordered by the question's own option list rather than
    // by the order they arrived, so two guests picking the same two things
    // produce the same stored value.
    const chosen = options.filter((option) => submitted.includes(option));
    return chosen.length > 0 ? chosen : undefined;
  }

  // Every other type is single-valued. An array arriving for one means the
  // client is sending something it should not, so only the first is read.
  const single = Array.isArray(value) ? (value[0] ?? "") : value;
  const trimmed = single.trim();
  if (trimmed === "") return undefined;

  if (question.type === "single_select") {
    return options.includes(trimmed) ? trimmed : undefined;
  }
  if (question.type === "boolean") {
    return trimmed === "yes" || trimmed === "no" ? trimmed : undefined;
  }
  if (question.type === "number") {
    // Stored as text: the column is jsonb and everything else in the app reads
    // these as strings. Rejecting what is not a number is the useful half.
    return /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : undefined;
  }

  // short_text and long_text take the text as given. Length is already capped
  // by the schema at the edge.
  return single;
}
