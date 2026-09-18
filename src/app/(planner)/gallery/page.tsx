import Link from "next/link";
import { GalleryModeration } from "@/components/gallery/gallery-moderation";
import { getGalleryForPlanner } from "@/server/queries/gallery";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "Photos" };

export default async function GalleryPage() {
  const wedding = await requireWedding();
  const { pending, approved } = await getGalleryForPlanner(wedding.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">Photos</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Guests add photos from their own invitation link, so everything here is attributable to a
          household and the open internet can&rsquo;t post into your gallery. Turn uploads on under{" "}
          <Link href="/site" className="underline">
            the site&rsquo;s Photos section
          </Link>
          .
        </p>
      </div>

      <GalleryModeration pending={pending} approved={approved} />
    </div>
  );
}
