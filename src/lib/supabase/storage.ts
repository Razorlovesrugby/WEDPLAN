import "server-only";
import { createAdminClient } from "./admin";
import { SIGNED_URL_TTL_SECONDS, type ImageVariant } from "@/lib/moodboards";

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

/**
 * A URL the browser can load, good for an hour.
 *
 * Signed in batches because a board is forty images and forty round trips is
 * a slow page. Returns a map rather than an array: a partial failure (an
 * object deleted out from under a row) must leave the other thirty-nine
 * rendering, not take the page down.
 */
export async function signPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter((path) => path.length > 0))];
  if (unique.length === 0) return signed;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MOODBOARD_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

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
export async function signPath(path: string): Promise<string | null> {
  const signed = await signPaths([path]);
  return signed.get(path) ?? null;
}

/**
 * A URL the browser can PUT to directly, so image bytes never pass through a
 * server action — next.config.mjs caps those at 4MB on purpose.
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
    .upload(path, bytes, { contentType, upsert: true });

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
