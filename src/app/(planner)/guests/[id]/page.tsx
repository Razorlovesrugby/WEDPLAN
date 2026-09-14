import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { getGuest } from "@/server/queries/guests";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatRelative, guestName } from "@/lib/format";
import type { RsvpStatus } from "@/lib/types/database";

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();
  const [guest, events] = await Promise.all([getGuest(wedding.id, id), getEvents(wedding.id)]);

  if (!guest) notFound();

  const household = guest.households;
  const rsvps = new Map(
    (guest.rsvps ?? []).map((r) => [r.event_id, r as { status: RsvpStatus; responded_at: string | null }]),
  );

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted">
        <Link href="/guests" className="hover:underline">
          Guests
        </Link>
        {household ? (
          <>
            {" / "}
            <Link href={`/households/${household.id}`} className="hover:underline">
              {household.display_name}
            </Link>
          </>
        ) : null}
      </nav>

      <h1 className="font-serif text-2xl">{guestName(guest)}</h1>

      <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
        <GuestForm guest={guest} householdId={guest.household_id} />

        <aside className="card h-fit p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">RSVP history</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No events yet.</p>
          ) : (
            <dl className="mt-3 space-y-2 text-sm">
              {events.map((event) => {
                const rsvp = rsvps.get(event.id);
                return (
                  <div key={event.id} className="flex items-baseline justify-between gap-3">
                    <dt>{event.name}</dt>
                    <dd className="text-right">
                      <span
                        className={
                          rsvp?.status === "yes"
                            ? "text-tierA"
                            : rsvp?.status === "no"
                              ? "text-muted"
                              : rsvp?.status === "maybe"
                                ? "text-tierB"
                                : "text-muted"
                        }
                      >
                        {rsvp ? rsvp.status : "not invited"}
                      </span>
                      {rsvp?.responded_at ? (
                        <span className="block text-xs text-muted">
                          {formatRelative(rsvp.responded_at)}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </aside>
      </div>
    </div>
  );
}
