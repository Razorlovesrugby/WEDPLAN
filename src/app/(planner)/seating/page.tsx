import Link from "next/link";
import { redirect } from "next/navigation";
import { getEventIdsWithSeating } from "@/server/queries/seating";
import { getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Seating plans" };

/**
 * Straight to the one event with a plan (or the only event), or a picker —
 * the same shape as /run-sheet. A seating plan belongs to one event.
 */
export default async function SeatingPickerPage() {
  const wedding = await requireWedding();
  const [events, withTables] = await Promise.all([getEvents(wedding.id), getEventIdsWithSeating(wedding.id)]);

  const planned = events.filter((e) => withTables.has(e.id));
  if (planned.length === 1) redirect(`/events/${planned[0]!.id}/seating`);
  if (planned.length === 0 && events.length === 1) redirect(`/events/${events[0]!.id}/seating`);

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-serif text-2xl">Seating plans</h1>
      <p className="text-sm text-muted">Each event has its own plan — pick one.</p>

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
                href={`/events/${event.id}/seating`}
                className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper"
              >
                <span>{event.name}</span>
                <span className="text-xs text-muted">{withTables.has(event.id) ? "Has a plan" : "Start a plan"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
