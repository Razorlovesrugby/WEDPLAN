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

  // Spec 42 §5.3 (Q9): changes wait for Save, with a note while they differ.
  const dirty = open !== uploadsOpen || mode !== moderation;

  function save() {
    startTransition(async () => {
      const result = await setGallerySettings({ uploads_open: open, moderation: mode });
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
          onChange={(event) => {
            setOpen(event.target.checked);
            setMessage(null);
          }}
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
          onChange={(event) => {
            setMode(event.target.value as "review" | "auto");
            setMessage(null);
          }}
        >
          <option value="review">Wait for my approval</option>
          <option value="auto">Put it straight on the site</option>
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
        {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
        {!dirty && message ? <span className="text-xs text-muted">{message}</span> : null}
      </div>
    </section>
  );
}
