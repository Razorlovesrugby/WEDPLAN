import Link from "next/link";
import { EventsEditor } from "@/components/invitations/events-editor";
import { listInvitations } from "@/server/queries/invitations";
import { getEvents, getViewerKind, requireWedding } from "@/server/queries/wedding";
import { journeyHref } from "@/lib/invitations/journey";
import { pluralise } from "@/lib/format";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const wedding = await requireWedding();
  // Who's invited lives under Invitations, which a planner login can't open
  // (spec 39), so only the couple gets the counts and the link (spec 42 §5.6).
  const isCouple = (await getViewerKind()) !== "planner";
  const [events, invitations] = await Promise.all([
    getEvents(wedding.id),
    isCouple ? listInvitations(wedding.id) : Promise.resolve([]),
  ]);
  const invitedCount = (eventId: string) =>
    invitations.filter((row) => row.invitedEventIds.includes(eventId)).length;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-serif text-2xl">Events</h1>
      <p className="text-sm text-muted">
        Times are the venue&rsquo;s local time ({wedding.timezone}), whoever is typing and wherever
        they are.
      </p>
      {isCouple && events.length > 0 ? (
        <section aria-labelledby="invited" className="card p-4 text-sm">
          <h2 id="invited" className="text-sm font-medium uppercase tracking-wide text-muted">
            Who&rsquo;s invited
          </h2>
          <ul className="mt-2 space-y-1">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{event.name}</span>
                <Link href={journeyHref("invitation", "who")} className="underline">
                  Invited: {pluralise(invitedCount(event.id), "household")} → Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <EventsEditor events={events} timeZone={wedding.timezone} />
    </div>
  );
}
