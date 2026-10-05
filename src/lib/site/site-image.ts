import { SITE_IMAGE_WIDTHS, isSiteImageWidth, type SiteImageWidth } from "./assets";

/**
 * Everything the renderer needs to draw one of the couple's photographs well
 * (spec 27 step 2).
 *
 * A photograph is referenced by **asset id**, never by URL: the bucket is
 * private, so a stored URL would work for as long as its signature does. The
 * `src` here is therefore the app's own stable address for it,
 * `/api/photo/<id>`, which checks the photograph may be shown and redirects to
 * a freshly signed URL. A guest who opens the page, leaves it, and scrolls it
 * again after dinner gets photos that still load.
 *
 * Pure: built from a row, returns plain data, so it can be tested without a
 * database and passed across the server/client boundary.
 */

export type SiteImageData = {
  id: string;
  /** The original, 2000px on its long edge. */
  src: string;
  /** Only when narrower copies exist; null otherwise, never a broken list. */
  srcSet: string | null;
  width: number | null;
  height: number | null;
  /** `#rrggbb`, painted behind the image until it decodes. */
  colour: string | null;
  /** 0–1 from the top-left; where the subject is. */
  focal: { x: number; y: number } | null;
};

export type SiteImageRow = {
  id: string;
  width: number | null;
  height: number | null;
  variants?: number[] | null;
  colour?: string | null;
  focal_x?: number | string | null;
  focal_y?: number | string | null;
};

/** The stable address for a photograph, or one of its narrower copies. */
export function photoPath(id: string, variant: SiteImageWidth | "display" = "display"): string {
  return variant === "display" ? `/api/photo/${id}` : `/api/photo/${id}?w=${variant}`;
}

/**
 * Pixel width of a copy whose *long edge* is `edge`.
 *
 * Variants are defined by their long edge, but a `srcset` width descriptor is
 * the image's actual width: a 960px-tall portrait is not 960px wide, and
 * describing it as such makes the browser pick one that is too small.
 */
export function pixelWidth(edge: number, width: number, height: number): number {
  if (width <= 0 || height <= 0) return edge;
  return width >= height ? edge : Math.max(1, Math.round((edge * width) / height));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const HEX = /^#[0-9a-f]{6}$/;

export function buildSiteImage(row: SiteImageRow): SiteImageData {
  const width = row.width && row.width > 0 ? row.width : null;
  const height = row.height && row.height > 0 ? row.height : null;

  // Only variants this build knows about, and only when the dimensions needed
  // to describe them are known — a srcset without them would mislead the
  // browser, and "no srcset" is simply the old behaviour.
  const variants = (row.variants ?? []).filter(isSiteImageWidth).sort((a, b) => a - b);
  const srcSet =
    width && height && variants.length > 0
      ? [
          ...variants.map((edge) => `${photoPath(row.id, edge)} ${pixelWidth(edge, width, height)}w`),
          `${photoPath(row.id)} ${width}w`,
        ].join(", ")
      : null;

  const fx = toNumber(row.focal_x);
  const fy = toNumber(row.focal_y);

  return {
    id: row.id,
    src: photoPath(row.id),
    srcSet,
    width,
    height,
    colour: row.colour && HEX.test(row.colour) ? row.colour : null,
    focal: fx !== null && fy !== null ? { x: clamp01(fx), y: clamp01(fy) } : null,
  };
}

/** `object-position` for a focal point; the browser's own centre when there is none. */
export function objectPosition(focal: SiteImageData["focal"]): string {
  if (!focal) return "50% 50%";
  return `${Math.round(clamp01(focal.x) * 100)}% ${Math.round(clamp01(focal.y) * 100)}%`;
}

/**
 * The widths this build asks the browser to generate on upload, longest edge.
 * Re-exported so the uploader and the route agree with the schema's check.
 */
export const VARIANT_EDGES = SITE_IMAGE_WIDTHS;
