/**
 * A helper's photo, shrunk on their phone before it is sent (spec 54 §6.10):
 * at most 1600 px on the long side, as a JPEG. The size maths is pure and
 * tested; the canvas step needs a browser and is checked on a real phone.
 */

export const PHOTO_MAX_EDGE = 1600;
/** A larger file than this is refused before shrinking (§11). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_JPEG_QUALITY = 0.82;

/** Never upscales. */
export function photoSize(width: number, height: number, maxEdge: number = PHOTO_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export function isPhotoType(type: string): boolean {
  return (PHOTO_TYPES as readonly string[]).includes(type.toLowerCase());
}

/** Browser only. Null when the browser can't decode it (an unsupported HEIC, say). */
export async function shrinkToJpeg(file: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const { width, height } = photoSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", PHOTO_JPEG_QUALITY));
}
