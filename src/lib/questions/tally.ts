import type { Json, QuestionScope, QuestionType } from "@/lib/types/database";

/**
 * Counting RSVP answers for one question (spec 49 §4.2).
 *
 * "In scope" is who could have answered: for a per-guest question, every
 * guest invited to at least one event; for a per-household question, every
 * household with such a guest. Soft-deleted guests are never in scope. An
 * answer from someone out of scope is not counted, the same rule the
 * catering export uses for a yes from someone since taken off an event.
 */

export type TallyQuestion = {
  type: QuestionType;
  scope: QuestionScope;
  options: Json;
};

export type TallyAnswer = {
  guest_id: string | null;
  household_id: string | null;
  value: Json;
};

/** Filter keys for "who said this". Option keys are the option text itself. */
export const BLANK = "__blank";
export const NOT_REPLIED = "__not_replied";
export const OTHER = "__other";
/** Anyone who gave a real answer, whatever it was. */
export const ANSWERED = "__answered";

export type TallyBucket = { key: string; label: string; count: number };

export type Tally = {
  /** Yes/no and option counts, in the question's own order. Empty for text and number. */
  buckets: TallyBucket[];
  /** Gave an actual answer (not blank). */
  answered: number;
  /** Sent the RSVP with this left empty. */
  blank: number;
  /** In scope with no answer row at all. */
  notReplied: number;
  /** For number questions with at least one answer. */
  numbers: { total: number; min: number; max: number } | null;
};

export function optionsOf(question: Pick<TallyQuestion, "options">): string[] {
  return Array.isArray(question.options) ? question.options.map(String) : [];
}

/** The subject an answer belongs to, under the question's scope. */
export function subjectOf(scope: QuestionScope, answer: TallyAnswer): string | null {
  return scope === "guest" ? answer.guest_id : answer.household_id;
}

function isBlank(value: Json): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/**
 * Which filter keys one answer falls under. A multi-select answer can be
 * under several; an answer to an option since removed from the question is
 * under OTHER. Text and number answers have no option key.
 */
export function answerKeys(question: TallyQuestion, value: Json): string[] {
  if (isBlank(value)) return [BLANK];
  if (question.type === "boolean") {
    return value === "yes" || value === "no" ? [value] : [OTHER];
  }
  if (question.type === "single_select" || question.type === "multi_select") {
    const options = optionsOf(question);
    const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
    const keys = new Set(chosen.map((choice) => (options.includes(choice) ? choice : OTHER)));
    return [...keys];
  }
  return [];
}

function emptyBuckets(question: TallyQuestion): TallyBucket[] {
  if (question.type === "boolean") {
    return [
      { key: "yes", label: "Yes", count: 0 },
      { key: "no", label: "No", count: 0 },
    ];
  }
  if (question.type === "single_select" || question.type === "multi_select") {
    return optionsOf(question).map((option) => ({ key: option, label: option, count: 0 }));
  }
  return [];
}

export function tallyQuestion(
  question: TallyQuestion,
  answers: readonly TallyAnswer[],
  inScope: ReadonlySet<string>,
): Tally {
  const buckets = emptyBuckets(question);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const seen = new Set<string>();
  let answered = 0;
  let blank = 0;
  const numbers: number[] = [];

  for (const answer of answers) {
    const subject = subjectOf(question.scope, answer);
    if (!subject || !inScope.has(subject) || seen.has(subject)) continue;
    seen.add(subject);

    if (isBlank(answer.value)) {
      blank++;
      continue;
    }
    answered++;

    for (const key of answerKeys(question, answer.value)) {
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = { key: OTHER, label: "Other", count: 0 };
        byKey.set(OTHER, bucket);
        buckets.push(bucket);
      }
      bucket.count++;
    }

    if (question.type === "number") {
      const n = Number(answer.value);
      if (Number.isFinite(n)) numbers.push(n);
    }
  }

  return {
    buckets,
    answered,
    blank,
    notReplied: inScope.size - seen.size,
    numbers:
      numbers.length > 0
        ? {
            total: numbers.reduce((sum, n) => sum + n, 0),
            min: Math.min(...numbers),
            max: Math.max(...numbers),
          }
        : null,
  };
}

/** Who a question asks: guest ids for a per-guest question, household ids for a per-household one. */
export function scopeIds(
  scope: QuestionScope,
  guests: readonly { id: string; household_id: string }[],
): Set<string> {
  return new Set(guests.map((guest) => (scope === "guest" ? guest.id : guest.household_id)));
}
