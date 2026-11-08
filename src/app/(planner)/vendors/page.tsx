import Link from "next/link";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import {
  getVendor,
  listUnlinkedVendorNames,
  listVendorBudgetLines,
  listVendorCategories,
  listVendorContacts,
  listVendorNotes,
  listVendorTasks,
  listVendors,
} from "@/server/queries/vendors";
import { VendorList } from "@/components/vendors/vendor-list";
import { VendorDetail } from "@/components/vendors/vendor-detail";
import { InspectorPortal } from "@/components/shell/inspector";

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

  const showMoney = (await getViewerKind()) !== "planner";
  const [vendors, categories, unlinked] = await Promise.all([
    listVendors(wedding.id),
    listVendorCategories(wedding.id),
    listUnlinkedVendorNames(wedding.id),
  ]);

  // `?inspect=vendor:<id>` opens one vendor in the side panel (spec 44).
  const inspectId = params.inspect?.startsWith("vendor:") ? params.inspect.slice("vendor:".length) : null;
  const inspected = inspectId ? await getVendor(wedding.id, inspectId) : null;
  const detail = inspected
    ? await Promise.all([
        listVendorContacts(wedding.id, inspected.id),
        listVendorNotes(wedding.id, inspected.id),
        listVendorBudgetLines(wedding.id, inspected.id),
        listVendorTasks(wedding.id, inspected.id),
      ])
    : null;
  const closeQuery = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => entry[0] !== "inspect" && Boolean(entry[1])),
  ).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Vendors</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {showMoney
              ? "Who they are, how to reach them, what was said, and which budget lines they are responsible for. Every figure here is read from the budget — nothing about money is stored twice."
              : "Who they are, how to reach them, and what was said."}
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
        showMoney={showMoney}
      />

      {inspected && detail ? (
        <InspectorPortal
          inspectKey={`vendor:${inspected.id}`}
          title={inspected.name}
          closeHref={`/vendors${closeQuery ? `?${closeQuery}` : ""}`}
        >
          <Link href={`/vendors/${inspected.id}`} className="text-sm text-muted underline">
            Open the full page
          </Link>
          <VendorDetail
            vendor={inspected}
            categories={categories}
            contacts={detail[0]}
            notes={detail[1]}
            lines={detail[2]}
            tasks={detail[3]}
            showMoney={showMoney}
          />
        </InspectorPortal>
      ) : null}
    </div>
  );
}
