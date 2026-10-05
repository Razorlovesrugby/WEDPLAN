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
export function GalleryGrid({
  images,
  zoom = true,
}: {
  images: GalleryImage[];
  /** Tap to enlarge (`PhotoViewer`). A block-level switch; on unless the planner turned it off. */
  zoom?: boolean;
}) {
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
            data-zoom={zoom ? "" : undefined}
            data-full={zoom ? image.url : undefined}
            tabIndex={zoom ? 0 : undefined}
            role={zoom ? "button" : undefined}
            aria-label={zoom ? `Enlarge photo${image.alt ? `: ${image.alt}` : ""}` : undefined}
            className={`h-full w-full object-cover${zoom ? " site-zoomable" : ""}`}
          />
        </li>
      ))}
    </ul>
  );
}
