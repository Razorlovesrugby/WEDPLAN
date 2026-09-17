import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { ListDetail } from "@/components/lists/list-detail";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { getListDetail, getLists } from "@/server/queries/lists";
import { getBudgetLinksForLists } from "@/server/queries/budget-links";
import { getCollaborators, getSessionUser, requireWedding } from "@/server/queries/wedding";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  // The budget badges are scoped by list, and the list id is already in the
  // URL — so they join this batch instead of costing a second serial round
  // trip once `detail.items` has come back.
  const [lists, detail, collaborators, user, budgetLinksMap] = await Promise.all([
    getLists(wedding.id),
    getListDetail(wedding.id, id),
    getCollaborators(wedding.id),
    getSessionUser(),
    getBudgetLinksForLists(wedding.id, [id]),
  ]);

  if (!detail) notFound();

  const budgetLinksByItem = Object.fromEntries(budgetLinksMap);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <ListsSidebar lists={lists} />
        <div className="min-w-0 flex-1">
          <Suspense>
            <ListDetail
              list={detail.list}
              sections={detail.sections}
              items={detail.items}
              collaborators={collaborators}
              currentUserId={user?.id}
              budgetLinksByItem={budgetLinksByItem}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
