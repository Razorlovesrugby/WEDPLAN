import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { getGuestQuestions } from "@/server/queries/site-extras";
import { GuestQuestionList } from "@/components/site/editor/guest-question-list";

export const metadata = { title: "Guest questions" };

/**
 * What guests asked through "Ask a question" under the FAQ. Private to the
 * couple: nothing here is ever shown on the site.
 */
export default async function GuestQuestionsPage() {
  const wedding = await requireWedding();
  const questions = await getGuestQuestions(wedding.id);
  const waiting = questions.filter((question) => question.status === "new").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Guest questions</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {questions.length === 0
              ? "Nothing yet. Guests ask from the button under your FAQ."
              : `${waiting} waiting for an answer · ${questions.length} in all. Only you can see these — if a question keeps coming up, add it to your FAQ.`}
          </p>
        </div>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      <GuestQuestionList
        rows={questions.map((question) => ({
          id: question.id,
          body: question.body,
          status: question.status,
          createdAt: question.created_at,
          // A household we know beats whatever was typed.
          authorName: question.householdName ?? question.author_name,
          contact: question.contact,
        }))}
      />
    </div>
  );
}
