import Link from "next/link";
import { redirect } from "next/navigation";
import { getEventIdsWithRunSheetItems } from "@/server/queries/run-sheet";
import { getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Run sheets" };

/**
 * Redirects straight to the one event with items, or offers a picker —
 * spec 5, B4. A run sheet is scoped per event (B6, decision 1), so with
 * more than one event that has items there is no single "the" run sheet to
 * land on.
 */
export default async function RunSheetPickerPage() {
  const wedding = await requireWedding();
  const [events, eventIdsWithItems] = await Promise.all([
    getEvents(wedding.id),
    getEventIdsWithRunSheetItems(wedding.id),
  ]);

  const withItems = events.filter((e) => eventIdsWithItems.has(e.id));

  if (withItems.length === 1) {
    redirect(`/events/${withItems[0]!.id}/run-sheet`);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-serif text-2xl">Run sheets</h1>
      <p className="text-sm text-muted">
        Each event gets its own independent day-of schedule — pick one, or start a new one below.
      </p>

      {events.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          No events yet.{" "}
          <Link href="/events" className="underline">
            Add one first
          </Link>
          .
        </p>
      ) : (
        <ul className="card divide-y divide-line">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}/run-sheet`}
                className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper"
              >
                <span>{event.name}</span>
                <span className="text-xs text-muted">
                  {eventIdsWithItems.has(event.id) ? "Has a run sheet" : "Start a run sheet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
