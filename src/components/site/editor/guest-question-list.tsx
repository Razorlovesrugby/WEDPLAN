"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteQuestion, setQuestionStatus } from "@/server/actions/questions-inbox";
import { formatRelative } from "@/lib/format";

type Row = {
  id: string;
  body: string;
  status: "new" | "answered" | "dismissed";
  createdAt: string;
  authorName: string | null;
  contact: string | null;
};

/** The planner's inbox of guest questions. Defaults to the ones still waiting. */
export function GuestQuestionList({ rows }: { rows: Row[] }) {
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
        {(["waiting", "answered", "dismissed", "all"] as const).map((option) => (
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
                {row.contact ? <span className="ml-2">· reply to {row.contact}</span> : null}
                {row.status === "answered" ? <span className="ml-2">· answered</span> : null}
                {row.status === "dismissed" ? <span className="ml-2">· dismissed</span> : null}
              </p>

              <div className="flex flex-wrap gap-3 text-xs">
                {row.status !== "answered" ? (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setQuestionStatus(row.id, "answered"))}
                  >
                    Mark answered
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-muted hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setQuestionStatus(row.id, "new"))}
                  >
                    Mark as waiting
                  </button>
                )}
                {row.status === "new" ? (
                  <button
                    type="button"
                    className="text-muted hover:underline"
                    disabled={pending}
                    onClick={() => act(() => setQuestionStatus(row.id, "dismissed"))}
                  >
                    Dismiss
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-red-700 hover:underline"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("Delete this question for good?")) return;
                    act(() => deleteQuestion(row.id));
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
