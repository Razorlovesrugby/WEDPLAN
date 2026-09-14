import { InvitationsTable } from "@/components/invitations/invitations-table";
import { listInvitations } from "@/server/queries/invitations";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Invitations" };

export default async function InvitationsPage() {
  const wedding = await requireWedding();
  const [rows, events] = await Promise.all([listInvitations(wedding.id), getEvents(wedding.id)]);

  const sent = rows.filter((row) => row.summary?.sent_at).length;
  const complete = rows.filter((row) => row.summary?.response_state === "complete").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Invitations</h1>
        <span className="text-sm text-muted">
          {sent} sent · {complete} fully answered · {rows.length} households
        </span>
      </div>

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
