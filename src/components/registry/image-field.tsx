"use client";

import { useRef, useState } from "react";
import { uploadSitePhoto } from "@/components/site/editor/upload-photo";

/**
 * One picture for the registry: an item's, the page hero, or the thank-you
 * photograph. Uploads through the same path as the site's photos (`registry`
 * kind, so they never turn up in the Gallery block), and stores an asset id —
 * never a URL, because the bucket is private and a URL would expire.
 *
 * `candidates` are pictures found on a pasted shop link (spec 36 §5.3). They
 * are only ever *suggestions*: nothing is stored until the owner taps one and
 * the server has fetched and re-encoded it.
 */
export function ImageField({
  label,
  value,
  onChange,
  candidates = [],
  helper,
}: {
  label: string;
  value: string | null;
  onChange: (assetId: string | null) => void;
  candidates?: string[];
  helper?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const result = await uploadSitePhoto(file, "registry");
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.assetId);
  }

  // A suggested picture: fetched through our guarded route, then handed to the
  // very same browser-side encode-and-upload as a file the owner chose.
  async function pickCandidate(url: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/registry/import-image?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't fetch that picture. Try another, or upload your own.");
        return;
      }
      const blob = await response.blob();
      await upload(new File([blob], "shop-picture", { type: blob.type || "image/jpeg" }));
    } catch {
      setError("Couldn't fetch that picture. Try another, or upload your own.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-line/30 text-xs text-muted">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address; see its route
            <img src={`/api/photo/${value}?w=480`} alt="" className="h-full w-full object-cover" />
          ) : (
            "No picture"
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "Uploading…" : value ? "Replace" : "Upload"}
            </button>
            {value ? (
              <button type="button" className="btn" onClick={() => onChange(null)}>
                Remove
              </button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {helper ? <p className="text-xs text-muted">{helper}</p> : null}
        </div>
      </div>

      {candidates.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted">Found on that page — tap the one to use:</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((url) => (
              <button
                key={url}
                type="button"
                disabled={busy}
                onClick={() => void pickCandidate(url)}
                className="h-20 w-20 overflow-hidden rounded border border-line hover:border-accent focus-visible:border-accent disabled:opacity-50"
                aria-label="Use this picture"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a stranger's image, shown only as a thumbnail to the signed-in owner; no referrer, so the shop learns nothing about this app */}
                <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
