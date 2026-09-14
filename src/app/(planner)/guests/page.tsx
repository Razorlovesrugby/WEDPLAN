import Link from "next/link";
import { FilterBar } from "@/components/guests/filter-bar";
import { GuestsTable } from "@/components/guests/guests-table";
import { countActiveFilters, parseGuestFilters } from "@/lib/filters";
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
        <Link href="/households/new" className="btn-primary">
          Add household
        </Link>
      </div>

      <FilterBar tags={tags} events={events} activeCount={countActiveFilters(filters)} />

      <GuestsTable guests={guests} tags={tags} events={events} />
    </div>
  );
}
