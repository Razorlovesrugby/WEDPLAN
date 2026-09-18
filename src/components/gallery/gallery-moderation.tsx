"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { approveSiteAsset, deleteSiteAsset } from "@/server/actions/gallery";
import type { GalleryImage } from "@/server/queries/gallery";

/**
 * The moderation queue (spec 14 §9).
 *
 * Waiting photos first, because that is the only part with a decision in it.
 * Removal is a hard delete of the object as well as the row — somebody will
 * want a photo gone the same evening, and "hidden" is not what they asked for.
 */
export function GalleryModeration({
  pending: waiting,
  approved,
}: {
  pending: GalleryImage[];
  approved: GalleryImage[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-medium">
          Waiting {waiting.length > 0 ? `(${waiting.length})` : null}
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {waiting.map((image) => (
              <li key={image.id} className="card overflow-hidden">
                <div className="aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex gap-1 p-2">
                  <button
                    type="button"
                    className="btn-primary flex-1 px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => act(() => approveSiteAsset(image.id))}
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => act(() => deleteSiteAsset(image.id))}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-medium">On the site ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing published yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {approved.map((image) => (
              <li key={image.id}>
                <div className="aspect-square overflow-hidden border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  className="mt-1 text-xs text-muted underline"
                  disabled={busy}
                  onClick={() => act(() => deleteSiteAsset(image.id))}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
