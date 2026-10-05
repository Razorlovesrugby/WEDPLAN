import type { CSSProperties } from "react";
import { objectPosition, type SiteImageData } from "@/lib/site/site-image";

/**
 * One of the couple's photographs, drawn properly (spec 27 step 2).
 *
 * A plain `<img>`, not `next/image`: the address is the app's own
 * `/api/photo/<id>`, which redirects to a freshly signed URL, so the optimiser
 * would cache a transformed copy of something that is meant to be re-signed.
 * What the optimiser would have bought is done by hand instead —
 *
 *   `srcSet` + `sizes`   a phone downloads the 480 or 960 copy, not the 2000;
 *   `width` + `height`   the browser reserves the space before the bytes
 *                        arrive, so nothing jumps;
 *   a background colour  the photograph's own average tint shows until it
 *                        decodes, instead of a blank box that then pops;
 *   `object-position`    the focal point, so a face stays in frame at 390px and
 *                        at 1440px.
 *
 * `sizes` is only emitted when there is a `srcSet`: a `sizes` with nothing to
 * choose from is noise.
 */

export function SiteImage({
  image,
  alt,
  sizes = "100vw",
  className = "",
  eager = false,
  zoom = false,
  style,
}: {
  image: SiteImageData;
  alt: string | null;
  /** What the browser should assume the displayed width is. */
  sizes?: string;
  className?: string;
  /** The first photograph on the page is the one the guest is waiting for. */
  eager?: boolean;
  /** Opens in the viewer (`PhotoViewer`). Off for a decorative or tiny use. */
  zoom?: boolean;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={image.src}
      srcSet={image.srcSet ?? undefined}
      sizes={image.srcSet ? sizes : undefined}
      alt={alt ?? ""}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      // Hooks for the viewer, which listens for these on the document and so
      // needs no wrapper, no client component per photo, and no JavaScript at
      // all on a page where the planner switched it off.
      data-zoom={zoom ? "" : undefined}
      data-full={zoom ? image.src : undefined}
      tabIndex={zoom ? 0 : undefined}
      role={zoom ? "button" : undefined}
      aria-label={zoom ? `Enlarge photo${alt ? `: ${alt}` : ""}` : undefined}
      className={`${className}${zoom ? " site-zoomable" : ""}`}
      style={{
        backgroundColor: image.colour ?? undefined,
        objectPosition: objectPosition(image.focal),
        ...style,
      }}
    />
  );
}
