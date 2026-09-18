/**
 * Where a site image lives in storage (spec 14 §4, §9).
 *
 * Same discipline as spec 9's moodboards, and for the same reason: the bucket
 * is private and carries no policies at all, so the only thing protecting one
 * wedding's photos from another is that **paths are derived server-side from
 * ids the server has already checked**, never accepted from a client. A client
 * that could name its own path could name somebody else's.
 *
 * Reusing the `moodboards` bucket rather than creating a second one, so
 * `ensure-bucket.mjs` stays the single infrastructure step and nobody deploys
 * with half the storage set up. The prefix keeps the two apart.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SITE_ASSET_PREFIX = "site";

export type SiteImageVariant = "display" | "thumb";

export function siteAssetPath(
  weddingId: string,
  assetId: string,
  variant: SiteImageVariant = "display",
): string {
  for (const id of [weddingId, assetId]) {
    if (!UUID.test(id)) {
      // Throwing rather than sanitising: a non-uuid here means a caller passed
      // something a user controls, and quietly cleaning it up would hide that.
      throw new Error("siteAssetPath needs uuids, and was given something else");
    }
  }
  const suffix = variant === "thumb" ? "_thumb" : "";
  // Always WebP: everything is re-encoded on the way in, so the extension is
  // a fact rather than a guess about what was uploaded.
  return `${SITE_ASSET_PREFIX}/${weddingId}/${assetId}${suffix}.webp`;
}

/** Bytes a guest may upload per image, and how many per household. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_UPLOADS_PER_HOUSEHOLD = 40;

export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

export function isAcceptedUploadType(value: string): boolean {
  return (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(value.toLowerCase());
}
