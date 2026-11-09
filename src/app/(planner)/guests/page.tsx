import Link from "next/link";
import { EventSummary } from "@/components/guests/event-summary";
import { FilterBar } from "@/components/guests/filter-bar";
import { GuestsTable } from "@/components/guests/guests-table";
import { SubTabs } from "@/components/sub-tabs";
import { GUESTS_TABS } from "@/lib/nav-tabs";
import { countActiveFilters, guestFiltersToQuery, parseGuestFilters } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { eventReplyCounts, summariseHouseholds } from "@/lib/guest-table";
import { listAllGuests, listGuests, listHouseholds } from "@/server/queries/guests";
import { listInvitationIds } from "@/server/queries/invitations";
import { listInvites } from "@/server/queries/invites";
import { listSaveTheDateOpens } from "@/server/queries/save-the-date";
import { getCollaborators, getCutLines, getEvents, getTags, requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Guests" };

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseGuestFilters(params);
  const query = guestFiltersToQuery(filters);
  const wedding = await requireWedding();

  const [guests, everyone, tags, events, households, cutLines, collaborators, invites, invitationIds, saveTheDateOpens] =
    await Promise.all([
    listGuests(wedding.id, filters),
    // The same cached read as the line above: the reply bars and household
    // rows describe the whole wedding while the table is filtered (spec 47).
    listAllGuests(wedding.id),
    getTags(wedding.id),
    getEvents(wedding.id),
    listHouseholds(wedding.id),
    getCutLines(wedding.id),
    getCollaborators(wedding.id),
    listInvites(wedding.id),
    listInvitationIds(wedding.id),
    listSaveTheDateOpens(wedding.id),
  ]);

  const replyCounts = Object.fromEntries(
    events.map((event) => [event.id, eventReplyCounts(event.id, invites, everyone)]),
  );
  const householdSummaries = summariseHouseholds(
    everyone,
    events.map((event) => event.id),
    invites,
  );

  return (
    <div className="space-y-5">
      <SubTabs tabs={GUESTS_TABS} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Guests</h1>
        <div className="flex flex-wrap gap-2">
          {/* Exports carry the current filters, so "everyone who hasn't
              answered" is one click rather than a second round of filtering
              in the spreadsheet. */}
          <Link href={`/api/export/guests${query}`} className="btn" prefetch={false}>
            Export guests
          </Link>
          <Link href={`/api/export/catering${query}`} className="btn" prefetch={false}>
            Catering numbers
          </Link>
          <Link href="/guests/import" className="btn">
            Import CSV
          </Link>
          <Link href="/households/new" className="btn-primary">
            Add household
          </Link>
        </div>
      </div>

      <EventSummary events={events} counts={replyCounts} />

      <FilterBar
        tags={tags}
        events={events}
        cutLines={cutLines}
        collaborators={collaborators}
        activeCount={countActiveFilters(filters)}
      />

      <GuestsTable
        guests={guests}
        tags={tags}
        events={events}
        households={households}
        collaborators={collaborators}
        invites={invites}
        weddingSlug={wedding.slug}
        saveTheDateOpens={saveTheDateOpens}
        invitationIds={invitationIds}
        householdSummaries={householdSummaries}
        weddingName={wedding.name}
        dateLabel={
          wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : "date to be confirmed"
        }
      />
    </div>
  );
}
