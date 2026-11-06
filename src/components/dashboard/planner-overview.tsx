import { Stat } from "@/components/stat";
import { getEvents } from "@/server/queries/wedding";
import { getTimelineSummary, getAssignedToPersonItems } from "@/server/queries/lists";
import { listVendors } from "@/server/queries/vendors";
import { formatDate } from "@/lib/format";
import type { WeddingRow } from "@/lib/types/database";

const BOOKED = new Set(["booked", "deposit_paid", "complete"]);

/**
 * The overview a planner sees (spec 39 part C). Tasks, the day, vendors — and
 * nothing that is computed from the guest list or the budget, because the
 * figures behind the couple's overview (`v_wedding_stats`, the budget summary)
 * read tables a planner cannot, and a half-empty tile would read as zero.
 */
export async function PlannerOverview({
  wedding,
  personId,
}: {
  wedding: WeddingRow;
  personId: string | null;
}) {
  const [tasks, events, vendors, mine] = await Promise.all([
    getTimelineSummary(wedding.id, wedding.timezone, wedding.reminder_window_days),
    getEvents(wedding.id),
    listVendors(wedding.id),
    personId ? getAssignedToPersonItems(wedding.id, personId) : Promise.resolve([]),
  ]);

  const now = Date.now();
  const upcoming = events
    .filter((e) => e.starts_at && new Date(e.starts_at).getTime() >= now)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-serif text-2xl">Where things stand</h1>
        <p className="mt-1 text-sm text-muted">
          You&rsquo;re signed in as the planner. You can see and update the tasks, vendors and the day; the
          guest list is view-only, and the budget isn&rsquo;t shared with you.
        </p>
      </section>

      <section aria-labelledby="tasks">
        <h2 id="tasks" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Tasks
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Assigned to you"
            value={mine.length}
            href="/lists?view=mine"
            hint="not done yet"
            tone={mine.length > 0 ? "warn" : "neutral"}
          />
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

      <section aria-labelledby="vendors">
        <h2 id="vendors" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Vendors
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Vendors"
            value={vendors.filter((v) => !v.archived_at).length}
            href="/vendors"
            hint={`${vendors.filter((v) => BOOKED.has(v.stage)).length} booked`}
          />
        </div>
      </section>

      <section aria-labelledby="events">
        <h2 id="events" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          Coming up
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">No upcoming events with a date.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 p-3 text-sm">
                <span>{e.name}</span>
                <span className="text-muted">{e.starts_at ? formatDate(e.starts_at, wedding.timezone) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
