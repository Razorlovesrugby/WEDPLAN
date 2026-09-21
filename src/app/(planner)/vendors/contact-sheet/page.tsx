import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { listVendors } from "@/server/queries/vendors";
import { sortVendors, STAGE_LABEL, stageIsCommitted } from "@/lib/vendors";

export const metadata = { title: "Vendor contact sheet" };

/**
 * The day-of contact sheet (spec 8 Answered, question 5).
 *
 * One page, every committed vendor and how to reach them, printable. The
 * audience is somebody standing in a field at 6am with no signal and a paper
 * copy in their hand — which is why it defaults to committed vendors only
 * (nobody needs the florist you declined) and why every number is printed as
 * text rather than hidden behind a `tel:` link that paper cannot follow.
 */
export default async function ContactSheetPage() {
  const wedding = await requireWedding();
  const vendors = sortVendors(
    (await listVendors(wedding.id)).filter(
      (vendor) => !vendor.archived_at && stageIsCommitted(vendor.stage),
    ),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-serif text-2xl">Contact sheet</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Everyone you have booked, on one page. Print it and put it in somebody&rsquo;s pocket
            — the person who needs this is standing in a field with no signal.
          </p>
        </div>
        <Link href="/vendors" className="btn">
          Back to vendors
        </Link>
      </div>

      {vendors.length === 0 ? (
        <p className="text-sm text-muted print:hidden">
          Nothing booked yet. Vendors appear here once their stage is booked, deposit paid or
          complete.
        </p>
      ) : (
        <div className="print-sheet">
          <h2 className="mb-4 font-serif text-xl">
            {wedding.name}
            {wedding.wedding_date ? ` · ${wedding.wedding_date}` : ""}
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Contact</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{vendor.name}</span>
                    <span className="block text-xs text-muted">
                      {vendor.category_name ?? "Uncategorised"} · {STAGE_LABEL[vendor.stage]}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{vendor.primary_contact_name ?? "—"}</td>
                  {/* Printed as plain text: paper cannot follow a tel: link. */}
                  <td className="py-2 pr-3">{vendor.primary_contact_phone ?? vendor.phone ?? "—"}</td>
                  <td className="py-2">{vendor.primary_contact_email ?? vendor.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
