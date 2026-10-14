"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InlineText } from "@/components/guests/inline-text";
import { archiveMoodboard, deleteMoodboard, updateMoodboard } from "@/server/actions/moodboards";
import type { MoodboardRow } from "@/lib/types/database";

export function BoardHeader({ board }: { board: MoodboardRow }) {
  const router = useRouter();
  const [description, setDescription] = useState(board.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The description saves on blur, but only when it changed — a click in and out
  // used to write and refresh the page for nothing.
  function saveDescription() {
    if (description.trim() === (board.description ?? "")) return;
    startTransition(async () => {
      const result = await updateMoodboard(board.id, { description });
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <header className="space-y-2">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {/* The title is a field that looks like a heading, so it gets a hover
          outline (InlineText) and an explicit Rename — on a phone there is no
          hover to find it by (spec 31 §3.10). Enter or leaving the field saves,
          Escape puts the old name back. */}
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1">
          <InlineText
            id="board-title"
            ariaLabel="Board name"
            value={board.title}
            className="font-serif text-3xl"
            onSave={async (next) => {
              const result = await updateMoodboard(board.id, { title: next });
              if (result.ok) router.refresh();
              // "Some fields need fixing" says nothing; the schema's own words do
              // ("Give the board a name").
              return result.ok
                ? { ok: true }
                : { ok: false, error: result.fieldErrors?.title?.[0] ?? result.error };
            }}
          />
        </div>
        <button
          type="button"
          className="shrink-0 text-xs text-muted underline"
          onClick={() => document.getElementById("board-title")?.focus()}
        >
          ✎ Rename
        </button>
      </div>
      <textarea
        className="w-full resize-none border-0 bg-transparent p-0 text-sm text-muted outline-none focus:ring-0"
        rows={2}
        placeholder="A sentence for whoever you send this to…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={saveDescription}
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
