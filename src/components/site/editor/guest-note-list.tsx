"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteNote, setNoteStatus } from "@/server/actions/guestbook";
import { formatRelative } from "@/lib/format";

type Row = {
  id: string;
  body: string;
  status: "new" | "approved" | "ignored";
  createdAt: string;
  authorName: string | null;
  /** True when it came from a household's own link, so it published on arrival. */
  fromInvitation: boolean;
};

/**
 * The planner's guestbook list (spec 25 §12).
 *
 * Defaults to the waiting ones, because everything else is already handled:
 * notes from an invitation link published themselves, and the point of this
 * screen is the short queue of ones that did not.
 */
export function GuestNoteList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waiting = rows.filter((row) => row.status === "new");
  const [filter, setFilter] = useState<"waiting" | "all" | Row["status"]>(
    waiting.length > 0 ? "waiting" : "all",
  );

  const shown =
    filter === "all"
      ? rows
      : filter === "waiting"
        ? waiting
        : rows.filter((row) => row.status === filter);

  function act(run: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      await run();
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {(["waiting", "approved", "ignored", "all"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`btn ${filter === option ? "border-accent" : ""}`}
          >
            {option === "waiting" ? `Waiting (${waiting.length})` : option}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {shown.map((row) => (
            <li key={row.id} className="space-y-2 p-4">
              <p className="whitespace-pre-line text-sm">{row.body}</p>
              <p className="text-xs text-muted">
                {row.authorName ?? "No name given"} · {formatRelative(row.createdAt)}
                {row.fromInvitation ? (
                  <span className="ml-2">· from their own link</span>
                ) : (
                  <span className="ml-2">· from the shared site</span>
                )}
                {row.status === "approved" ? <span className="ml-2">· on the page</span> : null}
                {row.status === "ignored" ? <span className="ml-2">· hidden</span> : null}
              </p>

              <div className="flex flex-wrap gap-3 text-xs">
                {row.status !== "approved" ? (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setNoteStatus(row.id, "approved"))}
                  >
                    Put it on the page
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-muted hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setNoteStatus(row.id, "ignored"))}
                  >
                    Take it down
                  </button>
                )}
                {row.status === "new" ? (
                  <button
                    type="button"
                    className="text-muted hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setNoteStatus(row.id, "ignored"))}
                  >
                    Ignore
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-red-700 hover:underline"
                  disabled={pending}
                  onClick={() => {
                    // A real delete, so a confirm rather than an undo — there
                    // is nothing to undo it from.
                    if (!window.confirm("Delete this note for good?")) return;
                    act(() => deleteNote(row.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
