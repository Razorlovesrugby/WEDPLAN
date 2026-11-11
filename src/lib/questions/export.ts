import { formatAnswerValue } from "@/lib/answer-format";
import type { Json, QuestionScope, QuestionType } from "@/lib/types/database";

/**
 * The answers CSV (spec 49 §4.3): one row per guest invited to at least one
 * event, one column per question. A per-household answer repeats on each
 * member's row; a multi-select is joined with "; ". Blank and no reply are
 * both an empty cell.
 */
export function answersCsv(
  questions: readonly { id: string; label: string; type: QuestionType; scope: QuestionScope }[],
  answers: readonly { question_id: string; guest_id: string | null; household_id: string | null; value: Json }[],
  guests: readonly { id: string; name: string; household_id: string; household_name: string }[],
): { header: string[]; rows: string[][] } {
  const byKey = new Map<string, Json>();
  for (const a of answers) {
    const subject = a.guest_id ?? a.household_id;
    if (subject) byKey.set(`${a.question_id}:${subject}`, a.value);
  }

  const cell = (q: (typeof questions)[number], value: Json | undefined): string => {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) return value.map(String).join("; ");
    const shown = formatAnswerValue(value, q.type);
    return shown === "—" ? "" : shown;
  };

  return {
    header: ["Name", "Household", ...questions.map((q) => q.label)],
    rows: guests.map((g) => [
      g.name,
      g.household_name,
      ...questions.map((q) => cell(q, byKey.get(`${q.id}:${q.scope === "guest" ? g.id : g.household_id}`))),
    ]),
  };
}
