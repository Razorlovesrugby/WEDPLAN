import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { NewListForm } from "@/components/lists/new-list-form";
import { SmartView } from "@/components/lists/smart-view";
import {
  getAllItems,
  getAssignedToMeItems,
  getFlaggedItems,
  getListTemplates,
  getLists,
  getScheduledItems,
  getTodayItems,
} from "@/server/queries/lists";
import { getCollaborators, getSessionUser, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Lists" };

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
  const [lists, templates, collaborators, user] = await Promise.all([
    getLists(wedding.id),
    getListTemplates(),
    getCollaborators(wedding.id),
    getSessionUser(),
  ]);

  const items = await (async () => {
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
        if (!user) notFound();
        return getAssignedToMeItems(wedding.id, user.id);
    }
  })();

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <ListsSidebar lists={lists} />
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-serif text-2xl">{TITLES[view]}</h1>
          <NewListForm templates={templates} />
        </div>
        <SmartView view={view} items={items} collaborators={collaborators} currentUserId={user?.id} />
      </div>
    </div>
  );
}
