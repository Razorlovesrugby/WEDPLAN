import type { GalleryImage } from "@/server/queries/gallery";

/**
 * The gallery grid (spec 14 §9).
 *
 * Plain `<img>` rather than `next/image`: these are signed storage URLs with a
 * TTL, so the optimiser would cache a transformed copy under a key that
 * outlives the signature and start serving 403s. The sizes are constrained by
 * CSS and the images are lazy — which is most of what the optimiser would have
 * bought here anyway.
 */
export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  if (images.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((image) => (
        <li key={image.id} className="aspect-square overflow-hidden border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </li>
      ))}
    </ul>
  );
}
