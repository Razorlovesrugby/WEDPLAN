import { DesignFrame } from "@/components/design/design-frame";
import { getPreviewHouseholds } from "@/server/queries/design";
import Link from "next/link";
import { QuestionsEditor } from "@/components/questions/questions-editor";
import { requireWedding } from "@/server/queries/wedding";
import { getAnswersOverview } from "@/server/queries/questions";
import { scopeIds, tallyQuestion, type Tally } from "@/lib/questions/tally";

export const metadata = { title: "RSVP questions" };

export default async function QuestionsPage() {
  const wedding = await requireWedding();
  const households = await getPreviewHouseholds(wedding.id);
  // Inactive questions are listed too — this is the screen for managing them,
  // and one that has been switched off still needs to be findable to switch
  // back on. The RSVP form's own query filters to active.
  const overview = await getAnswersOverview(wedding.id);

  // Each question's results, shown under it (spec 49 §4.1).
  const tallies: Record<string, Tally> = {};
  for (const question of overview.questions) {
    tallies[question.id] = tallyQuestion(
      question,
      overview.answers.filter((answer) => answer.question_id === question.id),
      scopeIds(question.scope, overview.guests),
    );
  }

  return (
    <DesignFrame preview={{ households, anchor: "rsvp" }}>
      <div>
        <h1 className="font-serif text-2xl">RSVP questions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Extra questions on the RSVP form, on top of dietary requirements and access needs, which
          everyone is always asked. Per guest for anything about the person; per household for
          anything a family answers once.{" "}
          <Link href="/invitations" className="underline">
            See who&rsquo;s been sent one →
          </Link>
        </p>
      </div>

      <QuestionsEditor questions={overview.questions} tallies={tallies} />
    </DesignFrame>
  );
}
