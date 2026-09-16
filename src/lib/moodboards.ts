/**
 * Moodboard rules that are worth testing away from a database.
 *
 * Per docs/HANDOFF.md section 8, a "use server" module may only export async
 * functions, so anything with a decision in it has to live outside one. Two
 * things in here guard something real rather than merely tidying code:
 *
 *   storageObjectPath() is the whole of the tenancy story for the storage
 *   bucket. There are no RLS policies on storage.objects — every object is
 *   written and signed by the service role — so the only thing keeping one
 *   wedding's images away from another is that this function builds the path
 *   from ids the server has already checked. It takes no filename, no
 *   extension and no caller-supplied string. A client that could name its own
 *   path could name somebody else's.
 *
 *   validateUpload() is the only thing between a paste and a full bucket.
 */

/** What the upload pipeline will accept from a file picker, a drop or a clip. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Rejected before a byte is read. A 20MP phone photo is comfortably under this. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

/**
 * Animated GIFs are passed through untranscoded, because drawing one to a
 * canvas keeps the first frame and silently discards the animation — a worse
 * outcome than the larger file. So they get their own, lower ceiling.
 */
export const MAX_GIF_BYTES = 5 * 1024 * 1024;

export const MAX_ITEMS_PER_BOARD = 200;

/** Soft cap, checked when an upload slot is requested. The bucket has its own. */
export const MAX_WEDDING_BYTES = 1024 * 1024 * 1024;

/** Longest edge of the copy shown in the lightbox. */
export const DISPLAY_MAX_EDGE = 2000;

/** Longest edge of the copy the grid loads. */
export const THUMB_MAX_EDGE = 480;

export const DISPLAY_QUALITY = 0.82;
export const THUMB_QUALITY = 0.7;

/** How long a signed image URL lives. Also the window in which a revoked share's images stay reachable. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ImageVariant = "display" | "thumb";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isAcceptedImageType(value: unknown): value is AcceptedImageType {
  return typeof value === "string" && (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Where an item's bytes live in the bucket.
 *
 * Every segment is a uuid the server produced or verified. Nothing here is
 * derived from a filename, a URL or anything else a client sent. GIFs keep
 * their extension because they are stored untranscoded; everything else is
 * WebP by the time it arrives.
 */
export function storageObjectPath(
  weddingId: string,
  moodboardId: string,
  itemId: string,
  variant: ImageVariant,
  contentType: string = "image/webp",
): string {
  for (const id of [weddingId, moodboardId, itemId]) {
    if (!isUuid(id)) throw new Error("storageObjectPath needs uuids, and was given something else");
  }
  // The thumbnail is always WebP: it is generated, never passed through.
  const extension = variant === "thumb" ? "webp" : contentType === "image/gif" ? "gif" : "webp";
  const suffix = variant === "thumb" ? "_thumb" : "";
  return `${weddingId}/${moodboardId}/${itemId}${suffix}.${extension}`;
}

/**
 * The size a source image is drawn at, preserving aspect ratio.
 *
 * Never upscales: a 200px screenshot stays 200px rather than being blown up
 * to 2000 and stored at ten times the size for no extra detail.
 */
export function downscaleTarget(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error("downscaleTarget needs positive dimensions");
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return {
    // Always at least 1px: a 4000x1 panorama must not round its height to zero.
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export type UploadCheck = { ok: true } | { ok: false; reason: string };

/**
 * Returns a specific message rather than a boolean, because every one of
 * these is something the person is about to see next to the file that caused
 * it. "Upload failed" is not a message.
 */
export function validateUpload(input: {
  contentType: string;
  byteSize: number;
  fileName?: string;
  itemCount: number;
  weddingBytes: number;
}): UploadCheck {
  const label = input.fileName ? `"${input.fileName}"` : "That image";

  if (!isAcceptedImageType(input.contentType)) {
    // HEIC gets its own sentence: it is what an iPhone produces, and the fix
    // is a real thing the person can do rather than a shrug.
    if (/heic|heif/i.test(input.contentType)) {
      return {
        ok: false,
        reason: `${label} is an iPhone HEIC image, which most browsers can't read. Convert it to JPEG first.`,
      };
    }
    return { ok: false, reason: `${label} isn't an image this can use (JPEG, PNG, WebP or GIF).` };
  }

  if (input.byteSize <= 0) {
    return { ok: false, reason: `${label} is empty.` };
  }

  if (input.contentType === "image/gif" && input.byteSize > MAX_GIF_BYTES) {
    return {
      ok: false,
      reason: `${label} is a GIF over ${Math.round(MAX_GIF_BYTES / 1024 / 1024)}MB. GIFs are stored as-is to keep them animated, so they have a smaller limit.`,
    };
  }

  if (input.byteSize > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      reason: `${label} is over ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)}MB.`,
    };
  }

  if (input.itemCount >= MAX_ITEMS_PER_BOARD) {
    return {
      ok: false,
      reason: `This board is full (${MAX_ITEMS_PER_BOARD} images). Start another one.`,
    };
  }

  if (input.weddingBytes + input.byteSize > MAX_WEDDING_BYTES) {
    return { ok: false, reason: "That would go over the storage limit for this wedding." };
  }

  return { ok: true };
}

/**
 * Drag-to-reorder. Integer sort_order with a full resequence on drop, the
 * same as list_items — a board holds tens of images, not the hundreds of
 * households that earned src/lib/rank.ts its fractional keys.
 *
 * Returns only the rows whose position actually changed, so a drag writes two
 * or three rows rather than forty.
 */
export function resequence<T extends { id: string; sort_order: number }>(
  items: readonly T[],
  movedId: string,
  toIndex: number,
): { id: string; sort_order: number }[] {
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const from = ordered.findIndex((item) => item.id === movedId);
  if (from === -1) return [];

  const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (clamped === from) return [];

  const [moved] = ordered.splice(from, 1);
  if (!moved) return [];
  ordered.splice(clamped, 0, moved);

  const changed: { id: string; sort_order: number }[] = [];
  ordered.forEach((item, index) => {
    if (item.sort_order !== index) changed.push({ id: item.id, sort_order: index });
  });
  return changed;
}

export type ShareLifetime = { revoked_at: string | null; expires_at: string | null };

/** Revoked beats expiry beats open. A share with neither set lives until revoked. */
export function shareIsLive(share: ShareLifetime, now: Date = new Date()): boolean {
  if (share.revoked_at !== null) return false;
  if (share.expires_at === null) return true;
  return new Date(share.expires_at).getTime() > now.getTime();
}
