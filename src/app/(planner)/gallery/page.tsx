import { GalleryModeration } from "@/components/gallery/gallery-moderation";
import { GallerySettings } from "@/components/gallery/gallery-settings";
import { getGalleryForPlanner, getGallerySettings } from "@/server/queries/gallery";
import { requireWedding } from "@/server/queries/wedding";
import { flag, text } from "@/lib/site/sections";

export const metadata = { title: "Photos" };

export default async function GalleryPage() {
  const wedding = await requireWedding();
  const [{ pending, approved }, settings] = await Promise.all([
    getGalleryForPlanner(wedding.id),
    getGallerySettings(wedding.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">Photos</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Guests add photos from their own invitation link, so everything here is attributable to a
          household and the open internet can&rsquo;t post into your gallery.
        </p>
      </div>

      <GallerySettings
        uploadsOpen={flag(settings, "uploads_open")}
        moderation={text(settings, "moderation") === "auto" ? "auto" : "review"}
      />

      <GalleryModeration pending={pending} approved={approved} />
    </div>
  );
}
