"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBudgetCategory, renameBudgetCategory, setCategoryAllocation } from "@/server/actions/budget";
import { formatMoney } from "@/lib/format";
import { sectionAllocation } from "@/lib/budget";
import { trimPct } from "./budget-header";
import type { BudgetCategoryRow, BudgetCategoryTotalsView, BudgetItemView } from "@/lib/types/database";

/**
 * Rename/delete for one category header on /budget, plus spec 19's
 * allocation: the percentage of the overall budget this category is meant to
 * take, and the rollup of what it currently costs against that target.
 *
 * Spec 20 adds the line above that rollup: how much of this section's
 * allocation its own lines have claimed between them — does 38 + 30 + 42 add
 * to 100? It does not, and nothing on the page used to say so.
 *
 * Deleting is allowed even with items in it — they fall back to
 * "Uncategorised" (spec 6, section 10, decision 6).
 */
export function CategoryHeader({
  category,
  totals,
  lines,
  hasTotalBudget,
}: {
  category: BudgetCategoryRow;
  /** This category's row from v_budget_category_totals — absent only if the view and the table disagree. */
  totals?: BudgetCategoryTotalsView;
  /** This category's own lines, for spec 20's section allocation summary. */
  lines: BudgetItemView[];
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

      <SectionAllocationSummary
        categoryName={category.name}
        lines={lines}
        categoryTarget={totals?.allocated_amount ?? null}
      />

      {totals && totals.allocated_amount !== null ? <CategoryRollup totals={totals} /> : null}
    </div>
  );
}

/**
 * Spec 20: what this section's lines have claimed of its allocation. A
 * different question from the rollup below it — this one is "how much of the
 * target has no line claimed yet", not "are we on track to spend it" — so it
 * gets its own line and its own vocabulary ("left to allocate", never
 * "under").
 *
 * Warn, never block (spec 20 §11, decision 4): 110% shows in the warning
 * colour and saves exactly like any other number.
 */
function SectionAllocationSummary({
  categoryName,
  lines,
  categoryTarget,
}: {
  categoryName: string;
  lines: BudgetItemView[];
  categoryTarget: number | null;
}) {
  const section = sectionAllocation(
    lines.map((line) => ({ allocationPct: line.allocation_pct })),
    categoryTarget,
  );
  // Nothing to say about a section nobody has given a percentage to.
  if (section.withPct === 0) return null;

  const over = section.remainingPct < 0;
  const exact = section.remainingPct === 0;

  return (
    <div className="text-xs text-muted">
      <p>
        <span className={over ? "font-medium text-tierB" : "font-medium text-ink"}>
          {trimPct(section.allocatedPct)}% of {categoryName} allocated
        </span>
        {section.allocatedAmount !== null && categoryTarget !== null ? (
          <>
            {" · "}
            <span className="tabular-nums">
              {formatMoney(section.allocatedAmount)} of {formatMoney(categoryTarget)}
            </span>
          </>
        ) : null}
        {exact ? (
          " · fully allocated"
        ) : (
          <>
            {" · "}
            <span className={over ? "text-tierB" : ""}>
              {section.remainingAmount !== null ? `${formatMoney(Math.abs(section.remainingAmount))} ` : ""}
              {over ? (
                <>({trimPct(Math.abs(section.remainingPct))}%) over-allocated</>
              ) : (
                <>({trimPct(section.remainingPct)}%) left to allocate</>
              )}
            </span>
          </>
        )}
      </p>
      {section.withoutPct > 0 ? (
        <p>
          {section.withoutPct} {section.withoutPct === 1 ? "line has" : "lines have"} no % set —{" "}
          {section.withoutPct === 1 ? "its estimate isn't" : "their estimates aren't"} counted above.
        </p>
      ) : null}
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
