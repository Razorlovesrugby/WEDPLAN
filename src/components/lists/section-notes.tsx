"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSectionNotes } from "@/server/actions/lists";

/**
 * Free text under a section's own title (spec 15 §4, revised) — links,
 * ideas, anything relevant to the section that isn't itself a task.
 * Collapsed to a single line until clicked, the same "click it, type into
 * it" shape as every other inline-edit control in this app, except
 * multi-line: Enter inserts a newline rather than committing, since this is
 * prose, not a title. Saves on blur; Escape reverts and collapses without
 * saving.
 */
export function SectionNotes({ sectionId, notes }: { sectionId: string; notes: string | null }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const next = draft.trim();
    setExpanded(false);
    if (next === (notes ?? "")) return;
    startTransition(async () => {
      const result = await updateSectionNotes(sectionId, next);
      if (!result.ok) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(notes ?? "");
          setExpanded(true);
        }}
        className="mb-2 block w-full truncate rounded px-1 py-0.5 text-left text-xs normal-case text-muted hover:bg-paper hover:text-ink"
      >
        {notes ? `📝 ${notes}` : "+ Add notes"}
      </button>
    );
  }

  return (
    <div className="mb-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(notes ?? "");
            setExpanded(false);
          }
        }}
        rows={3}
        placeholder="Links, ideas, anything relevant to this section…"
        disabled={pending}
        className="field w-full text-xs normal-case"
      />
      {error ? <p className="mt-0.5 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
