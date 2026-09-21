"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmBudgetFollowUp, deleteBudgetItem, dismissBudgetFollowUp, updateBudgetItem } from "@/server/actions/budget";
import { ConsumptionEditor } from "./consumption-editor";
import { PaymentList } from "./payment-list";
import { BudgetLinksPopup } from "./budget-links-popup";
import { BudgetItemFields, type BudgetItemFormValue } from "./budget-item-fields";
import { formatMoney } from "@/lib/format";
import { variance as computeVariance, filled } from "@/lib/budget";
import { trimPct } from "./budget-header";
import type { VendorLike } from "@/lib/vendors";
import type {
  BudgetItemView,
  ConsumptionComponentRow,
  EventRow,
  ListRow,
  PaymentRow,
} from "@/lib/types/database";
import type { BudgetItemLinks } from "@/server/queries/budget-links";
import type { ListItemWithList, SectionWithList } from "@/server/queries/lists";

const BASIS_LABEL: Record<BudgetItemView["quantity_basis"], string> = {
  flat: "Flat",
  per_adult: "Per adult",
  per_child: "Per child",
  per_seat: "Per seat",
  consumption: "Consumption",
  manual: "Manual",
};

/**
 * One row of `/budget`'s four-column table: the four numbers plus the live
 * `computed_current` (NZD, grossed up by 15% when the line is GST-exclusive
 * — spec 18) and variance, expanding into the full editor — fields, the
 * consumption component editor when relevant, the payment schedule, and the
 * linked-tasks popup (spec 6, sections 4 and 7).
 */
export function BudgetItemRow({
  item,
  categoryName,
  categoryAllocatedAmount,
  siblingAllocationPct,
  events,
  vendors,
  components,
  payments,
  lists,
  sections,
  allTasks,
  links,
  timezone,
  counts,
  autoOpenLinks = false,
}: {
  item: BudgetItemView;
  /** This line's category, named in the allocation hint in the editor (spec 19). */
  categoryName: string;
  /** The category's own target in minor units, or null when the wedding or the category has no percentage. */
  categoryAllocatedAmount: number | null;
  /** What the rest of this section's lines claim between them (spec 20), for the editor's "takes Drinks to 110%" hint. */
  siblingAllocationPct: number;
  events: EventRow[];
  vendors: VendorLike[];
  components: ConsumptionComponentRow[];
  payments: PaymentRow[];
  lists: ListRow[];
  /** Every section across every list, for the popup's "Link a section…" search (spec 16 §3). */
  sections: SectionWithList[];
  /** Every task across every list, for the popup's "Link a task…" search (spec 6.1, part B). */
  allTasks: ListItemWithList[];
  links: BudgetItemLinks;
  timezone: string;
  counts: { adult: number; child: number; seat: number };
  /** True when this is the `?item=` target navigated to from a linked task/list's reverse badge. */
  autoOpenLinks?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [popupOpen, setPopupOpen] = useState(autoOpenLinks);

  useEffect(() => {
    if (autoOpenLinks) setPopupOpen(true);
  }, [autoOpenLinks]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState(false);

  // A zero in either column is not a figure (0021) — comparing against one
  // produced "Under quote by $7,700.00" on a line that had no contract yet.
  const contracted = filled(item.contracted);
  const quoted = filled(item.quoted);
  const variance = contracted !== null ? contracted - (quoted ?? contracted) : null;
  // Against the line's own allocation (spec 19) — a different question from
  // the contracted-vs-quoted variance above, so both can show at once.
  const allocationVariance = computeVariance(item.computed_current, item.allocated_amount);
  const linkedCount = links.lists.length + links.sections.length + links.tasks.length;

  function onSave(value: BudgetItemFormValue) {
    startTransition(async () => {
      const result = await updateBudgetItem(item.id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditing(false);
      if (result.data.promptFollowUp) setPrompt(true);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${item.label}"? This also removes its payments and components.`)) return;
    startTransition(async () => {
      const result = await deleteBudgetItem(item.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-b border-line/60 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => setPopupOpen(true)}
          >
            {item.label}
          </button>
          {item.vendor_name ? (
            // A linked line's name is a link; a plain-text one stays text.
            // The name itself comes from v_budget_items, which prefers the
            // vendor's live name, so a rename shows up here with no sync step.
            item.vendor_id ? (
              <Link
                href={`/vendors/${item.vendor_id}`}
                className="ml-2 text-sm text-muted underline hover:text-ink"
              >
                {item.vendor_name}
              </Link>
            ) : (
              <span className="ml-2 text-sm text-muted">{item.vendor_name}</span>
            )
          ) : null}
          <div className="mt-0.5 text-xs text-muted">
            {BASIS_LABEL[item.quantity_basis]}
            {item.quantity_basis === "manual" ? ` · ${item.quantity ?? 1} × ${formatMoney(item.unit_price)}` : ""}
            {item.gst_treatment === "exclusive" ? " · GST exclusive (+15%)" : ""}
            {item.allocation_pct !== null ? ` · ${trimPct(item.allocation_pct)}% of ${categoryName}` : ""}
            {linkedCount > 0 ? ` · ${linkedCount} linked` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <button type="button" className="hover:text-ink hover:underline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" className="text-red-700 hover:underline" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
        {/* Spec 20 §7: one Estimate figure, never an Allocated column beside
            it — on a line with nothing typed the two were the same number
            twice. What shows is `effective_estimated`: typed if typed, else
            derived from the allocation and marked as such, so a figure
            nobody entered never passes for a real one. When both exist, the
            target stays as a note rather than a column (§11, question 5). */}
        <Figure
          label="Estimate"
          value={formatMoney(item.effective_estimated)}
          muted={item.estimate_source === "allocation"}
          note={
            item.estimate_source === "allocation"
              ? "from allocation"
              : item.allocated_amount !== null
                ? `allocated ${formatMoney(item.allocated_amount)}${item.gst_treatment === "exclusive" ? " all-in" : ""}`
                : undefined
          }
        />
        <Figure label="Quoted" value={formatMoney(quoted)} />
        <Figure label="Contracted" value={formatMoney(contracted)} />
        <Figure label="Current" value={formatMoney(item.computed_current)} strong />
        <Figure
          label="Outstanding"
          value={formatMoney(item.outstanding)}
          tone={item.outstanding > 0 ? "warn" : "good"}
        />
      </div>
      {variance !== null && variance !== 0 ? (
        <p className="text-xs text-muted">
          {variance > 0 ? "Over" : "Under"} quote by {formatMoney(Math.abs(variance))}
        </p>
      ) : null}
      {allocationVariance !== null ? (
        <p className="text-xs text-muted">
          {allocationVariance.amount === 0 ? (
            "Exactly on its allocation"
          ) : (
            <span className={allocationVariance.amount > 0 ? "text-tierB" : "text-tierA"}>
              {formatMoney(Math.abs(allocationVariance.amount))} {allocationVariance.amount > 0 ? "over" : "under"} its
              allocation
              {allocationVariance.pct !== null ? ` (${trimPct(Math.abs(allocationVariance.pct))}%)` : ""}
            </span>
          )}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {prompt ? (
        <FollowUpPrompt item={item} onDone={() => setPrompt(false)} />
      ) : null}

      {editing ? (
        <div className="rounded border border-line bg-paper/40 p-3">
          <BudgetItemFields
            initial={item}
            events={events}
            vendors={vendors}
            pending={pending}
            categoryName={categoryName}
            categoryAllocatedAmount={categoryAllocatedAmount}
            siblingAllocationPct={siblingAllocationPct}
            onSubmit={onSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}

      {item.quantity_basis === "consumption" ? (
        <ConsumptionEditor budgetItemId={item.id} components={components} counts={counts} />
      ) : null}

      <PaymentList budgetItemId={item.id} payments={payments} timezone={timezone} />

      <BudgetLinksPopup
        itemId={item.id}
        itemLabel={item.label}
        lists={lists}
        sections={sections}
        allTasks={allTasks}
        links={links}
        timezone={timezone}
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
  tone,
  muted,
  note,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warn" | "good";
  /** A figure nobody typed — spec 19's allocation-derived estimate. */
  muted?: boolean;
  note?: string;
}) {
  const toneClass = muted ? "text-muted" : tone === "warn" ? "text-tierB" : tone === "good" ? "text-tierA" : "text-ink";
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular-nums ${strong ? "font-medium" : ""} ${toneClass}`}>{value}</div>
      {note ? <div className="text-[0.65rem] uppercase tracking-wide text-muted">{note}</div> : null}
    </div>
  );
}

function FollowUpPrompt({ item, onDone }: { item: BudgetItemView; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = accept ? await confirmBudgetFollowUp(item.id) : await dismissBudgetFollowUp(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="rounded border border-accent/40 bg-accent/5 p-2 text-sm">
      {error ? <p className="text-red-700">{error}</p> : null}
      <p>
        Add a checklist item to chase final numbers for {item.vendor_name || item.label}?
      </p>
      <div className="mt-1 flex gap-2">
        <button type="button" disabled={pending} className="btn-primary px-2 py-1 text-xs" onClick={() => respond(true)}>
          Add it
        </button>
        <button type="button" disabled={pending} className="btn px-2 py-1 text-xs" onClick={() => respond(false)}>
          No thanks
        </button>
      </div>
    </div>
  );
}
