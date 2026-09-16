import Link from "next/link";
import { notFound } from "next/navigation";
import { RunSheetView } from "@/components/run-sheet/run-sheet-view";
import { listRunSheetItems } from "@/server/queries/run-sheet";
import { getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Run sheet" };

export default async function EventRunSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();
  const events = await getEvents(wedding.id);
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  const items = await listRunSheetItems(wedding.id, id);

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted">
        <Link href="/run-sheet" className="hover:underline">
          Run sheets
        </Link>
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">{event.name} — run sheet</h1>
        <span className="text-sm text-muted">{event.venue ?? "No venue set"}</span>
      </div>

      <p className="max-w-2xl text-sm text-muted">
        Pinned items carry a real time and never move on their own. Everything else chains off
        whatever comes before it — move a pinned anchor and the rest recomputes.
      </p>

      <RunSheetView eventId={id} timeZone={wedding.timezone} items={items} />
    </div>
  );
}
