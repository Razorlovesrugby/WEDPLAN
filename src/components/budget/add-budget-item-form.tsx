"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBudgetItem } from "@/server/actions/budget";
import { BudgetItemFields, type BudgetItemFormValue } from "./budget-item-fields";
import type { EventRow } from "@/lib/types/database";

export function AddBudgetItemForm({ categoryId, events }: { categoryId: string; events: EventRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(value: BudgetItemFormValue) {
    startTransition(async () => {
      const result = await createBudgetItem({ ...value, category_id: categoryId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setOpen(true)}>
        + Add item
      </button>
    );
  }

  return (
    <div className="rounded border border-line bg-paper/40 p-3">
      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      <BudgetItemFields events={events} fxState={null} pending={pending} onSubmit={onSubmit} onCancel={() => setOpen(false)} />
    </div>
  );
}
