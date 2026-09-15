import Link from "next/link";
import { Stat } from "@/components/stat";
import { requireWedding, getWeddingStats } from "@/server/queries/wedding";
import { getTimelineSummary } from "@/server/queries/lists";
import { daysUntil, formatDate, pluralise } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const wedding = await requireWedding();
  const [stats, tasks] = await Promise.all([
    getWeddingStats(wedding.id),
    getTimelineSummary(wedding.id, wedding.reminder_window_days),
  ]);

  if (!stats) {
    return <p className="text-sm text-muted">No data yet. Add your first household to begin.</p>;
  }

  const notYetInvited = stats.household_count - stats.invited_households;
  const overCapacity =
    wedding.capacity !== null && stats.above_cut_seats > wedding.capacity
      ? stats.above_cut_seats - wedding.capacity
      : 0;
  const lockDays = daysUntil(wedding.rsvp_lock_at);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-serif text-2xl">Where things stand</h1>
        <p className="mt-1 text-sm text-muted">
          Every number here is a link. If it looks wrong, click it and see the list behind it.
        </p>
      </section>

      <section aria-labelledby="tasks">
        <h2 id="tasks" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Tasks
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Overdue"
            value={tasks.overdueCount}
            href="/timeline"
            hint={tasks.overdueCount > 0 ? "past their due date" : "nothing overdue"}
            tone={tasks.overdueCount > 0 ? "bad" : "good"}
          />
          <Stat
            label="Due this week"
            value={tasks.dueSoonCount}
            href="/timeline"
            hint="across every list"
            tone={tasks.dueSoonCount > 0 ? "warn" : "neutral"}
          />
        </div>
      </section>

      <section aria-labelledby="responses">
        <h2 id="responses" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Responses
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Attending"
            value={stats.attending_guests}
            href="/guests?rsvp=yes"
            hint={`of ${pluralise(stats.guest_count, "guest")}`}
            tone="good"
          />
          <Stat
            label="Outstanding"
            value={stats.outstanding_guests}
            href="/guests?rsvp=pending"
            hint="haven't answered"
            tone={stats.outstanding_guests > 0 ? "warn" : "neutral"}
          />
          <Stat label="Declined" value={stats.declined_guests} href="/guests?rsvp=no" />
          <Stat
            label="Maybe"
            value={stats.maybe_guests}
            href="/guests?rsvp=maybe"
            hint="chase these first"
            tone={stats.maybe_guests > 0 ? "warn" : "neutral"}
          />
        </div>
      </section>

      <section aria-labelledby="capacity">
        <h2 id="capacity" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Capacity
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Seats above the cut"
            value={stats.above_cut_seats}
            href="/guests/rank"
            hint={
              wedding.capacity === null
                ? "no capacity set"
                : overCapacity > 0
                  ? `${overCapacity} over capacity`
                  : `${wedding.capacity - stats.above_cut_seats} to spare`
            }
            tone={overCapacity > 0 ? "bad" : "good"}
          />
          <Stat
            label="Households above the cut"
            value={stats.above_cut_households}
            href="/guests/rank"
            hint={`of ${stats.household_count}`}
          />
          <Stat
            label="Seats still free"
            value={stats.seats_remaining ?? "—"}
            href="/guests?rsvp=yes"
            hint="against confirmed yeses"
          />
          <Stat
            label="Children and infants"
            value={stats.child_count + stats.infant_count}
            href="/guests?age=child"
            hint={`${stats.child_count} need seats, ${stats.infant_count} don't`}
          />
        </div>
      </section>

      <section aria-labelledby="invitations">
        <h2 id="invitations" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Invitations
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Sent"
            value={stats.invited_households}
            href="/invitations?status=sent"
            hint={`of ${pluralise(stats.household_count, "household")}`}
          />
          <Stat
            label="Not yet sent"
            value={notYetInvited}
            href="/invitations?status=unsent"
            tone={notYetInvited > 0 ? "warn" : "good"}
          />
          <Stat
            label="Opened"
            value={stats.opened_households}
            href="/invitations?status=opened"
            hint="link followed at least once"
          />
          <Stat
            label="RSVP closes"
            value={lockDays === null ? "—" : lockDays >= 0 ? `${lockDays}d` : "closed"}
            href="/invitations"
            hint={
              wedding.rsvp_lock_at
                ? formatDate(wedding.rsvp_lock_at, wedding.timezone)
                : "no lock date set"
            }
            tone={lockDays !== null && lockDays < 14 ? "warn" : "neutral"}
          />
        </div>
      </section>

      {overCapacity > 0 ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          You are {pluralise(overCapacity, "seat")} over capacity above the cut line.{" "}
          <Link href="/guests/rank" className="underline">
            Move the cut line
          </Link>{" "}
          or drop a household to the waitlist.
        </p>
      ) : null}
    </div>
  );
}
