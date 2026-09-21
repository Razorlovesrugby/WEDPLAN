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

export async function toWebp(file: File, maxEdge = MAX_EDGE): Promise<EncodedImage | null> {
  // Null rather than throwing: a format this browser cannot decode (HEIC on
  // an older desktop) is a thing to tell the person about, not a crash.
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  return blob ? { blob, width, height } : null;
}
