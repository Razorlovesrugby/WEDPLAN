"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmBudgetFollowUp, deleteBudgetItem, dismissBudgetFollowUp, updateBudgetItem } from "@/server/actions/budget";
import { ConsumptionEditor } from "./consumption-editor";
import { PaymentList } from "./payment-list";
import { BudgetLinksPopup } from "./budget-links-popup";
import { BudgetItemFields, type BudgetItemFormValue } from "./budget-item-fields";
import { formatMoney } from "@/lib/format";
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
  events,
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
  events: EventRow[];
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

  const variance = item.contracted !== null ? item.contracted - (item.quoted ?? item.contracted) : null;
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
          {item.vendor_name ? <span className="ml-2 text-sm text-muted">{item.vendor_name}</span> : null}
          <div className="mt-0.5 text-xs text-muted">
            {BASIS_LABEL[item.quantity_basis]}
            {item.quantity_basis === "manual" ? ` · ${item.quantity ?? 1} × ${formatMoney(item.unit_price)}` : ""}
            {item.gst_treatment === "exclusive" ? " · GST exclusive (+15%)" : ""}
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
        <Figure label="Estimated" value={formatMoney(item.estimated)} />
        <Figure label="Quoted" value={formatMoney(item.quoted)} />
        <Figure label="Contracted" value={formatMoney(item.contracted)} />
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

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {prompt ? (
        <FollowUpPrompt item={item} onDone={() => setPrompt(false)} />
      ) : null}

      {editing ? (
        <div className="rounded border border-line bg-paper/40 p-3">
          <BudgetItemFields
            initial={item}
            events={events}
            pending={pending}
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
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warn" | "good";
}) {
  const toneClass = tone === "warn" ? "text-tierB" : tone === "good" ? "text-tierA" : "text-ink";
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular-nums ${strong ? "font-medium" : ""} ${toneClass}`}>{value}</div>
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
