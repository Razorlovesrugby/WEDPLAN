import Link from "next/link";
import { DayLinksScreen } from "@/components/day-link/day-links-screen";
import { getDayLinksOverview } from "@/server/queries/day-links";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Day links" };

export default async function DayLinksPage() {
  const wedding = await requireWedding();
  const overview = await getDayLinksOverview(wedding.id);

  return (
    <div className="max-w-3xl space-y-5">
      <nav className="text-sm text-muted">
        <Link href="/run-sheet" className="hover:underline">
          Run sheet
        </Link>
      </nav>
      <h1 className="font-serif text-2xl">Day links</h1>
      <p className="text-sm text-muted">
        Everyone you&rsquo;ve given a job to who has no login gets their own link: their jobs, a Start and Done button
        for each, and a way to ask for help. Times are the venue&rsquo;s ({wedding.timezone}).
      </p>
      <DayLinksScreen overview={overview} timeZone={wedding.timezone} dayBeforeEmail={wedding.day_before_email} />
    </div>
  );
}
