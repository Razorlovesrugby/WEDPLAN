"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBudgetCategory, renameBudgetCategory } from "@/server/actions/budget";
import type { BudgetCategoryRow } from "@/lib/types/database";

/** Rename/delete for one category header on /budget. Deleting is allowed even with items in it — they fall back to "Uncategorised" (spec 6, section 10, decision 6). */
export function CategoryHeader({ category }: { category: BudgetCategoryRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRename() {
    startTransition(async () => {
      const result = await renameBudgetCategory(category.id, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${category.name}"? Its items move to "Uncategorised".`)) return;
    startTransition(async () => {
      const result = await deleteBudgetCategory(category.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename();
              if (e.key === "Escape") setEditing(false);
            }}
            className="field text-sm"
          />
          <button type="button" disabled={pending} className="btn-primary px-2 py-1 text-xs" onClick={onRename}>
            Save
          </button>
        </div>
      ) : (
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{category.name}</h2>
      )}
      {!editing ? (
        <div className="flex gap-2 text-xs text-muted">
          <button type="button" className="hover:text-ink hover:underline" onClick={() => setEditing(true)}>
            Rename
          </button>
          <button type="button" className="text-red-700 hover:underline" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
