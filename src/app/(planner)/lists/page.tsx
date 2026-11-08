import { getPeople } from "@/server/queries/people";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListsSidebar } from "@/components/lists/lists-sidebar";
import { NewListForm } from "@/components/lists/new-list-form";
import { SmartView } from "@/components/lists/smart-view";
import { SubTabs } from "@/components/sub-tabs";
import { TASKS_TABS } from "@/lib/nav-tabs";
import { MoreMenu, SectionPanel } from "@/components/shell/more-menu";
import { ListAppearanceEditor } from "@/components/settings/list-appearance-editor";
import {
  getAllItems,
  getAssignedToMeItems,
  getAssignedToPersonItems,
  getFlaggedItems,
  getListTemplates,
  getLists,
  getOpenItemCounts,
  getScheduledItems,
  getOverdueItems,
  getTodayItems,
  type ListItemWithList,
} from "@/server/queries/lists";
import { getCollaborators, getPlannerPersonId, getSessionUser, getViewerKind, requireWedding } from "@/server/queries/wedding";

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
  searchParams: Promise<{ view?: string; panel?: string }>;
}) {
  const { view: rawView, panel } = await searchParams;
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
        return getTodayItems(wedding.id, wedding.timezone);
      case "scheduled":
        return getScheduledItems(wedding.id);
      case "flagged":
        return getFlaggedItems(wedding.id);
      case "all":
        return getAllItems(wedding.id);
      case "mine":
        return userPromise.then(async (u) => {
          if (!u) return null;
          // A planner's tasks are handed to their `people` row, not to a login (spec 39).
          const personId = await getPlannerPersonId();
          return personId ? getAssignedToPersonItems(wedding.id, personId) : getAssignedToMeItems(wedding.id, u.id);
        });
    }
  })();

  const overduePromise: Promise<ListItemWithList[]> = view === "today" ? getOverdueItems(wedding.id, wedding.timezone) : Promise.resolve([]);

  const [lists, templates, collaborators, people, openCounts, user, items, overdueItems] = await Promise.all([
    getLists(wedding.id),
    getListTemplates(),
    getCollaborators(wedding.id),
    getPeople(wedding.id),
    getOpenItemCounts(wedding.id),
    userPromise,
    itemsPromise,
    overduePromise,
  ]);

  // "Assigned to me" is meaningless without a session; every other view has
  // already resolved to a real (possibly empty) list by here.
  if (items === null) notFound();

  // List appearance moved here from Settings (spec 41 §4.4), still couple-only as it was there.
  const isCouple = (await getViewerKind()) !== "planner";
  const viewHref = view === "today" ? "/lists" : `/lists?view=${view}`;
  const panelHref = `${viewHref}${viewHref.includes("?") ? "&" : "?"}panel=appearance`;
  const showAppearance = isCouple && panel === "appearance";

  return (
    <div className="space-y-4">
      <SubTabs tabs={TASKS_TABS} />
      {showAppearance ? (
        <SectionPanel id="list-appearance" title="List appearance" doneHref={viewHref}>
          <ListAppearanceEditor lists={lists} />
        </SectionPanel>
      ) : null}
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
              <MoreMenu
                label="More for Tasks"
                items={isCouple ? [{ href: panelHref, label: "List appearance" }] : []}
              />
            </div>
          </div>
          <SmartView view={view} items={items} overdueItems={overdueItems} collaborators={collaborators} people={people} currentUserId={user?.id} timezone={wedding.timezone} />
        </div>
      </div>
    </div>
  );
}
