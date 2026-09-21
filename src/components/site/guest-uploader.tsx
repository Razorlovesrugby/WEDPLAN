"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  confirmGuestUpload,
  deleteGuestUpload,
  requestGuestUpload,
} from "@/server/actions/gallery";
import { MAX_UPLOAD_BYTES } from "@/lib/site/assets";
import { toWebp } from "@/lib/site/encode-image";
import type { GalleryImage } from "@/server/queries/gallery";

/**
 * Guests adding photos, from their own RSVP link (spec 14 §9).
 *
 * The browser re-encodes to WebP before uploading — see
 * `src/lib/site/encode-image.ts` for why that matters, EXIF above all.
 */

export function GuestUploader({
  token,
  mine,
  moderated,
}: {
  token: string;
  mine: GalleryImage[];
  moderated: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList) => {
    setBusy(true);
    setStatus(null);
    let added = 0;

    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES * 3) {
        // Checked before decoding: a 200MB video would otherwise be read into
        // memory on a phone before anything rejected it.
        setStatus("One of those is far too big to be a photo.");
        continue;
      }

      const encoded = await toWebp(file);
      if (!encoded) {
        setStatus("Couldn't read one of those — is it definitely a photo?");
        continue;
      }

      const slot = await requestGuestUpload({
        token,
        content_type: "image/webp",
        byte_size: encoded.blob.size,
      });
      if (!slot.ok) {
        setStatus(slot.error);
        continue;
      }

      const put = await fetch(slot.data.uploadUrl, {
        method: "PUT",
        body: encoded.blob,
        headers: { "content-type": "image/webp" },
      }).catch(() => null);

      if (!put?.ok) {
        setStatus("That upload didn't finish. Try again?");
        continue;
      }

      await confirmGuestUpload({
        token,
        asset_id: slot.data.assetId,
        width: encoded.width,
        height: encoded.height,
      });
      added += 1;
    }

    setBusy(false);
    if (added > 0) {
      setStatus(
        moderated
          ? `Thank you — ${added === 1 ? "it's" : "they're"} with the couple to approve.`
          : `Thank you — ${added === 1 ? "it's" : "they're"} on the site.`,
      );
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        className="block w-full text-sm"
        disabled={busy}
        onChange={(event) => {
          if (event.target.files?.length) void upload(event.target.files);
        }}
      />
      <p className="mt-1 text-xs text-muted">
        {moderated
          ? "They go to the couple first, so they won't appear straight away."
          : "They'll appear on the site."}{" "}
        Location data is removed before anything is uploaded.
      </p>

      {busy ? <p className="mt-2 text-sm text-muted">Uploading…</p> : null}
      {status ? (
        <p className="mt-2 text-sm text-muted" role="status">
          {status}
        </p>
      ) : null}

      {mine.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {mine.map((image) => (
            <li key={image.id} className="relative">
              <div className="aspect-square overflow-hidden border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              {image.approvedAt === null ? (
                <span className="mt-1 block text-[0.7rem] text-muted">Waiting</span>
              ) : null}
              <button
                type="button"
                className="mt-1 text-[0.7rem] text-muted underline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteGuestUpload({ token, asset_id: image.id });
                    router.refresh();
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
