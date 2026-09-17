import { Suspense } from "react";
import { TimelineView } from "@/components/lists/timeline-view";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { getLists, getTimelineItems } from "@/server/queries/lists";
import { getBudgetLinksForLists } from "@/server/queries/budget-links";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const wedding = await requireWedding();

  // `v_timeline_items` is already scoped to non-archived lists, and so is
  // `getLists`, so the budget badges can be fetched by list alongside the
  // items rather than waiting for them to come back first.
  const lists = await getLists(wedding.id);
  const [items, budgetLinksMap] = await Promise.all([
    getTimelineItems(wedding.id),
    getBudgetLinksForLists(
      wedding.id,
      lists.map((l) => l.id),
    ),
  ]);
  const budgetLinksByItem = Object.fromEntries(budgetLinksMap);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <h1 className="font-serif text-2xl">Timeline</h1>
      <Suspense>
        <TimelineView items={items} budgetLinksByItem={budgetLinksByItem} timezone={wedding.timezone} />
      </Suspense>
    </div>
  );
}
