import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import {
  listUnlinkedVendorNames,
  listVendorCategories,
  listVendors,
} from "@/server/queries/vendors";
import { VendorList } from "@/components/vendors/vendor-list";

export const metadata = { title: "Vendors" };

/**
 * `/vendors` — the list (spec 8 §5).
 *
 * Filters live in the URL, exactly as `/guests` holds its own: a filtered
 * vendor list is a link you can send or bookmark.
 */
export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const wedding = await requireWedding();

  const [vendors, categories, unlinked] = await Promise.all([
    listVendors(wedding.id),
    listVendorCategories(wedding.id),
    listUnlinkedVendorNames(wedding.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Vendors</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Who they are, how to reach them, what was said, and which budget lines they are
            responsible for. Every figure here is read from the budget — nothing about money is
            stored twice.
          </p>
        </div>
        <Link href="/vendors/contact-sheet" className="btn">
          Contact sheet
        </Link>
      </div>

      <VendorList
        vendors={vendors}
        categories={categories}
        unlinked={unlinked}
        params={params}
      />
    </div>
  );
}
