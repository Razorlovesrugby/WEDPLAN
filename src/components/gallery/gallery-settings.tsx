"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGallerySettings } from "@/server/actions/gallery";

/**
 * Whether guests may add photos, and whether theirs wait for approval.
 *
 * On this screen rather than in the page builder (spec 23): uploads have to be
 * gated whether or not a gallery block is on the page, so this is
 * configuration, not content.
 */
export function GallerySettings({
  uploadsOpen,
  moderation,
}: {
  uploadsOpen: boolean;
  moderation: "review" | "auto";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(uploadsOpen);
  const [mode, setMode] = useState<"review" | "auto">(moderation);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { uploads_open: boolean; moderation: "review" | "auto" }) {
    setOpen(next.uploads_open);
    setMode(next.moderation);
    startTransition(async () => {
      const result = await setGallerySettings(next);
      setMessage(result.ok ? "Saved" : result.error);
      router.refresh();
    });
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Guest photos</h2>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={open}
          disabled={pending}
          onChange={(event) => save({ uploads_open: event.target.checked, moderation: mode })}
        />
        <span>
          Let guests add photos
          <span className="block text-xs text-muted">
            They upload from their own invitation link, so every photo has a household attached and
            the open internet can&rsquo;t post here.
          </span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">When a guest adds one</span>
        <select
          className="field"
          value={mode}
          disabled={pending}
          onChange={(event) =>
            save({ uploads_open: open, moderation: event.target.value as "review" | "auto" })
          }
        >
          <option value="review">Wait for my approval</option>
          <option value="auto">Put it straight on the site</option>
        </select>
      </label>

      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </section>
  );
}
