import Link from "next/link";
import { TravelEditor } from "@/components/travel/travel-editor";
import { getTravel } from "@/server/queries/travel";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Getting there" };

export default async function TravelPage() {
  const wedding = await requireWedding();
  const data = await getTravel(wedding.id);

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

      <TravelEditor data={data} timeZone={wedding.timezone} />
    </div>
  );
}
