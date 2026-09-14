import { EventsEditor } from "@/components/invitations/events-editor";
import { getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Events" };

export default async function EventsPage() {
  const wedding = await requireWedding();
  const events = await getEvents(wedding.id);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-serif text-2xl">Events</h1>
      <p className="text-sm text-muted">
        Times are the venue&rsquo;s local time ({wedding.timezone}), whoever is typing and wherever
        they are. Which households are invited to which event is set on the invitations screen.
      </p>
      <EventsEditor events={events} timeZone={wedding.timezone} />
    </div>
  );
}
