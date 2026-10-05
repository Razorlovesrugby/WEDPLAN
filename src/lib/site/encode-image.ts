/**
 * Re-encoding a photograph in the browser, before it is uploaded.
 *
 * Browser only — it needs `createImageBitmap` and a canvas. Shared by the
 * guest uploader (spec 14 §9) and the planner's own photo picker (spec 23),
 * because the reasons it exists apply to both and a second copy would
 * eventually stop stripping something:
 *
 *   **EXIF goes.** A phone writes GPS coordinates into every photo it takes,
 *   and for a wedding those coordinates are usually somebody's home address.
 *   Re-encoding drops the metadata entirely rather than trying to edit it out.
 *
 *   **The file gets sensible.** A 6MB HEIC from a modern phone becomes a few
 *   hundred KB, which is the difference between a page that loads at a venue
 *   with one bar of signal and one that does not.
 *
 *   **The extension becomes a fact.** Everything stored is WebP, so
 *   `siteAssetPath` does not have to guess what arrived.
 */

const MAX_EDGE = 2000;

export type EncodedImage = { blob: Blob; width: number; height: number };

/** Never upscales: a photograph already smaller than `maxEdge` keeps its size. */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * The mean colour of some RGBA pixels as `#rrggbb`, or null when there is
 * nothing opaque to average.
 *
 * Painted behind an image until it decodes, so a slow connection shows a
 * tinted box rather than a blank one that pops. Fully transparent pixels are
 * skipped — a PNG with a clear background would otherwise average to black.
 */
export function averageColour(rgba: ArrayLike<number>): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 16) continue;
    r += rgba[i] ?? 0;
    g += rgba[i + 1] ?? 0;
    b += rgba[i + 2] ?? 0;
    count += 1;
  }
  if (count === 0) return null;
  const hex = (n: number) => Math.round(n / count).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

async function encodeBitmap(
  bitmap: ImageBitmap,
  maxEdge: number,
): Promise<EncodedImage | null> {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  return blob ? { blob, width, height } : null;
}

export async function toWebp(file: File, maxEdge = MAX_EDGE): Promise<EncodedImage | null> {
  // Null rather than throwing: a format this browser cannot decode (HEIC on
  // an older desktop) is a thing to tell the person about, not a crash.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const encoded = await encodeBitmap(bitmap, maxEdge);
  bitmap.close();
  return encoded;
}

export type EncodedSet = {
  original: EncodedImage;
  /** Narrower copies, only for edges the original is genuinely larger than. */
  variants: { edge: number; image: EncodedImage }[];
  colour: string | null;
};

/**
 * The original plus a narrower copy per requested edge, from one decode, and
 * the photograph's average colour (spec 27 D1, D2).
 *
 * A phone then downloads ~60KB for a band instead of ~400KB. A copy is made
 * only when the original is larger than that edge: upscaling a 700px photo to
 * "960" would be a bigger file of the same pixels.
 */
export async function toWebpSet(
  file: File,
  edges: readonly number[],
): Promise<EncodedSet | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const original = await encodeBitmap(bitmap, MAX_EDGE);
  if (!original) {
    bitmap.close();
    return null;
  }

  const longEdge = Math.max(original.width, original.height);
  const variants: EncodedSet["variants"] = [];
  for (const edge of [...edges].sort((a, b) => a - b)) {
    if (edge >= longEdge) continue;
    const image = await encodeBitmap(bitmap, edge);
    if (image) variants.push({ edge, image });
  }

  // 16x16 is plenty for a placeholder tint, and cheap.
  let colour: string | null = null;
  const sample = document.createElement("canvas");
  sample.width = 16;
  sample.height = 16;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (context) {
    context.drawImage(bitmap, 0, 0, 16, 16);
    colour = averageColour(context.getImageData(0, 0, 16, 16).data);
  }

  bitmap.close();
  return { original, variants, colour };
}
