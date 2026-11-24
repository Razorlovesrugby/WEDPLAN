import Link from "next/link";
import { RunSheetView } from "@/components/run-sheet/run-sheet-view";
import { getRunSheet } from "@/server/queries/run-sheet";
import { getEvents, getSessionUser, getViewerKind, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Run sheet" };

export default async function RunSheetPage() {
  const wedding = await requireWedding();
  const user = await getSessionUser();
  const [{ items, options, contacts, groups, linkStates }, events, kind] = await Promise.all([
    getRunSheet(wedding.id, user?.id),
    getEvents(wedding.id),
    getViewerKind(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Run sheet</h1>
        <Link href="/run-sheet/links" className="btn">
          Day links →
        </Link>
      </div>
      <RunSheetView
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
