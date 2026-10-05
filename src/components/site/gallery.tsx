import type { GalleryImage } from "@/server/queries/gallery";

/**
 * The gallery (spec 14 §9), in one of three Looks (spec 27 E1).
 *
 *   grid       even square tiles — a clean block (as it always was)
 *   masonry    each photograph at its own proportions, in columns
 *   filmstrip  one row to swipe through
 *
 * Plain `<img>` rather than `next/image`: these are signed storage URLs with a
 * TTL, so the optimiser would cache a transformed copy under a key that
 * outlives the signature and start serving 403s. The sizes are constrained by
 * CSS and the images are lazy — which is most of what the optimiser would have
 * bought here anyway.
 *
 * **The filmstrip never takes the scroll away.** It is an ordinary horizontal
 * overflow with `scroll-snap-type: x proximity`: the snap only nudges a swipe
 * that is already ending near a photograph, and it never fights a thumb or
 * traps a wheel. It is also a focusable region, so a keyboard can scroll it.
 */
export function GalleryGrid({
  images,
  zoom = true,
  look = "grid",
}: {
  images: GalleryImage[];
  /** Tap to enlarge (`PhotoViewer`). A block-level switch; on unless the planner turned it off. */
  zoom?: boolean;
  /** `grid`, `masonry` or `filmstrip`. */
  look?: string;
}) {
  if (images.length === 0) return null;

  const picture = (image: GalleryImage, className: string, style?: React.CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.alt ?? ""}
      loading="lazy"
      decoding="async"
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      data-zoom={zoom ? "" : undefined}
      data-full={zoom ? image.url : undefined}
      tabIndex={zoom ? 0 : undefined}
      role={zoom ? "button" : undefined}
      aria-label={zoom ? `Enlarge photo${image.alt ? `: ${image.alt}` : ""}` : undefined}
      className={`${className}${zoom ? " site-zoomable" : ""}`}
      style={style}
    />
  );

  if (look === "masonry") {
    return (
      <ul className="site-masonry columns-2 gap-2 sm:columns-3">
        {images.map((image) => (
          <li key={image.id} className="mb-2 break-inside-avoid overflow-hidden border border-line">
            {picture(image, "block h-auto w-full", {
              // Reserve the space before the bytes arrive, so a column of
              // different heights does not reshuffle as it loads.
              aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : undefined,
            })}
          </li>
        ))}
      </ul>
    );
  }

  if (look === "filmstrip") {
    return (
      <ul
        className="site-filmstrip -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-3 sm:mx-0 sm:px-0"
        // A region a keyboard can focus and arrow along; without this a
        // horizontal scroller is unreachable without a pointer.
        tabIndex={0}
        aria-label="Photographs — scroll sideways"
      >
        {images.map((image) => (
          <li
            key={image.id}
            className="aspect-[4/5] w-[74%] shrink-0 snap-start overflow-hidden border border-line sm:w-[38%]"
          >
            {picture(image, "h-full w-full object-cover")}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((image) => (
        <li key={image.id} className="aspect-square overflow-hidden border border-line">
          {picture(image, "h-full w-full object-cover")}
        </li>
      ))}
    </ul>
  );
}
