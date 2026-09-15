import { QuestionsEditor } from "@/components/questions/questions-editor";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import type { RsvpQuestionRow } from "@/lib/types/database";

export const metadata = { title: "RSVP questions" };

export default async function QuestionsPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // Inactive questions are listed too — this is the screen for managing them,
  // and one that has been switched off still needs to be findable to switch
  // back on. The RSVP form's own query filters to active.
  const { data, error } = await supabase
    .from("rsvp_questions")
    .select("*")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load questions: ${error.message}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">RSVP questions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Extra questions on the RSVP form, on top of dietary requirements and access needs, which
          everyone is always asked. Per guest for anything about the person; per household for
          anything a family answers once.
        </p>
      </div>

      <QuestionsEditor questions={(data ?? []) as RsvpQuestionRow[]} />
    </div>
  );
}
