import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { listRevisions } from "@/server/queries/site-blocks";
import { RevisionList } from "@/components/site/editor/revision-list";

export const metadata = { title: "Site history" };

/**
 * What guests have been shown, and how to go back (spec 23 Q4).
 *
 * The last twenty publishes. Restoring puts a version back into the **draft**
 * rather than straight onto the site: the planner looks at it, then publishes,
 * which is the same deliberate act as any other change. An undo that
 * publishes itself is not an undo.
 */
export default async function SiteHistoryPage() {
  const wedding = await requireWedding();
  const revisions = await listRevisions(wedding.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Published versions</h1>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      {revisions.length === 0 ? (
        <p className="text-sm text-muted">Nothing published yet.</p>
      ) : (
        <RevisionList revisions={revisions} />
      )}

      <p className="text-xs text-muted">
        The last twenty are kept. Restoring loads that version into your draft — nothing changes for
        guests until you publish it.
      </p>
    </div>
  );
}
