import { RunSheetView } from "@/components/run-sheet/run-sheet-view";
import { SubTabs } from "@/components/sub-tabs";
import { RUN_SHEET_TABS } from "@/lib/nav-tabs";
import { parseRunSheetParams } from "@/lib/run-sheet/view-params";
import { getRunSheet } from "@/server/queries/run-sheet";
import { getEvents, getSessionUser, getViewerKind, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Who's doing what" };

/** One row per person with their jobs along the day; `?who=` scrolls to and marks a person (spec 56 §6.2). */
export default async function RunSheetPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string }>;
}) {
  const params = parseRunSheetParams(await searchParams);
  const wedding = await requireWedding();
  const user = await getSessionUser();
  const [{ items, options, contacts, groups, linkStates }, events, kind] = await Promise.all([
    getRunSheet(wedding.id, user?.id),
    getEvents(wedding.id),
    getViewerKind(),
  ]);

  return (
    <div className="space-y-4">
      <SubTabs tabs={RUN_SHEET_TABS} />
      <h1 className="font-serif text-2xl">Who&rsquo;s doing what</h1>
      <RunSheetView
        mode="people"
        params={params}
        items={items}
        options={options}
        contacts={contacts}
        groups={groups}
        linkStates={linkStates}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        timeZone={wedding.timezone}
        weddingDate={wedding.wedding_date}
        canAddPeople={kind !== "planner"}
      />
    </div>
  );
}
