import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import {
  getVendor,
  listVendorBudgetLines,
  listVendorCategories,
  listVendorContacts,
  listVendorNotes,
  listVendorTasks,
} from "@/server/queries/vendors";
import { getVendorSeatingItems } from "@/server/queries/seating";
import { TasksOnTheDay } from "@/components/day-link/tasks-on-the-day";
import { VendorDetail } from "@/components/vendors/vendor-detail";

export const metadata = { title: "Vendor" };

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wedding = await requireWedding();

  const showMoney = (await getViewerKind()) !== "planner";
  const vendor = await getVendor(wedding.id, id);
  if (!vendor) notFound();

  const [categories, contacts, notes, lines, tasks, seatingItems] = await Promise.all([
    listVendorCategories(wedding.id),
    listVendorContacts(wedding.id, id),
    listVendorNotes(wedding.id, id),
    listVendorBudgetLines(wedding.id, id),
    listVendorTasks(wedding.id, id),
    getVendorSeatingItems(wedding.id, id),
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
        showMoney={showMoney}
      />
      {seatingItems.length > 0 ? (
        <section className="card p-4" aria-label="From the seating plan">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">From the seating plan</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {seatingItems.map((item, i) => (
              <li key={i}>
                {item.text}: <strong>{item.final === null ? "Not set" : item.final}</strong>
                {item.note ? <span className="text-muted"> ({item.note})</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TasksOnTheDay weddingId={wedding.id} assignee={{ type: "vendor", id }} timeZone={wedding.timezone} />
    </div>
  );
}
