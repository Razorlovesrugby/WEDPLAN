import Link from "next/link";
import { TravelEditor } from "@/components/travel/travel-editor";
import { getTravel } from "@/server/queries/travel";
import { getArrivalPoints } from "@/server/queries/site-extras";
import { requireWedding } from "@/server/queries/wedding";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Getting there" };

export default async function TravelPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const [data, arrivals, { data: events }] = await Promise.all([
    getTravel(wedding.id),
    getArrivalPoints(wedding.id),
    supabase
      .from("events")
      .select("id, name")
      .eq("wedding_id", wedding.id)
      .order("sort_order")
      .order("starts_at"),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">Getting there</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The coach, parking, and somewhere to stay. All of it shows on{" "}
          <Link href={`/w/${wedding.slug}`} className="underline" target="_blank" rel="noreferrer">
            the site
          </Link>
          ; seats are reserved by each household from their own invitation link.
        </p>
      </div>

      <TravelEditor
        data={data}
        arrivals={arrivals}
        events={events ?? []}
        timeZone={wedding.timezone}
      />
    </div>
  );
}
