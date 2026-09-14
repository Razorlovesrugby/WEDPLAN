import Link from "next/link";
import { ImportWizard } from "@/components/guests/import-wizard";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Import guests" };

export default async function ImportPage() {
  // Not used directly — called so the page redirects to /setup like every
  // other planner screen when no wedding is attached, rather than rendering
  // an import form that could not possibly work.
  await requireWedding();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Import guests</h1>
        <Link href="/guests" className="btn">
          Back to guests
        </Link>
      </div>

      <ImportWizard />
    </div>
  );
}
