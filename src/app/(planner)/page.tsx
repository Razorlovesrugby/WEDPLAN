import Link from "next/link";
import { Stat } from "@/components/stat";
import { requireWedding, getWeddingStats, getViewerKind, getPlannerPersonId } from "@/server/queries/wedding";
import { PlannerOverview } from "@/components/dashboard/planner-overview";
import { getTimelineSummary } from "@/server/queries/lists";
import { getBudgetSummary, getUpcomingPayments } from "@/server/queries/budget";
import { getRegistrySummary } from "@/server/queries/registry";
import { daysUntil, formatDate, formatMoney, pluralise } from "@/lib/format";
import { todayIso } from "@/lib/lists/generate";
import { getInboxNeedsYouCount } from "@/server/queries/inbox";
import { listInvitations } from "@/server/queries/invitations";
import { nextUp } from "@/lib/today";

export const metadata = { title: "Today" };

export default async function DashboardPage() {
  const wedding = await requireWedding();
  // A planner reads none of the figures below (guest stats, budget, registry),
  // so they get their own, smaller overview rather than tiles that read zero.
  if ((await getViewerKind()) === "planner") {
    return <PlannerOverview wedding={wedding} personId={await getPlannerPersonId()} />;
  }
  const [stats, tasks, budget, payments, registry, inboxNeedsYou, invitations] = await Promise.all([
    getWeddingStats(wedding.id),
    getTimelineSummary(wedding.id, wedding.timezone, wedding.reminder_window_days),
    getBudgetSummary(wedding.id),
    getUpcomingPayments(wedding.id),
    // Fails soft: until 0039 is applied the registry tables don't exist, and a
    // missing optional tile must never take the whole overview down with it.
    getRegistrySummary(wedding.id).catch(() => null),
    getInboxNeedsYouCount(wedding.id),
    // Only for one "Next up" line, so it fails soft too.
    listInvitations(wedding.id).catch(() => []),
  ]);
  const today = todayIso(wedding.timezone);
  const upcomingPaymentCount = payments.filter((p) => !p.paid_at && p.due_date && p.due_date >= today).length;

  if (!stats) {
    return <p className="text-sm text-muted">No data yet. Add your first household to begin.</p>;
  }

  const notYetInvited = stats.household_count - stats.invited_households;
  const silentHouseholds = stats.silent_households;
  const overCapacity =
    wedding.capacity !== null && stats.above_cut_seats > wedding.capacity
      ? stats.above_cut_seats - wedding.capacity
      : 0;
  const lockDays = daysUntil(wedding.rsvp_lock_at);

  // Spec 43 §4.2: what to do next, above the figures.
  const lines = nextUp({
    today,
    overdueTasks: tasks.overdueCount,
    dueThisWeekTasks: tasks.dueSoonCount,
    payments,
    inbox: { needsYou: inboxNeedsYou },
    saveTheDateNoInvitation: invitations.filter((row) => row.summary?.std_sent_at && !row.summary.sent_at).length,
    silentHouseholds,
    overCapacity,
    rsvpLockDays: lockDays,
  });
  const TONE = { bad: "bg-red-600", warn: "bg-tierB", neutral: "bg-muted" } as const;

  return (
    <div className="space-y-8">
      <section aria-labelledby="next-up" className="space-y-3">
        <h1 className="font-serif text-2xl">Today</h1>
        <h2 id="next-up" className="text-sm font-medium uppercase tracking-wide text-muted">
          Next up
        </h2>
        {lines.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Nothing needs you today.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {lines.map((line) => (
              <li key={line.text}>
                <Link href={line.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-line/30">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE[line.tone]}`} />
                  <span className="flex-1">{line.text}</span>
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-xl">Where things stand</h2>
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

      {budget ? (
        <section aria-labelledby="budget">
          <h2 id="budget" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Budget
          </h2>
          <div className={`grid gap-3 sm:grid-cols-2 ${budget.total_budget !== null ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <Stat
              label="Committed"
              value={formatMoney(budget.total_contracted, wedding.currency)}
              href="/budget"
              hint="contracted across every line"
            />
            <Stat
              label="Paid"
              value={formatMoney(budget.total_paid, wedding.currency)}
              href="/budget"
              hint={`${formatMoney(budget.total_outstanding, wedding.currency)} outstanding`}
              tone={budget.total_outstanding > 0 ? "warn" : "good"}
            />
            <Stat
              label="Upcoming payments"
              value={upcomingPaymentCount}
              href="/budget"
              tone={upcomingPaymentCount > 0 ? "warn" : "neutral"}
            />
            <Stat
              label="Per seat"
              value={budget.per_head_seat !== null ? formatMoney(budget.per_head_seat, wedding.currency) : "—"}
              href="/guests/rank"
              hint="from every per-unit and consumption line"
            />
            {/* Spec 19: the top-down number, only once there is an overall
                budget to be over or under. */}
            {budget.total_budget !== null ? (
              <Stat
                label="Against budget"
                value={formatMoney(budget.total_current, wedding.currency)}
                href="/budget"
                hint={
                  budget.budget_variance === null || budget.budget_variance === 0
                    ? `of ${formatMoney(budget.total_budget, wedding.currency)} — exactly on budget`
                    : `of ${formatMoney(budget.total_budget, wedding.currency)} — ${formatMoney(Math.abs(budget.budget_variance), wedding.currency)} ${
                        budget.budget_variance > 0 ? "over" : "under"
                      }`
                }
                tone={budget.budget_variance !== null && budget.budget_variance > 0 ? "warn" : "good"}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {registry && (registry.enabled || registry.items > 0) ? (
        <section aria-labelledby="registry">
          <h2 id="registry" className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Registry
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="New claims"
              value={registry.newClaims}
              href="/gifts/claims"
              hint={registry.newClaims > 0 ? "since you last looked" : "nothing new"}
              tone={registry.newClaims > 0 ? "good" : "neutral"}
            />
            <Stat
              label="Waiting to arrive"
              value={registry.awaiting}
              href="/gifts/claims"
              hint="claimed, not here yet"
            />
            <Stat
              label="Need a thank-you"
              value={registry.toThank}
              href="/gifts/claims"
              hint="arrived, not thanked"
              tone={registry.toThank > 0 ? "warn" : "neutral"}
            />
          </div>
        </section>
      ) : null}

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
          {/* Sent, read, and still silent — the list worth chasing, rather
              than the two it used to be conflated with (spec 22 §9). */}
          <Stat
            label="Read, no reply"
            value={silentHouseholds}
            href="/invitations?status=silent"
            hint="opened it and said nothing"
            tone={silentHouseholds > 0 ? "warn" : "neutral"}
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
