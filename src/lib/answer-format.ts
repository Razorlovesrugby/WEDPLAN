import type { Json, QuestionType } from "./types/database";

/**
 * Render a stored RSVP answer for display. The inverse of coerceAnswer in
 * rsvp-answers.ts, which decides what gets stored in the first place — this
 * only formats what is already there.
 */
export function formatAnswerValue(value: Json, type: QuestionType): string {
  if (value === null || value === undefined) return "—";

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(", ") : "—";
  }

  if (type === "boolean") {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
  }

  return String(value);
}
