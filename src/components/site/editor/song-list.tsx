"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSongRequest, mergeSongs, setCouplesPick, setSongStatus } from "@/server/actions/songs";
import { formatRelative, formatTime } from "@/lib/format";
import type { PlannerSong } from "@/server/queries/site-extras";

type Status = PlannerSong["status"];

const NEXT_LABEL: Record<Status, { label: string; next: Status }> = {
  new: { label: "Approve", next: "approved" },
  approved: { label: "Mark played", next: "played" },
  played: { label: "Un-play", next: "approved" },
  ignored: { label: "Approve", next: "approved" },
};

/**
 * The couple's list (spec 23 §8, spec 31 §7).
 *
 * Ranked the way guests see the chart, with who voted — names here, counts
 * only on the guest page (spec 31 Q6). Two modes:
 *
 *   **The list** — approve / ignore / delete, the ♥ couple's pick (three at
 *   most, a badge that never changes the order), and Merge for two rows that
 *   are the same song typed two ways.
 *
 *   **The night** — big targets, listed songs only, one tap marks a song
 *   played and it sinks to the bottom. Built for a phone held in one hand
 *   beside a DJ booth. Marking played puts "♪ Played at 9:42 pm" on guests'
 *   charts and the newest one at the top as Now playing.
 */
export function SongList({ rows, timeZone }: { rows: PlannerSong[]; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [mode, setMode] = useState<"list" | "night">("list");
  const [merging, setMerging] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function act(run: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  const tabs = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2 text-sm" role="tablist">
        {(["list", "night"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={`btn px-3 py-1 ${mode === option ? "border-accent" : ""}`}
          >
            {option === "list" ? "The list" : "On the night"}
          </button>
        ))}
      </div>
      <div className="flex gap-3 text-sm">
        <a className="text-muted hover:underline" href="/api/export/songs">
          Export CSV
        </a>
        <a className="text-muted hover:underline" href="/site/songs/print">
          Print for the DJ
        </a>
      </div>
    </div>
  );

  if (mode === "night") {
    const listed = rows.filter((row) => row.status === "approved" || row.status === "played");
    // Still to play in chart order, then played with the latest first.
    const ordered = [
      ...listed.filter((row) => row.status !== "played"),
      ...listed
        .filter((row) => row.status === "played")
        .sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? "")),
    ];
    return (
      <div className="space-y-4">
        {tabs}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <ul className="space-y-2">
          {ordered.map((row) => {
            const played = row.status === "played";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => setSongStatus(row.id, played ? "approved" : "played"))}
                  aria-pressed={played}
                  className={`card flex w-full items-center gap-4 px-4 py-4 text-left ${played ? "opacity-50" : ""}`}
                >
                  <span className="w-10 shrink-0 text-center text-2xl">{played ? "✓" : "♪"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-medium">{row.title}</span>
                    <span className="block text-sm text-muted">
                      {row.artist ?? "—"} · ▲ {row.votes}
                      {row.couplesPick ? " · ♥" : ""}
                      {played && row.playedAt ? ` · played ${formatTime(row.playedAt, timeZone)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted">{played ? "Undo" : "Played"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const shown = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  const picks = rows.filter((row) => row.couplesPick).length;
  const [first, second] = merging.map((id) => rows.find((row) => row.id === id)).filter(Boolean) as PlannerSong[];

  return (
    <div className="space-y-3">
      {tabs}

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
              <span className="ml-1 text-muted">{rows.filter((row) => row.status === option).length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {merging.length > 0 ? (
        <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
          {first && second ? (
            <span>
              Keep <span className="font-medium">{first.title}</span>, fold in{" "}
              <span className="font-medium">{second.title}</span> and its votes?
            </span>
          ) : (
            <span className="text-muted">Tick one more to merge it into the first.</span>
          )}
          <span className="flex gap-3">
            {first && second ? (
              <button
                type="button"
                className="btn-primary px-3 py-1"
                disabled={pending}
                onClick={() => {
                  act(() => mergeSongs(first.id, second.id));
                  setMerging([]);
                }}
              >
                Merge
              </button>
            ) : null}
            <button type="button" className="text-muted hover:underline" onClick={() => setMerging([])}>
              Cancel
            </button>
          </span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ol className="card divide-y divide-line">
        {shown.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                aria-label={`Select ${row.title} to merge`}
                checked={merging.includes(row.id)}
                onChange={(event) =>
                  setMerging((was) =>
                    event.target.checked ? [...was, row.id].slice(-2) : was.filter((id) => id !== row.id),
                  )
                }
              />
              {row.art ? (
                // eslint-disable-next-line @next/next/no-img-element -- already a sized proxy
                <img src={row.art} alt="" width={32} height={32} className="h-8 w-8 shrink-0 object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="mr-2 tabular-nums text-muted">▲ {row.votes}</span>
                  <span className="font-medium">{row.title}</span>
                  {row.artist ? <span className="text-muted"> · {row.artist}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {row.askedBy ? `${row.askedBy} · ` : ""}
                  {formatRelative(row.createdAt)}
                  {row.status !== "new" ? ` · ${row.status}` : ""}
                  {row.voters.length > 0 ? ` · voted: ${row.voters.join(", ")}` : ""}
                </p>
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className={row.couplesPick ? "text-accent" : "text-muted hover:underline"}
                disabled={pending || (!row.couplesPick && picks >= 3)}
                title={!row.couplesPick && picks >= 3 ? "Three picks already — take the ♥ off one first" : undefined}
                aria-pressed={row.couplesPick}
                onClick={() => act(() => setCouplesPick(row.id, !row.couplesPick))}
              >
                {row.couplesPick ? "♥ Our pick" : "♡ Pick"}
              </button>
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
      </ol>
    </div>
  );
}
