import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWedding } from "@/server/queries/wedding";
import {
  getVendor,
  listVendorBudgetLines,
  listVendorCategories,
  listVendorContacts,
  listVendorNotes,
  listVendorTasks,
} from "@/server/queries/vendors";
import { VendorDetail } from "@/components/vendors/vendor-detail";

export const metadata = { title: "Vendor" };

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  const vendor = await getVendor(wedding.id, id);
  if (!vendor) notFound();

  const [categories, contacts, notes, lines, tasks] = await Promise.all([
    listVendorCategories(wedding.id),
    listVendorContacts(wedding.id, id),
    listVendorNotes(wedding.id, id),
    listVendorBudgetLines(wedding.id, id),
    listVendorTasks(wedding.id, id),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/vendors" className="text-sm text-muted hover:underline">
        ← Vendors
      </Link>
      <VendorDetail
        vendor={vendor}
        categories={categories}
        contacts={contacts}
        notes={notes}
        lines={lines}
        tasks={tasks}
      />
    </div>
  );
}
