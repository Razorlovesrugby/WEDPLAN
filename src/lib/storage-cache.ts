/**
 * Keeping Supabase Storage egress down (the Free plan's 5 GB ran out in
 * November 2026, almost all of it uncached photo downloads).
 *
 * Two causes, two halves of the fix:
 *
 *   1. Every object was stored with `cache-control: no-cache`, because the
 *      browser uploaders PUT to a signed upload URL without the header and
 *      Storage defaults to it. So every view re-downloaded every photo.
 *      Paths are always built from a fresh uuid and never rewritten with
 *      different bytes, so an object may be cached for a year.
 *
 *   2. Every render signed a fresh URL, and a new token is a new URL to the
 *      browser and the CDN, so even a cacheable object was never reused.
 *      storage.ts now reuses a signed URL for the first half of its life.
 */

/** A year: what a browser and the CDN may keep an uploaded object for. */
export const UPLOAD_CACHE_SECONDS = 365 * 24 * 60 * 60;

/** The header a browser PUT to a signed upload URL sends; Storage stores it as the object's cache-control. */
export const UPLOAD_CACHE_CONTROL = `max-age=${UPLOAD_CACHE_SECONDS}`;

/**
 * How long a signed URL is reused before it is re-signed: half its life, so
 * whatever a page renders always has at least half its life left.
 */
export function reuseSeconds(ttlSeconds: number): number {
  return Math.max(1, Math.floor(ttlSeconds / 2));
}

/**
 * Whether a cached batch of signed URLs may still be handed out. The cache
 * can serve an entry past its revalidate time (stale-while-revalidate), and
 * after a quiet day that entry's URLs would already have expired — so the age
 * is checked here rather than trusted to the cache.
 */
export function mayReuseSigned(signedAtMs: number, nowMs: number, ttlSeconds: number): boolean {
  const ageMs = nowMs - signedAtMs;
  return ageMs >= 0 && ageMs < reuseSeconds(ttlSeconds) * 1000;
}
