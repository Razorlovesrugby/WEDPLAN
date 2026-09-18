import Link from "next/link";
import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { NewListForm } from "@/components/lists/new-list-form";
import { SmartView } from "@/components/lists/smart-view";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import {
  getAllItems,
  getAssignedToMeItems,
  getFlaggedItems,
  getListTemplates,
  getLists,
  getOpenItemCounts,
  getScheduledItems,
  getTodayItems,
  type ListItemWithList,
} from "@/server/queries/lists";
import { getCollaborators, getSessionUser, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Tasks" };

const VIEWS = ["today", "scheduled", "flagged", "all", "mine"] as const;
type View = (typeof VIEWS)[number];

const TITLES: Record<View, string> = {
  today: "Today",
  scheduled: "Scheduled",
  flagged: "Flagged",
  all: "All",
  mine: "Assigned to me",
};

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: rawView } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as View) : "today";

  const wedding = await requireWedding();

  // Only the "mine" view needs the signed-in user before it can query, so
  // the items fetch is kicked off alongside the rest rather than after it —
  // four of the five views were paying a full serial round trip for a
  // dependency they never had.
  const userPromise = getSessionUser();
  const itemsPromise: Promise<ListItemWithList[] | null> = (() => {
    switch (view) {
      case "today":
        return getTodayItems(wedding.id);
      case "scheduled":
        return getScheduledItems(wedding.id);
      case "flagged":
        return getFlaggedItems(wedding.id);
      case "all":
        return getAllItems(wedding.id);
      case "mine":
        return userPromise.then((u) => (u ? getAssignedToMeItems(wedding.id, u.id) : null));
    }
  })();

  const [lists, templates, collaborators, openCounts, user, items] = await Promise.all([
    getLists(wedding.id),
    getListTemplates(),
    getCollaborators(wedding.id),
    getOpenItemCounts(wedding.id),
    userPromise,
    itemsPromise,
  ]);

  // "Assigned to me" is meaningless without a session; every other view has
  // already resolved to a real (possibly empty) list by here.
  if (items === null) notFound();

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <ListsSidebar lists={lists} openCounts={openCounts} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-serif text-2xl">{TITLES[view]}</h1>
            <div className="flex items-center gap-2">
              <Link href="/api/export/tasks" className="btn" prefetch={false}>
                Export CSV
              </Link>
              <NewListForm templates={templates} />
            </div>
          </div>
          <SmartView view={view} items={items} collaborators={collaborators} currentUserId={user?.id} />
        </div>
      </div>
    </div>
  );
}
