import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerSummary } from "@/components/questions/answer-summary";
import { formatAnswerValue } from "@/lib/answer-format";
import { formatDateTime } from "@/lib/format";
import {
  ANSWERED,
  BLANK,
  NOT_REPLIED,
  OTHER,
  answerKeys,
  scopeIds,
  subjectOf,
  tallyQuestion,
} from "@/lib/questions/tally";
import { getAnswersOverview } from "@/server/queries/questions";
import { requireWedding } from "@/server/queries/wedding";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ answer?: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const wedding = await requireWedding();
  const { questions } = await getAnswersOverview(wedding.id);
  const question = questions.find((q) => q.id === id);
  return { title: question ? `${question.label} · Answers` : "Answers" };
}

/**
 * One question's results and everyone's answer to it (spec 49 §4.1). The
 * `answer` filter is a key from lib/questions/tally: an option, yes/no,
 * BLANK, NOT_REPLIED or OTHER.
 */
export default async function QuestionAnswersPage({ params, searchParams }: Params) {
  const [{ id }, { answer: filter }] = await Promise.all([params, searchParams]);
  const wedding = await requireWedding();
  const overview = await getAnswersOverview(wedding.id);
  const question = overview.questions.find((q) => q.id === id);
  if (!question) notFound();

  const answers = overview.answers.filter((a) => a.question_id === question.id);
  const inScope = scopeIds(question.scope, overview.guests);
  const tally = tallyQuestion(question, answers, inScope);

  const bySubject = new Map(
    answers.map((a) => [subjectOf(question.scope, a), a] as const).filter(([s]) => s !== null),
  );
  const subjects =
    question.scope === "guest"
      ? overview.guests.map((g) => ({
          id: g.id,
          name: g.name,
          household: g.household_name,
          href: `/guests/${g.id}`,
        }))
      : overview.households
          .map((h) => ({ id: h.id, name: h.name, household: null, href: `/households/${h.id}` }))
          .sort((a, b) => a.name.localeCompare(b.name));

  const rows = subjects
    .map((subject) => {
      const answer = bySubject.get(subject.id);
      const keys = answer ? answerKeys(question, answer.value) : [NOT_REPLIED];
      const shown = !answer
        ? "Not replied yet"
        : keys.includes(BLANK)
          ? "Left blank"
          : formatAnswerValue(answer.value, question.type);
      return { ...subject, answer, keys, shown };
    })
    .filter((row) => !filter || row.keys.includes(filter) || (filter === ANSWERED && !!row.answer && !row.keys.includes(BLANK)));

  // Grouped by what they said: answers first, then blanks, then no reply.
  const rank = (row: (typeof rows)[number]) =>
    row.keys.includes(NOT_REPLIED) ? 2 : row.keys.includes(BLANK) ? 1 : 0;
  rows.sort((a, b) => rank(a) - rank(b) || a.shown.localeCompare(b.shown) || a.name.localeCompare(b.name));

  const filterLabel =
    filter === ANSWERED
      ? "Answered"
      : filter === BLANK
      ? "Left blank"
      : filter === NOT_REPLIED
        ? "Not replied yet"
        : filter === OTHER
          ? "Other"
          : filter
            ? (tally.buckets.find((b) => b.key === filter)?.label ?? filter)
            : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/questions" className="text-sm text-muted hover:underline">
          ← RSVP questions
        </Link>
        <h1 className="mt-1 font-serif text-2xl">{question.label}</h1>
        <p className="mt-1 text-sm text-muted">
          {question.scope === "guest" ? "Asked once per guest" : "Asked once per household"}
          {" · "}counted for everyone invited to at least one event.
        </p>
        <AnswerSummary questionId={question.id} type={question.type} tally={tally} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {filterLabel ? (
            <>
              Showing <strong>{filterLabel}</strong> ({rows.length}) ·{" "}
              <Link href={`/questions/${question.id}/answers`} className="underline">
                Show everyone
              </Link>
            </>
          ) : (
            <>Everyone ({rows.length})</>
          )}
        </p>
        <a className="btn" href="/api/export/answers" download>
          Download all answers (CSV)
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="card p-5 text-sm text-muted">Nobody here yet.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 p-3 text-sm">
              <div className="min-w-0">
                <Link href={row.href} className="font-medium hover:underline">
                  {row.name}
                </Link>
                {row.household ? <span className="ml-2 text-xs text-muted">{row.household}</span> : null}
              </div>
              <div className="min-w-0 text-right">
                <span className={row.answer && !row.keys.includes(BLANK) ? "" : "text-muted"}>
                  {row.shown}
                </span>
                {row.answer ? (
                  <span className="ml-2 text-xs text-muted">
                    {formatDateTime(row.answer.answered_at, wedding.timezone)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
