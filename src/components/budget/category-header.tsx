"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBudgetCategory, renameBudgetCategory, setCategoryAllocation } from "@/server/actions/budget";
import { formatMoney } from "@/lib/format";
import { trimPct } from "./budget-header";
import type { BudgetCategoryRow, BudgetCategoryTotalsView } from "@/lib/types/database";

/**
 * Rename/delete for one category header on /budget, plus spec 19's
 * allocation: the percentage of the overall budget this category is meant to
 * take, and the rollup of what it currently costs against that target.
 *
 * Deleting is allowed even with items in it — they fall back to
 * "Uncategorised" (spec 6, section 10, decision 6).
 */
export function CategoryHeader({
  category,
  totals,
  hasTotalBudget,
}: {
  category: BudgetCategoryRow;
  /** This category's row from v_budget_category_totals — absent only if the view and the table disagree. */
  totals?: BudgetCategoryTotalsView;
  /** False when the wedding has no overall budget yet: a percentage saves fine, it just has no amount to be a percentage of. */
  hasTotalBudget: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [editingPct, setEditingPct] = useState(false);
  const [pct, setPct] = useState(category.allocation_pct !== null ? String(category.allocation_pct) : "");
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

  function onSavePct() {
    startTransition(async () => {
      const trimmed = pct.trim();
      const result = await setCategoryAllocation(category.id, trimmed === "" ? null : trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditingPct(false);
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
    <div className="mb-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{category.name}</h2>
            {editingPct ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSavePct();
                    if (e.key === "Escape") setEditingPct(false);
                  }}
                  placeholder="12"
                  className="field w-16 text-sm"
                  aria-label={`${category.name} share of the overall budget, in percent`}
                />
                <span className="text-xs text-muted">%</span>
                <button type="button" disabled={pending} className="btn-primary px-2 py-1 text-xs" onClick={onSavePct}>
                  Save
                </button>
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setEditingPct(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="text-xs text-muted hover:text-ink hover:underline"
                onClick={() => setEditingPct(true)}
              >
                {category.allocation_pct !== null
                  ? `${trimPct(category.allocation_pct)}%${
                      totals?.allocated_amount !== null && totals?.allocated_amount !== undefined
                        ? ` · ${formatMoney(totals.allocated_amount)}`
                        : ""
                    }`
                  : "Set %"}
              </button>
            )}
          </div>
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
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {category.allocation_pct !== null && !hasTotalBudget ? (
        <p className="text-xs text-muted">Set an overall budget above to turn this percentage into an amount.</p>
      ) : null}

      {totals && totals.allocated_amount !== null ? <CategoryRollup totals={totals} /> : null}
    </div>
  );
}

/**
 * Target vs. current, with the over/under said both ways (spec 19 §12,
 * decision 2): against this category's own allocation, and as the share of
 * the whole budget it's actually taking.
 */
function CategoryRollup({ totals }: { totals: BudgetCategoryTotalsView }) {
  const allocated = totals.allocated_amount ?? 0;
  const over = (totals.variance_amount ?? 0) > 0;
  const on = (totals.variance_amount ?? 0) === 0;
  // Capped at 100% of the bar's width — an eye-catching full bar says "over"
  // better than a bar that runs off the row.
  const filled = allocated > 0 ? Math.min(100, Math.round((totals.total_current / allocated) * 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded bg-line/50" aria-hidden>
        <div className={`h-full ${over ? "bg-tierB" : "bg-tierA"}`} style={{ width: `${filled}%` }} />
      </div>
      <p className="text-xs text-muted">
        <span className="tabular-nums text-ink">{formatMoney(totals.total_current)}</span> of{" "}
        <span className="tabular-nums">{formatMoney(allocated)}</span>
        {on ? (
          " · exactly on target"
        ) : (
          <>
            {" · "}
            <span className={over ? "text-tierB" : "text-tierA"}>
              {formatMoney(Math.abs(totals.variance_amount ?? 0))} {over ? "over" : "under"}
              {totals.variance_pct !== null ? ` (${trimPct(Math.abs(totals.variance_pct))}%)` : ""}
            </span>
          </>
        )}
        {totals.share_of_budget_pct !== null && totals.allocation_pct !== null ? (
          <>
            {" · taking "}
            {trimPct(totals.share_of_budget_pct)}% of the budget, against {trimPct(totals.allocation_pct)}% planned
          </>
        ) : null}
      </p>
      {totals.allocation_only_count > 0 ? (
        <p className="text-xs text-muted">
          {totals.allocation_only_count} of {totals.item_count} lines still using their allocation as the estimate.
        </p>
      ) : null}
    </div>
  );
}
