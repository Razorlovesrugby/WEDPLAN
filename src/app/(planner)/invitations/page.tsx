import Link from "next/link";
import { InvitationsTable } from "@/components/invitations/invitations-table";
import { listInvitations } from "@/server/queries/invitations";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Invitations" };

/**
 * The dashboard's invitation tiles link here carrying a status. Honouring it
 * is what makes the spec's rule true — every number on the home screen clicks
 * through to the list behind it.
 */
const STATUSES = ["sent", "unsent", "opened"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  sent: "Invitations already sent",
  unsent: "Households with nothing sent yet",
  opened: "Households who have opened the link",
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = STATUSES.find((candidate) => candidate === status) ?? null;

  const wedding = await requireWedding();
  const [allRows, events] = await Promise.all([listInvitations(wedding.id), getEvents(wedding.id)]);

  const rows = active
    ? allRows.filter((row) =>
        active === "sent"
          ? row.summary?.sent_at != null
          : active === "opened"
            ? row.summary?.opened_at != null
            : row.summary?.sent_at == null,
      )
    : allRows;

  const sent = allRows.filter((row) => row.summary?.sent_at).length;
  const complete = allRows.filter((row) => row.summary?.response_state === "complete").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Invitations</h1>
        <span className="text-sm text-muted">
          {sent} sent · {complete} fully answered · {allRows.length} households
        </span>
      </div>

      {active ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-line/50 px-2 py-1">
            {STATUS_LABEL[active]} — {rows.length} shown
          </span>
          <Link href="/invitations" className="text-muted underline">
            Show all
          </Link>
        </p>
      ) : null}

      <p className="max-w-2xl text-sm text-muted">
        One link per household, no account to create. Reminders go only to households who
        haven&rsquo;t finished answering, never more than once every ten days, and never to a muted
        one — so you watch the numbers rather than chasing by hand.
      </p>

      <InvitationsTable
        rows={rows}
        events={events}
        weddingName={wedding.name}
        dateLabel={
          wedding.wedding_date
            ? formatDate(wedding.wedding_date, wedding.timezone)
            : "date to be confirmed"
        }
      />
    </div>
  );
}
