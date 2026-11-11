import Link from "next/link";
import { ANSWERED, BLANK, NOT_REPLIED, type Tally } from "@/lib/questions/tally";
import type { QuestionType } from "@/lib/types/database";

/**
 * One question's results in a line or two (spec 49 §4.2). Every number is a
 * link to the people behind it, on the question's own results screen.
 */
export function AnswerSummary({
  questionId,
  type,
  tally,
}: {
  questionId: string;
  type: QuestionType;
  tally: Tally;
}) {
  const href = (key?: string) =>
    `/questions/${questionId}/answers${key ? `?answer=${encodeURIComponent(key)}` : ""}`;
  const largest = Math.max(1, ...tally.buckets.map((bucket) => bucket.count));
  const choice = type === "single_select" || type === "multi_select";

  return (
    <div className="mt-2 space-y-1.5 text-sm">
      {choice && tally.buckets.length > 0 ? (
        <ul className="max-w-lg space-y-1">
          {tally.buckets.map((bucket) => (
            <li key={bucket.key}>
              <Link href={href(bucket.key)} className="group flex items-center gap-2">
                <span className="w-32 shrink-0 truncate group-hover:underline sm:w-48" title={bucket.label}>
                  {bucket.label}
                </span>
                <span className="relative h-2 min-w-0 flex-1 rounded-full bg-line/60" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-ink/70"
                    style={{ width: `${(bucket.count / largest) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums">{bucket.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="flex flex-wrap gap-x-3 gap-y-1">
        {type === "boolean"
          ? tally.buckets.map((bucket) => (
              <Link key={bucket.key} href={href(bucket.key)} className="font-medium hover:underline">
                {bucket.label} <span className="tabular-nums">{bucket.count}</span>
              </Link>
            ))
          : null}
        {type !== "boolean" ? (
          <Link href={href(ANSWERED)} className="font-medium hover:underline">
            Answered <span className="tabular-nums">{tally.answered}</span>
          </Link>
        ) : null}
        {tally.numbers ? (
          <span className="text-muted">
            Total <span className="tabular-nums">{tally.numbers.total}</span>
            {tally.numbers.min !== tally.numbers.max
              ? ` · ${tally.numbers.min}–${tally.numbers.max} each`
              : null}
          </span>
        ) : null}
        <Link href={href(BLANK)} className="text-muted hover:underline">
          Left blank <span className="tabular-nums">{tally.blank}</span>
        </Link>
        <Link href={href(NOT_REPLIED)} className="text-muted hover:underline">
          Not replied yet <span className="tabular-nums">{tally.notReplied}</span>
        </Link>
        <Link href={href()} className="text-muted underline">
          See answers →
        </Link>
      </p>
    </div>
  );
}
