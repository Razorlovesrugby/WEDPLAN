import { Suspense } from "react";
import { TimelineView } from "@/components/lists/timeline-view";
import { getTimelineItems } from "@/server/queries/lists";
import { getBudgetLinksForListItems } from "@/server/queries/budget-links";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const wedding = await requireWedding();
  const items = await getTimelineItems(wedding.id);
  const budgetLinksMap = await getBudgetLinksForListItems(
    wedding.id,
    items.map((i) => i.id),
  );
  const budgetLinksByItem = Object.fromEntries(budgetLinksMap);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">Timeline</h1>
      <Suspense>
        <TimelineView items={items} budgetLinksByItem={budgetLinksByItem} />
      </Suspense>
    </div>
  );
}
