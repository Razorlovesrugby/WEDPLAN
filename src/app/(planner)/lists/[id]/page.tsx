import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { ListDetail } from "@/components/lists/list-detail";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { getListDetail, getLists, getOpenItemCounts } from "@/server/queries/lists";
import { getBudgetLinksForLists, getBudgetLinksForSections } from "@/server/queries/budget-links";
import { getCollaborators, getSessionUser, requireWedding } from "@/server/queries/wedding";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  // The budget badges are scoped by list, and the list id is already in the
  // URL — so they join this batch instead of costing a second serial round
  // trip once `detail.items` has come back.
  const [lists, detail, collaborators, openCounts, user, budgetLinksMap] = await Promise.all([
    getLists(wedding.id),
    getListDetail(wedding.id, id),
    getCollaborators(wedding.id),
    getOpenItemCounts(wedding.id),
    getSessionUser(),
    getBudgetLinksForLists(wedding.id, [id]),
  ]);

  if (!detail) notFound();

  const budgetLinksByItem = Object.fromEntries(budgetLinksMap);

  // Section ids aren't known until `detail` has come back, unlike the list
  // id above — one unavoidable serial hop for the section-heading badge
  // (spec 16 §3).
  const budgetLinksBySection = Object.fromEntries(
    await getBudgetLinksForSections(
      wedding.id,
      detail.sections.map((s) => s.id),
    ),
  );

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <ListsSidebar lists={lists} openCounts={openCounts} />
        <div className="min-w-0 flex-1">
          <Suspense>
            <ListDetail
              list={detail.list}
              sections={detail.sections}
              items={detail.items}
              collaborators={collaborators}
              currentUserId={user?.id}
              budgetLinksByItem={budgetLinksByItem}
              budgetLinksBySection={budgetLinksBySection}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
