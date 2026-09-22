"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadSitePhoto } from "./upload-photo";

export type PhotoOption = { id: string; url: string; alt: string | null };

/**
 * Choosing a photograph for a block (spec 23, build step 3).
 *
 * Upload, or pick one already uploaded — the same photo is often wanted in
 * two places, and re-uploading it would mean two copies in the bucket and two
 * chances to crop it differently.
 *
 * The bytes go straight from this browser to storage with a signed URL; they
 * never pass through a server action. The block stores an **asset id**, not a
 * URL: the bucket is private, so the URL is signed at render time and expires
 * — a stored URL would work for an hour and then quietly stop.
 */
export function PhotoPicker({
  value,
  photos,
  onChange,
  kind = "hero",
}: {
  value: string | null;
  photos: PhotoOption[];
  onChange: (assetId: string | null) => void;
  kind?: "hero" | "gallery" | "story" | "party" | "stay";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const chosen = photos.find((photo) => photo.id === value) ?? null;

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    const result = await uploadSitePhoto(file, kind);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    onChange(result.assetId);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    startTransition(() => router.refresh());
  }

  return (
    <div className="mb-4">
      <span className="mb-1 block text-sm font-medium">Photo</span>

      {chosen ? (
        <div className="mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL
              from a private bucket; next/image would cache an expiring URL. */}
          <img src={chosen.url} alt={chosen.alt ?? ""} className="h-32 w-full object-cover" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : chosen ? "Replace" : "Upload a photo"}
        </button>
        {chosen ? (
          <button type="button" className="btn" onClick={() => onChange(null)}>
            Remove
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {photos.length > 0 ? (
        <div className="mt-3">
          <span className="mb-1 block text-xs uppercase tracking-wide text-muted">
            Or one you&rsquo;ve already added
          </span>
          <ul className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => onChange(photo.id)}
                  className={`block h-14 w-20 overflow-hidden border ${
                    photo.id === value ? "border-accent" : "border-line"
                  }`}
                  aria-label={photo.alt ?? "Use this photo"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
