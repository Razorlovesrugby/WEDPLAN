import Link from "next/link";
import { InvitationsTable } from "@/components/invitations/invitations-table";
import { StationeryPanel } from "@/components/invitations/stationery-panel";
import { createClient } from "@/lib/supabase/server";
import { SubTabs } from "@/components/sub-tabs";
import { GUESTS_TABS } from "@/lib/nav-tabs";
import { listInvitations } from "@/server/queries/invitations";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatDate } from "@/lib/format";
import { saveTheDateDisplay } from "@/lib/site/save-the-date";
import { getSaveTheDateContent } from "@/server/queries/save-the-date";

export const metadata = { title: "Invitations" };

/**
 * The dashboard's invitation tiles link here carrying a status. Honouring it
 * is what makes the spec's rule true — every number on the home screen clicks
 * through to the list behind it.
 */
const STATUSES = ["sent", "unsent", "opened", "silent"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  sent: "Invitations already sent",
  unsent: "Households with nothing sent yet",
  opened: "Households who have opened the link",
  // The list actually worth chasing (spec 22 §9): they have it, they have
  // read it, and they still have not answered. "Never opened" and "opened
  // five times and said nothing" need different messages.
  silent: "Opened, but nothing back yet",
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = STATUSES.find((candidate) => candidate === status) ?? null;

  const wedding = await requireWedding();
  const supabase = await createClient();
  const [allRows, events, { data: tags }, saveTheDate] = await Promise.all([
    listInvitations(wedding.id),
    getEvents(wedding.id),
    supabase.from("tags").select("id, name").eq("wedding_id", wedding.id).order("name"),
    getSaveTheDateContent(wedding.id),
  ]);
  const saveTheDateWords = saveTheDateDisplay(saveTheDate, wedding);

  const rows = active
    ? allRows.filter((row) =>
        active === "sent"
          ? row.summary?.sent_at != null
          : active === "opened"
            ? row.summary?.opened_at != null || (row.summary?.view_count ?? 0) > 0
            : active === "silent"
              ? row.summary?.sent_at != null &&
                (row.summary.opened_at != null || (row.summary.view_count ?? 0) > 0) &&
                row.summary.response_state === "none"
              : row.summary?.sent_at == null,
      )
    : allRows;

  const sent = allRows.filter((row) => row.summary?.sent_at).length;
  const complete = allRows.filter((row) => row.summary?.response_state === "complete").length;

  return (
    <div className="space-y-5">
      <SubTabs tabs={GUESTS_TABS} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Invitations</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            {sent} sent · {complete} fully answered · {allRows.length} households
          </span>
          <Link href="/invitations/print/stationery" className="btn" prefetch={false}>
            Print invitations
          </Link>
        </div>
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
        one — so you watch the numbers rather than chasing by hand.{" "}
        <Link href="/questions" className="underline">
          Manage the RSVP questions households answer →
        </Link>
      </p>

      {/* Two links per household look alike in a chat, so say which is which
          where both sets of buttons live. */}
      <p className="max-w-2xl rounded border border-line bg-white px-3 py-2 text-sm">
        <strong className="font-medium">Two links per household.</strong> The{" "}
        <strong className="font-medium">save the date</strong> ends in{" "}
        <code className="text-xs">/save-the-date</code> — names, date and photos, nothing to answer.
        The <strong className="font-medium">invitation</strong> is the household&rsquo;s full page
        with the RSVP. Each has its own column below.{" "}
        <Link href="/invitations/save-the-date" className="underline">
          Design the save the date →
        </Link>
      </p>

      <StationeryPanel
        tags={(tags ?? []) as { id: string; name: string }[]}
        weddingDateSet={wedding.wedding_date != null}
      />

      <InvitationsTable
        rows={rows}
        events={events}
        weddingName={wedding.name}
        dateLabel={
          wedding.wedding_date
            ? formatDate(wedding.wedding_date, wedding.timezone)
            : "date to be confirmed"
        }
        saveTheDate={{
          weddingSlug: wedding.slug,
          dateLabel: saveTheDateWords.dateLabel,
          location: saveTheDateWords.location,
        }}
      />
    </div>
  );
}
