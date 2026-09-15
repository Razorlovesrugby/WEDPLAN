import { formatAnswerValue } from "@/lib/answer-format";
import type { AnsweredQuestion } from "@/server/queries/questions";

export function AnswerList({ answers, empty }: { answers: AnsweredQuestion[]; empty: string }) {
  if (answers.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }

  return (
    <dl className="space-y-2 text-sm">
      {answers.map(({ question, value }) => (
        <div key={question.id}>
          <dt className="text-muted">{question.label}</dt>
          <dd>{formatAnswerValue(value, question.type)}</dd>
        </div>
      ))}
    </dl>
  );
}
