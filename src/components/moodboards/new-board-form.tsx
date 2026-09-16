"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createMoodboard } from "@/server/actions/moodboards";

export function NewBoardForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        New board
      </button>
    );
  }

  return (
    <div className="card space-y-2 p-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field sm:w-72"
          autoFocus
          placeholder="Photography vibes"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button type="button" className="btn-primary" disabled={pending || !title.trim()} onClick={create}>
          Create
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );

  function create() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createMoodboard({ title });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setOpen(false);
      router.push(`/moodboards/${result.data.id}`);
    });
  }
}
