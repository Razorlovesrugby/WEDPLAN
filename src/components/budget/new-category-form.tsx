"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBudgetCategory } from "@/server/actions/budget";

export function NewCategoryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createBudgetCategory(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add category
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <p className="w-full text-sm text-red-700">{error}</p> : null}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Category name"
        className="field max-w-xs text-sm"
      />
      <button type="button" disabled={pending} className="btn-primary" onClick={submit}>
        Create
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
