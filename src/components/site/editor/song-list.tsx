"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSongRequest, setSongStatus } from "@/server/actions/songs";
import { formatRelative } from "@/lib/format";

type Row = {
  id: string;
  title: string;
  artist: string | null;
  status: "new" | "approved" | "played" | "ignored";
  createdAt: string;
  askedBy: string | null;
};

const NEXT_LABEL: Record<Row["status"], { label: string; next: Row["status"] }> = {
  new: { label: "Approve", next: "approved" },
  approved: { label: "Mark played", next: "played" },
  played: { label: "Un-play", next: "approved" },
  ignored: { label: "Approve", next: "approved" },
};

/**
 * The planner's list (spec 23 §8, Q2).
 *
 * Grouped by nothing and sorted newest first: this is a list you skim once a
 * week and hand over in one piece, not a database to administer. Delete is a
 * real delete — a spam row should leave no trace.
 */
export function SongList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");

  const shown = filter === "all" ? rows : rows.filter((row) => row.status === filter);

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
        {(["all", "new", "approved", "played", "ignored"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`btn px-2 py-0.5 text-xs ${filter === option ? "border-accent" : ""}`}
          >
            {option}
            {option !== "all" ? (
              <span className="ml-1 text-muted">
                {rows.filter((row) => row.status === option).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <ul className="card divide-y divide-line">
        {shown.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
            <div>
              <p className="text-sm">
                <span className="font-medium">{row.title}</span>
                {row.artist ? <span className="text-muted"> · {row.artist}</span> : null}
              </p>
              <p className="text-xs text-muted">
                {row.askedBy ? `${row.askedBy} · ` : ""}
                {formatRelative(row.createdAt)}
                {row.status !== "new" ? ` · ${row.status}` : ""}
              </p>
            </div>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className="text-muted hover:underline"
                disabled={pending}
                onClick={() => act(() => setSongStatus(row.id, NEXT_LABEL[row.status].next))}
              >
                {NEXT_LABEL[row.status].label}
              </button>
              {row.status !== "ignored" ? (
                <button
                  type="button"
                  className="text-muted hover:underline"
                  disabled={pending}
                  onClick={() => act(() => setSongStatus(row.id, "ignored"))}
                >
                  Ignore
                </button>
              ) : null}
              <button
                type="button"
                className="text-red-700 hover:underline"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Delete "${row.title}"?`)) return;
                  act(() => deleteSongRequest(row.id));
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
