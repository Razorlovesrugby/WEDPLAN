"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveMoodboard, deleteMoodboard, updateMoodboard } from "@/server/actions/moodboards";
import type { MoodboardRow } from "@/lib/types/database";

export function BoardHeader({ board }: { board: MoodboardRow }) {
  const router = useRouter();
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateMoodboard(board.id, { title, description });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <header className="space-y-2">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <input
        className="w-full border-0 bg-transparent p-0 font-serif text-3xl outline-none focus:ring-0"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={save}
      />
      <textarea
        className="w-full resize-none border-0 bg-transparent p-0 text-sm text-muted outline-none focus:ring-0"
        rows={2}
        placeholder="A sentence for whoever you send this to…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={save}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await archiveMoodboard(board.id);
              if (!result.ok) setError(result.error);
              else router.push("/moodboards");
            })
          }
        >
          Archive
        </button>
        <button
          type="button"
          className="btn text-red-700"
          disabled={pending}
          onClick={() => {
            // Counts what is about to go, the way removeQuestion counts
            // answers before destroying them.
            if (!confirm("Delete this board and every image on it, from storage too?")) return;
            startTransition(async () => {
              const result = await deleteMoodboard(board.id);
              if (!result.ok) setError(result.error);
              else router.push("/moodboards");
            });
          }}
        >
          Delete
        </button>
      </div>
    </header>
  );
}
