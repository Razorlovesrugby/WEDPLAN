"use client";

import { toWebp } from "@/lib/site/encode-image";
import { MAX_UPLOAD_BYTES } from "@/lib/site/assets";
import { confirmSitePhotoUpload, requestSitePhotoUpload } from "@/server/actions/site-photos";

/**
 * One photograph from this browser to storage, returning its asset id.
 *
 * The bytes go straight to storage with a signed URL and never pass through a
 * server action (see `site-photos.ts`). Shared by the site builder's picker
 * and the save-the-date editor, so there is one upload path to keep right.
 */
export async function uploadSitePhoto(
  file: File,
  kind: "hero" | "gallery" | "story" | "party" | "stay",
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES * 3) {
    // Checked before decoding: a 200MB video would otherwise be read into
    // memory before anything rejected it.
    return { ok: false, error: "That's far too big to be a photo." };
  }

  const encoded = await toWebp(file);
  if (!encoded)
    return {
      ok: false,
      error: "Couldn't read that one — is it definitely a photo?",
    };

  const slot = await requestSitePhotoUpload({
    kind,
    content_type: "image/webp",
    byte_size: encoded.blob.size,
  });
  if (!slot.ok) return { ok: false, error: slot.error };

  const put = await fetch(slot.data.uploadUrl, {
    method: "PUT",
    body: encoded.blob,
    headers: { "content-type": "image/webp" },
  }).catch(() => null);
  if (!put?.ok) return { ok: false, error: "That upload didn't finish. Try again?" };

  await confirmSitePhotoUpload({
    asset_id: slot.data.assetId,
    width: encoded.width,
    height: encoded.height,
  });

  return { ok: true, assetId: slot.data.assetId };
}
