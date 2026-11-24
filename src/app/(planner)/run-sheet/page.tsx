import { RunSheetView } from "@/components/run-sheet/run-sheet-view";
import { SubTabs } from "@/components/sub-tabs";
import { RUN_SHEET_TABS } from "@/lib/nav-tabs";
import { parseRunSheetParams } from "@/lib/run-sheet/view-params";
import { getRunSheet } from "@/server/queries/run-sheet";
import { getEvents, getSessionUser, getViewerKind, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Run sheet" };

/** The schedule: By the hour or a list, narrowed by `?who=` and `?event=` (spec 56 §6.2). */
export default async function RunSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; who?: string; event?: string }>;
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
      <h1 className="font-serif text-2xl">Run sheet</h1>
      <RunSheetView
        mode="schedule"
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
