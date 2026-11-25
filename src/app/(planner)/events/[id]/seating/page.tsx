import Link from "next/link";
import { notFound } from "next/navigation";
import { SeatingScreen } from "@/components/seating/seating-screen";
import { parseColourBy } from "@/lib/seating/colour";
import { signPath } from "@/lib/supabase/storage";
import { getSeatingDayActivity, getSeatingPlan, listSeatingSnapshots } from "@/server/queries/seating";
import { getCollaborators, getEvents, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Seating" };

export default async function EventSeatingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ colour?: string; layout?: string }>;
}) {
  const { id } = await params;
  const { colour, layout } = await searchParams;
  const wedding = await requireWedding();
  const events = await getEvents(wedding.id);
  const event = events.find((e) => e.id === id);
  if (!event) notFound();

  if (!event.has_seating) {
    return (
      <div className="max-w-2xl space-y-4">
        <nav className="text-sm text-muted">
          <Link href="/events" className="hover:underline">
            Events
          </Link>
        </nav>
        <h1 className="font-serif text-2xl">{event.name} — seating</h1>
        <p className="card p-6 text-sm">
          Seating is off for this event.{" "}
          <Link href="/events" className="underline">
            Turn it on
          </Link>{" "}
          under Edit → What this event needs. Any plan you made before is kept.
        </p>
      </div>
    );
  }

  const data = await getSeatingPlan(wedding.id, id, layout);
  const [snapshots, collaborators, dayActivity] = await Promise.all([
    listSeatingSnapshots(wedding.id, id, data.layoutId),
    getCollaborators(wedding.id),
    getSeatingDayActivity(wedding.id),
  ]);
  // Signed here, not in the query: the print page and the CSV share the query and never draw the image.
  const backgroundUrl = data.plan?.background_path ? await signPath(data.plan.background_path) : null;

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted">
        <Link href="/seating" className="hover:underline">
          Seating plans
        </Link>
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">{event.name} — seating</h1>
        <span className="text-sm text-muted">{event.venue ?? "No venue set"}</span>
      </div>

      <SeatingScreen
        eventId={id}
        timeZone={wedding.timezone}
        data={{ ...data, backgroundUrl }}
        snapshots={snapshots}
        dayActivity={dayActivity}
        collaborators={collaborators.map((c) => ({ user_id: c.user_id, display_name: c.display_name, role: c.role }))}
        initialColourBy={parseColourBy(colour ?? data.plan?.colour_by)}
      />
    </div>
  );
}
