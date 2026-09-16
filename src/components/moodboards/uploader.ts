"use client";

import { deriveImages, DecodeError } from "@/lib/moodboard-image";
import { validateUpload } from "@/lib/moodboards";
import { confirmUpload, requestUploadSlots } from "@/server/actions/moodboards";

/**
 * The browser half of an upload, shared by the board page and the Pinterest
 * import so both go through exactly one set of caps and one code path.
 *
 * Order: derive both copies -> ask the server for slots (which inserts the
 * rows and hands back signed URLs) -> PUT the bytes straight to storage ->
 * confirm. The bytes never pass through a server action; next.config.mjs caps
 * those at 4MB on purpose.
 */

export type PendingFile = {
  file: File;
  /** Set by the Pinterest import; absent for an ordinary upload. */
  meta?: { origin: "pinterest"; externalId: string; caption: string | null; sourceUrl: string; credit: string | null };
};

export type UploadOutcome = {
  uploaded: number;
  failures: { name: string; reason: string }[];
};

async function put(url: string, blob: Blob, contentType: string): Promise<boolean> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "true" },
    body: blob,
  });
  return response.ok;
}

export async function uploadFiles(
  moodboardId: string,
  pending: readonly PendingFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadOutcome> {
  const failures: { name: string; reason: string }[] = [];
  const derived: {
    name: string;
    blobDisplay: Blob;
    blobThumb: Blob;
    width: number;
    height: number;
    contentType: string;
    meta: PendingFile["meta"];
  }[] = [];

  // Decode first, all of it, so a file that cannot be read never creates a
  // row that then has to be cleaned up.
  for (const entry of pending) {
    const name = entry.file.name || "image";
    const quick = validateUpload({
      contentType: entry.file.type,
      byteSize: entry.file.size,
      fileName: name,
      itemCount: 0,
      weddingBytes: 0,
    });
    if (!quick.ok) {
      failures.push({ name, reason: quick.reason });
      continue;
    }

    try {
      const images = await deriveImages(entry.file);
      derived.push({
        name,
        blobDisplay: images.display,
        blobThumb: images.thumb,
        width: images.width,
        height: images.height,
        contentType: images.contentType,
        meta: entry.meta,
      });
    } catch (error) {
      failures.push({
        name,
        reason: error instanceof DecodeError ? error.message : "That image couldn't be read.",
      });
    }
  }

  if (derived.length === 0) return { uploaded: 0, failures };

  const slotResult = await requestUploadSlots(
    moodboardId,
    derived.map((entry) => ({
      contentType: entry.contentType,
      byteSize: entry.blobDisplay.size,
      fileName: entry.name,
      ...(entry.meta
        ? {
            origin: entry.meta.origin,
            externalId: entry.meta.externalId,
            ...(entry.meta.caption ? { caption: entry.meta.caption } : {}),
            sourceUrl: entry.meta.sourceUrl,
            ...(entry.meta.credit ? { credit: entry.meta.credit } : {}),
          }
        : {}),
    })),
  );

  if (!slotResult.ok) {
    return { uploaded: 0, failures: [...failures, { name: "", reason: slotResult.error }] };
  }

  for (const rejection of slotResult.data.rejected) {
    failures.push({ name: rejection.fileName ?? "image", reason: rejection.reason });
  }

  // Slots come back only for the requests that were accepted, in order, so
  // they line up with the accepted subset rather than with `derived`.
  const accepted = derived.filter(
    (entry) => !slotResult.data.rejected.some((rejection) => rejection.fileName === entry.name),
  );

  let done = 0;
  let uploaded = 0;

  for (const [index, slot] of slotResult.data.slots.entries()) {
    const entry = accepted[index];
    if (!entry) continue;

    const okDisplay = await put(slot.displayUrl, entry.blobDisplay, entry.contentType);
    const okThumb = await put(slot.thumbUrl, entry.blobThumb, entry.contentType === "image/gif" ? "image/gif" : "image/webp");

    if (okDisplay && okThumb) {
      await confirmUpload(slot.itemId, {
        width: entry.width,
        height: entry.height,
        byteSize: entry.blobDisplay.size,
        contentType: entry.contentType,
      });
      uploaded += 1;
    } else {
      // The row stays behind with uploaded_at null, which is what the board
      // page shows as a failed tile with retry and remove.
      failures.push({ name: entry.name, reason: "Storage rejected the upload." });
    }

    done += 1;
    onProgress?.(done, slotResult.data.slots.length);
  }

  return { uploaded, failures };
}
