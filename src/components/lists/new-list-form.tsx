"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createList, instantiateTemplate } from "@/server/actions/lists";
import type { ListTemplateRow } from "@/lib/types/database";

/** "Any number of freeform lists, created at will, no fixed taxonomy" — from a template or blank. */
export function NewListForm({ templates }: { templates: ListTemplateRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const checklistTemplates = templates.filter((t) => t.kind !== "timeline");

  function onCreateBlank() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createList({ title });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle("");
      setOpen(false);
      router.push(`/lists/${result.data.id}`);
    });
  }

  function onFromTemplate(key: string) {
    startTransition(async () => {
      const result = await instantiateTemplate(key);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/lists/${result.data.id}`);
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        New list
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={title}
          disabled={pending}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreateBlank();
          }}
          placeholder="Blank list title"
          className="field max-w-xs text-sm"
        />
        <button type="button" className="btn-primary" disabled={pending} onClick={onCreateBlank}>
          Create
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {checklistTemplates.length > 0 ? (
        <div>
          <p className="mb-1 text-xs text-muted">Or start from a template:</p>
          <div className="flex flex-wrap gap-2">
            {checklistTemplates.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={pending}
                onClick={() => onFromTemplate(t.key)}
                className="btn px-2 py-1 text-xs"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
