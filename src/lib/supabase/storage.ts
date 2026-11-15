import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./admin";
import { SIGNED_URL_TTL_SECONDS, type ImageVariant } from "@/lib/moodboards";
import { UPLOAD_CACHE_SECONDS, mayReuseSigned, reuseSeconds } from "@/lib/storage-cache";

/**
 * The moodboards bucket.
 *
 * Private, with no RLS policies on storage.objects — see admin.ts's reason 4
 * and spec 9 section 3. Everything here therefore runs as the service role,
 * and the safety of that rests entirely on callers passing paths built by
 * storageObjectPath(), which takes uuids and nothing else.
 *
 * The bucket is created by scripts/ensure-bucket.mjs, not by a migration,
 * because a migration touching `storage` cannot be applied to the bare
 * PostgreSQL cluster scripts/verify-migrations.sh builds.
 */

export const MOODBOARD_BUCKET = "moodboards";

type SignedBatch = { signedAt: number; entries: [path: string, url: string][] };

/** Signs every path or throws, so a partial or failed batch is never cached. */
async function signNow(paths: string[], ttlSeconds: number): Promise<SignedBatch> {
  const signedAt = Date.now();
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MOODBOARD_BUCKET)
    .createSignedUrls(paths, ttlSeconds);
  if (error || !data) throw new Error(error?.message ?? "signing failed");

  const entries: [string, string][] = [];
  for (const entry of data) {
    if (entry.signedUrl && entry.path) entries.push([entry.path, entry.signedUrl]);
  }
  if (entries.length !== paths.length) throw new Error("some paths could not be signed");
  return { signedAt, entries };
}

// One cached signer per lifetime, because a cache's revalidate time is fixed.
const cachedSigners = new Map<number, (paths: string[]) => Promise<SignedBatch>>();

function cachedSigner(ttlSeconds: number) {
  let signer = cachedSigners.get(ttlSeconds);
  if (!signer) {
    signer = unstable_cache((paths: string[]) => signNow(paths, ttlSeconds), ["storage-signed-urls", String(ttlSeconds)], {
      revalidate: reuseSeconds(ttlSeconds),
    });
    cachedSigners.set(ttlSeconds, signer);
  }
  return signer;
}

/**
 * A URL the browser can load, good for `ttlSeconds`.
 *
 * Signed in batches because a board is forty images and forty round trips is
 * a slow page. Returns a map rather than an array: a partial failure (an
 * object deleted out from under a row) must leave the other thirty-nine
 * rendering, not take the page down.
 *
 * The same batch gets the same URLs for the first half of their life
 * (src/lib/storage-cache.ts): a fresh token is a fresh URL, which the browser
 * and the CDN cannot answer from cache, and re-signing on every render is what
 * spent the Free plan's egress. Reuse never stretches a URL past `ttlSeconds`,
 * so a revoked share's window (SIGNED_URL_TTL_SECONDS) is unchanged.
 */
export async function signPaths(
  paths: readonly string[],
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  // Sorted, so the same set of photographs is the same cache entry.
  const unique = [...new Set(paths.filter((path) => path.length > 0))].sort();
  if (unique.length === 0) return new Map();

  try {
    const cached = await cachedSigner(ttlSeconds)(unique);
    if (mayReuseSigned(cached.signedAt, Date.now(), ttlSeconds)) return new Map(cached.entries);
  } catch {
    // Not cached: a failed or partial batch. Fall through and sign directly.
  }

  return signDirect(unique, ttlSeconds);
}

/** Uncached signing, keeping whatever did sign. */
async function signDirect(paths: string[], ttlSeconds: number): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MOODBOARD_BUCKET)
    .createSignedUrls(paths, ttlSeconds);

  // A bucket that does not exist yet is the local-development case, and a
  // board page that 500s because nobody has run ensure-bucket.mjs is a worse
  // first experience than one that renders with broken tiles.
  if (error || !data) return signed;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/** One path, for the odd single-image case. */
export async function signPath(
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const signed = await signPaths([path], ttlSeconds);
  return signed.get(path) ?? null;
}

/**
 * A URL the browser can PUT to directly, so image bytes never pass through a
 * server action — next.config.mjs caps those at 4MB on purpose.
 *
 * The browser must send `cache-control: UPLOAD_CACHE_CONTROL` with its PUT:
 * without it Storage stores the object as `no-cache` (src/lib/storage-cache.ts).
 */
export async function createUploadUrl(
  path: string,
): Promise<{ signedUrl: string; token: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MOODBOARD_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) return null;
  return { signedUrl: data.signedUrl, token: data.token };
}

/** Server-side upload, for bytes that arrived without a browser (a clip, an import fallback). */
export async function uploadBytes(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(MOODBOARD_BUCKET)
    .upload(path, bytes, { contentType, upsert: true, cacheControl: String(UPLOAD_CACHE_SECONDS) });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Removing objects. Called BEFORE the row is deleted, never after: the
 * opposite order leaves bytes in a bucket with nothing pointing at them and
 * no way to find them again.
 */
export async function removePaths(paths: readonly string[]): Promise<{ ok: boolean; error?: string }> {
  const unique = [...new Set(paths.filter((path) => path.length > 0))];
  if (unique.length === 0) return { ok: true };

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(MOODBOARD_BUCKET).remove(unique);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type { ImageVariant };
