import Link from "next/link";
import { EventGrid } from "@/components/invitations/event-grid";
import { InvitationsTable } from "@/components/invitations/invitations-table";
import { JourneyTable } from "@/components/invitations/journey-table";
import { StageNav } from "@/components/invitations/stage-nav";
import { StationeryPanel } from "@/components/invitations/stationery-panel";
import { createClient } from "@/lib/supabase/server";
import { listInvitations } from "@/server/queries/invitations";
import { getEvents, requireWedding } from "@/server/queries/wedding";
import { formatDate } from "@/lib/format";
import { saveTheDateDisplay } from "@/lib/site/save-the-date";
import { getSaveTheDateContent } from "@/server/queries/save-the-date";
import {
  STATUS_LABEL,
  defaultStage,
  defaultStep,
  isStage,
  isStatus,
  isStep,
  journeyHref,
  matchesStatus,
  stageForStatus,
  stageProgress,
  type Stage,
  type Status,
} from "@/lib/invitations/journey";

export const metadata = { title: "Invitations" };

/**
 * `/invitations` — who gets what, sending it, and following replies (spec 42
 * §5.4). Designing what guests see is under Design; this is the other job.
 *
 * Two stages in order (the save the date, then the invitation, which is the
 * household's own page), each with Who · Send · Track. Stage and step are in
 * the URL. The dashboard's `?status=` links still work: they open Track on the
 * stage the filter belongs to, filtered as before.
 */
const STATUS_FILTERS: Record<Stage, Status[]> = {
  "save-the-date": ["std_unsent"],
  invitation: ["unsent", "sent", "opened", "silent", "unable"],
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; step?: string; status?: string }>;
}) {
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : null;

  const wedding = await requireWedding();
  const supabase = await createClient();
  const [allRows, events, { data: tags }, saveTheDate] = await Promise.all([
    listInvitations(wedding.id),
    getEvents(wedding.id),
    supabase.from("tags").select("id, name").eq("wedding_id", wedding.id).order("name"),
    getSaveTheDateContent(wedding.id),
  ]);

  const stage: Stage = isStage(params.stage) ? params.stage : status ? stageForStatus(status) : defaultStage(allRows);
  const step = isStep(params.step) ? params.step : status ? "track" : defaultStep(allRows, stage);
  const rows = status ? allRows.filter((row) => matchesStatus(row, status)) : allRows;
  const progress = { "save-the-date": stageProgress(allRows, "save-the-date"), invitation: stageProgress(allRows, "invitation") };
  const designHref = stage === "save-the-date" ? "/invitations/save-the-date" : "/site";
  const saveTheDateWords = saveTheDateDisplay(saveTheDate, wedding);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Invitations</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Each household gets two things: a save the date, then their invitation, which is their own
            page with the RSVP. Who gets it, sending it and replies are here.
          </p>
        </div>
        <Link href={designHref} className="btn">
          Edit design →
        </Link>
      </div>

      <StageNav stage={stage} step={step} progress={progress} />

      {step === "who" && stage === "invitation" ? (
        <EventGrid
          events={events.map((event) => ({ id: event.id, name: event.name }))}
          rows={allRows.map((row) => ({
            householdId: row.household.id,
            name: row.household.display_name,
            invitationId: row.invitationId,
            invitedEventIds: row.invitedEventIds,
          }))}
        />
      ) : null}

      {step === "who" && stage === "save-the-date" ? (
        <div className="card space-y-2 p-4 text-sm">
          <p>
            <strong className="font-medium">Every household gets one</strong>, all {allRows.length} of them. It
            needs no invitation and asks nothing back.
          </p>
          <p>
            <Link href={journeyHref("save-the-date", "send")} className="underline">
              Send them →
            </Link>
          </p>
        </div>
      ) : null}

      {step === "send" ? (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p className="max-w-2xl text-muted">
              {stage === "save-the-date" ? (
                <>
                  Copy each household&rsquo;s save-the-date link from its row, and tick{" "}
                  <strong className="font-medium text-ink">Save the Date Sent</strong> as you send it. Copying a
                  link doesn&rsquo;t tick anything.
                </>
              ) : (
                <>
                  Copy or email each household&rsquo;s invitation from its row, and tick{" "}
                  <strong className="font-medium text-ink">Invite Sent</strong> as you send it. Reminders go only
                  to households who haven&rsquo;t finished answering, never more than once every ten days, and
                  never to a muted one.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {/* Every household's links in one file, for a mail merge. */}
              <Link href="/api/export/households" className="btn" prefetch={false}>
                Download every link (CSV)
              </Link>
              {stage === "invitation" ? (
                <Link href="/invitations/print/stationery" className="btn" prefetch={false}>
                  Print invitations
                </Link>
              ) : null}
            </div>
          </div>

          {stage === "invitation" ? (
            <StationeryPanel
              tags={(tags ?? []) as { id: string; name: string }[]}
              weddingDateSet={wedding.wedding_date != null}
            />
          ) : null}

          <InvitationsTable
            rows={rows}
            events={events}
            weddingName={wedding.name}
            dateLabel={wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : "date to be confirmed"}
            timezone={wedding.timezone}
            saveTheDate={{
              weddingSlug: wedding.slug,
              dateLabel: saveTheDateWords.dateLabel,
              location: saveTheDateWords.location,
            }}
          />
        </>
      ) : null}

      {step === "track" ? (
        <>
          <nav aria-label="Filter" className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={journeyHref(stage, "track")}
              aria-current={status === null ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${status === null ? "border-ink bg-white" : "border-line text-muted"}`}
            >
              All {allRows.length}
            </Link>
            {STATUS_FILTERS[stage].map((candidate) => {
              const count = allRows.filter((row) => matchesStatus(row, candidate)).length;
              return (
                <Link
                  key={candidate}
                  href={journeyHref(stage, "track", candidate)}
                  aria-current={status === candidate ? "page" : undefined}
                  className={`rounded-full border px-3 py-1 ${
                    status === candidate ? "border-ink bg-white" : "border-line text-muted"
                  }`}
                >
                  {STATUS_LABEL[candidate]} · {count}
                </Link>
              );
            })}
          </nav>
          <JourneyTable rows={rows} stage={stage} />
          <p className="text-sm text-muted">
            The RSVP answers themselves are on{" "}
            <Link href="/guests" className="underline">
              Guest list
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
