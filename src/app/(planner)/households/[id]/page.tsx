import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { HouseholdForm } from "@/components/guests/household-form";
import { HouseholdPicker } from "@/components/guests/household-picker";
import { AnswerList } from "@/components/questions/answer-list";
import { getHousehold, listHouseholds } from "@/server/queries/guests";
import { moveGuest, moveGuests } from "@/server/actions/guests";
import { getHouseholdAnswers } from "@/server/queries/questions";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatRelative, guestName, pluralise } from "@/lib/format";

export default async function HouseholdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();
  const [{ household, guests, invitation, summary }, events, answers, households] = await Promise.all([
    getHousehold(wedding.id, id),
    getEvents(wedding.id),
    getHouseholdAnswers(wedding.id, id),
    listHouseholds(wedding.id),
  ]);

  if (!household) notFound();

  const guestIds = guests.map((g) => g.id);

  const invitedEventIds = new Set(
    ((invitation?.invitation_events ?? []) as { event_id: string }[]).map((e) => e.event_id),
  );

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted">
        <Link href="/guests" className="hover:underline">
          Guests
        </Link>
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">{household.display_name}</h1>
        <span className="text-sm text-muted">
          Tier {household.tier} · {pluralise(household.head_count, "person", "people")} ·{" "}
          {pluralise(household.seat_count, "seat")}
          {household.infant_count > 0 ? ` · ${household.infant_count} on laps` : null}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-5">
          <HouseholdForm household={household} />

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Members</h2>
              {guests.length > 0 ? (
                <HouseholdPicker
                  households={households}
                  excludeIds={[household.id]}
                  label="Move all members…"
                  move={(targetHouseholdId) => moveGuests(guestIds, targetHouseholdId)}
                />
              ) : null}
            </div>
            <ul className="card divide-y divide-line">
              {guests.map((guest) => (
                <li key={guest.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <div>
                    <Link href={`/guests/${guest.id}`} className="text-sm hover:underline">
                      {guestName(guest)}
                    </Link>
                    {guest.age_band !== "adult" ? (
                      <span className="ml-1.5 text-xs text-muted">({guest.age_band})</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{guest.dietary || guest.email || "—"}</span>
                    <HouseholdPicker
                      households={households}
                      excludeIds={[household.id]}
                      label="Move"
                      move={(targetHouseholdId) => moveGuest(guest.id, targetHouseholdId)}
                    />
                  </div>
                </li>
              ))}
              {guests.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted">Nobody in this household yet.</li>
              ) : null}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
              Add someone
            </h2>
            <GuestForm householdId={household.id} />
          </section>
        </div>

        <div className="space-y-5">
          <aside className="card h-fit space-y-3 p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Invitation</h2>

            {invitation ? (
              <>
                <p className="text-sm">
                  {invitation.sent_at ? (
                    <>Sent {formatRelative(invitation.sent_at)} by {invitation.channel}</>
                  ) : (
                    <>Created, not yet sent</>
                  )}
                </p>
                <p className="text-sm text-muted">
                  {invitation.opened_at
                    ? `Opened ${formatRelative(invitation.opened_at)}`
                    : "Not opened yet"}
                </p>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-muted">Invited to</h3>
                  <ul className="mt-1 text-sm">
                    {events
                      .filter((event) => invitedEventIds.has(event.id))
                      .map((event) => (
                        <li key={event.id}>{event.name}</li>
                      ))}
                    {invitedEventIds.size === 0 ? <li className="text-muted">No events yet</li> : null}
                  </ul>
                </div>
                {summary ? (
                  <p className="text-sm">
                    {summary.rsvp_answered} of {summary.rsvp_total} answers in
                    {summary.rsvp_yes > 0 ? ` · ${summary.rsvp_yes} yes` : null}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No invitation yet.{" "}
                <Link href="/invitations" className="underline">
                  Create one
                </Link>
                .
              </p>
            )}

            <p className="border-t border-line pt-3 text-xs text-muted">
              Reminders are {household.reminders_muted ? "muted" : "on"} for this household.
            </p>
          </aside>

          <aside className="card h-fit p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Answers</h2>
            <div className="mt-3">
              <AnswerList answers={answers} empty="No household questions answered yet." />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
