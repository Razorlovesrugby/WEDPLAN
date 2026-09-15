import Link from "next/link";
import { FilterBar } from "@/components/guests/filter-bar";
import { GuestsTable } from "@/components/guests/guests-table";
import { countActiveFilters, guestFiltersToQuery, parseGuestFilters } from "@/lib/filters";
import { listGuests } from "@/server/queries/guests";
import { getEvents, getTags, requireWedding } from "@/server/queries/wedding";

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

  const [guests, tags, events] = await Promise.all([
    listGuests(wedding.id, filters),
    getTags(wedding.id),
    getEvents(wedding.id),
  ]);

  return (
    <div className="space-y-5">
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

      <FilterBar tags={tags} events={events} activeCount={countActiveFilters(filters)} />

      <GuestsTable guests={guests} tags={tags} events={events} />
    </div>
  );
}
