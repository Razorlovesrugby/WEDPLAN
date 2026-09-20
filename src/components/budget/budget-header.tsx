"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applySuggestedAllocations, setTotalBudget } from "@/server/actions/budget";
import { formatMoney } from "@/lib/format";
import { SUGGESTED_TOTAL_PCT } from "@/lib/budget-allocations";
import type { BudgetSummaryView } from "@/lib/types/database";

/**
 * The top-down half of /budget (spec 19): one overall budget, how much of it
 * the categories have claimed between them, and what the wedding currently
 * costs against it. Everything below this block is still spec 6's bottom-up
 * table.
 *
 * Percentages are never enforced (spec 19 §12, decision 3) — 103% saves
 * fine; the unallocated figure is the whole feedback mechanism.
 */
export function BudgetHeader({
  summary,
  suggestableCategoryCount,
}: {
  summary: BudgetSummaryView;
  /** Categories with no percentage yet — the "Suggest percentages" control is pointless without one. */
  suggestableCategoryCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(summary.total_budget !== null ? String(summary.total_budget / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const trimmed = value.trim();
      const result = await setTotalBudget(trimmed === "" ? null : String(Math.round(Number(trimmed) * 100)));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditing(false);
      router.refresh();
    });
  }

  function suggest() {
    startTransition(async () => {
      const result = await applySuggestedAllocations();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setNote(
        result.data.applied === 0
          ? "Nothing to suggest — no unallocated category matched the starter list."
          : `Suggested a percentage for ${result.data.applied} ${result.data.applied === 1 ? "category" : "categories"}. Edit any of them below.`,
      );
      router.refresh();
    });
  }

  const overBudget = summary.budget_variance !== null && summary.budget_variance > 0;

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Overall budget</h2>
        {!editing ? (
          <button type="button" className="text-xs text-muted hover:text-ink hover:underline" onClick={() => setEditing(true)}>
            {summary.total_budget === null ? "Set a budget" : "Edit"}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            Overall budget ($NZD)
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="40000"
              className="field mt-0.5 block w-40 text-sm"
            />
          </label>
          <button type="button" disabled={pending} className="btn-primary px-3 py-1 text-sm" onClick={save}>
            Save
          </button>
          <button type="button" className="btn px-3 py-1 text-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <p className="w-full text-xs text-muted">
            Treated as a GST-inclusive figure — what actually leaves the account. Leave it blank to remove it.
          </p>
        </div>
      ) : summary.total_budget === null ? (
        <p className="text-sm text-muted">
          Set an overall budget to allocate by percentage — then give each category a share of it, and each line a
          share of its category.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Budget" value={formatMoney(summary.total_budget)} />
            {/* Spec 20 §6: worded to match the per-section line, so the
                same idea reads the same way at both grains. */}
            <Figure
              label="Allocated"
              value={summary.total_allocated_pct !== null ? `${trimPct(summary.total_allocated_pct)}%` : "—"}
              hint={
                summary.total_allocated_amount !== null
                  ? `${formatMoney(summary.total_allocated_amount)} of the budget allocated`
                  : "no category has a % yet"
              }
            />
            <Figure
              label={summary.unallocated_amount !== null && summary.unallocated_amount < 0 ? "Over-allocated" : "Left to allocate"}
              value={summary.unallocated_amount !== null ? formatMoney(Math.abs(summary.unallocated_amount)) : "—"}
              tone={summary.unallocated_amount !== null && summary.unallocated_amount < 0 ? "warn" : undefined}
              hint={
                summary.unallocated_amount !== null && summary.unallocated_amount < 0
                  ? "the categories' percentages add up to more than 100%"
                  : "not yet given to any category"
              }
            />
            <Figure
              label="Current"
              value={formatMoney(summary.total_current)}
              tone={overBudget ? "warn" : "good"}
              hint={
                summary.budget_variance === null
                  ? undefined
                  : summary.budget_variance === 0
                    ? "exactly on budget"
                    : `${formatMoney(Math.abs(summary.budget_variance))} ${overBudget ? "over" : "under"}`
              }
            />
          </div>

          {suggestableCategoryCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <button type="button" disabled={pending} className="btn px-2 py-1 text-xs" onClick={suggest}>
                Suggest percentages
              </button>
              <span>
                Fills only the {suggestableCategoryCount} categor{suggestableCategoryCount === 1 ? "y" : "ies"} with no
                % yet, from a typical {SUGGESTED_TOTAL_PCT}% split. Every one stays editable.
              </span>
            </div>
          ) : null}
          {note ? <p className="text-xs text-muted">{note}</p> : null}
        </>
      )}
    </section>
  );
}

/** "12.50" reads as clutter next to "12" — drop a trailing .00 but keep a real fraction. */
export function trimPct(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "good";
}) {
  const toneClass = tone === "warn" ? "text-tierB" : tone === "good" ? "text-tierA" : "text-ink";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 font-serif text-2xl tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
