"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreRevision } from "@/server/actions/site-blocks";
import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * The published versions, newest first (spec 23 Q4).
 *
 * Restore replaces the draft, and says so before it does: the draft is
 * somebody's unfinished work, and losing it to a mis-click on a list of dates
 * is exactly the thing version history is supposed to prevent.
 */
export function RevisionList({
  revisions,
}: {
  revisions: { id: string; published_at: string; note: string | null }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-line">
        {revisions.map((revision, index) => (
          <li key={revision.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <div>
              <p className="text-sm">
                {formatDateTime(revision.published_at, "UTC")}
                {index === 0 ? (
                  <span className="ml-2 text-xs text-accent">what guests see now</span>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                {formatRelative(revision.published_at)}
                {revision.note ? ` · ${revision.note}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Load this version into your draft? Anything unpublished in the draft is replaced.",
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await restoreRevision(revision.id);
                  setMessage(
                    result.ok
                      ? `Loaded ${result.data.blocks} blocks into your draft — publish when you're happy with it`
                      : result.error,
                  );
                  router.refresh();
                });
              }}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
