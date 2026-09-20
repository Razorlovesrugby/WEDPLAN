"use client";

import { useState } from "react";
import { allocationEstimate, itemAllocation } from "@/lib/budget";
import { trimPct } from "./budget-header";
import { formatMoney } from "@/lib/format";
import type { BudgetItemView, BudgetQuantityBasis, EventRow } from "@/lib/types/database";

export type BudgetItemFormValue = {
  label: string;
  vendor_name: string;
  event_id: string;
  quantity_basis: BudgetQuantityBasis;
  unit_price: string;
  quantity: string;
  estimated: string;
  quoted: string;
  contracted: string;
  notes: string;
  gst_treatment: "inclusive" | "exclusive";
  allocation_pct: string;
};

const BASIS_OPTIONS: { value: BudgetQuantityBasis; label: string }[] = [
  { value: "flat", label: "Flat amount" },
  { value: "per_adult", label: "Per adult" },
  { value: "per_child", label: "Per child" },
  { value: "per_seat", label: "Per seat (adult + child)" },
  { value: "consumption", label: "Consumption (components below)" },
  { value: "manual", label: "Manual (quantity × unit price)" },
];

/**
 * Shared fields for creating and editing a budget line — label, vendor,
 * event scope, the basis picker, the GST toggle (spec 18), the allocation
 * percentage (spec 19), and the four money snapshots. Used by both the
 * "Add item" form and a row's "Edit" expansion.
 */
export function BudgetItemFields({
  initial,
  events,
  pending,
  categoryName,
  categoryAllocatedAmount,
  siblingAllocationPct,
  onSubmit,
  onCancel,
}: {
  initial?: BudgetItemView;
  events: EventRow[];
  pending: boolean;
  /** This line's category, named in the allocation hint ("10% of Drinks"). */
  categoryName: string;
  /** The category's own target in minor units, or null when the wedding or the category has no percentage yet. */
  categoryAllocatedAmount: number | null;
  /** What the section's OTHER lines already claim, so the hint can say where this one takes it (spec 20 §6). */
  siblingAllocationPct: number;
  onSubmit: (value: BudgetItemFormValue) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [vendorName, setVendorName] = useState(initial?.vendor_name ?? "");
  const [eventId, setEventId] = useState(initial?.event_id ?? "");
  const [basis, setBasis] = useState<BudgetQuantityBasis>(initial?.quantity_basis ?? "flat");
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ? String(initial.unit_price / 100) : "");
  const [quantity, setQuantity] = useState(initial?.quantity !== null && initial?.quantity !== undefined ? String(initial.quantity) : "");
  const [estimated, setEstimated] = useState(initial?.estimated ? String(initial.estimated / 100) : "");
  const [quoted, setQuoted] = useState(initial?.quoted ? String(initial.quoted / 100) : "");
  const [contracted, setContracted] = useState(initial?.contracted ? String(initial.contracted / 100) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [gstTreatment, setGstTreatment] = useState<"inclusive" | "exclusive">(initial?.gst_treatment ?? "inclusive");
  const [allocationPct, setAllocationPct] = useState(
    initial?.allocation_pct !== null && initial?.allocation_pct !== undefined ? String(initial.allocation_pct) : "",
  );

  // The same math v_budget_items does, live while typing — src/lib/budget.ts
  // exists so the preview and the server can't disagree.
  const pctNumber = allocationPct.trim() === "" ? null : Number(allocationPct);
  const allocated =
    pctNumber !== null && Number.isFinite(pctNumber) ? itemAllocation(categoryAllocatedAmount, pctNumber) : null;
  const derivedEstimate = allocationEstimate(allocated, gstTreatment);
  // Where this line's percentage takes the whole section (spec 20) — shown
  // while typing, so an over-allocation is visible before saving.
  const sectionPct =
    pctNumber !== null && Number.isFinite(pctNumber)
      ? Math.round((siblingAllocationPct + pctNumber) * 100) / 100
      : null;

  function submit() {
    const value: BudgetItemFormValue = {
      label,
      vendor_name: vendorName,
      event_id: eventId,
      quantity_basis: basis,
      unit_price: basis === "flat" || basis === "consumption" ? "" : String(Math.round(Number(unitPrice || "0") * 100)),
      quantity: basis === "manual" ? quantity : "",
      estimated: estimated ? String(Math.round(Number(estimated) * 100)) : "",
      quoted: quoted ? String(Math.round(Number(quoted) * 100)) : "",
      contracted: contracted ? String(Math.round(Number(contracted) * 100)) : "",
      notes,
      gst_treatment: gstTreatment,
      allocation_pct: allocationPct.trim(),
    };
    onSubmit(value);
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
        <label className="text-xs text-muted">
          Vendor (optional)
          <input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="field mt-0.5 block w-full text-sm"
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Event (optional — scopes live counts)
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="field mt-0.5 block w-full text-sm">
            <option value="">Whole wedding</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          GST
          <select
            value={gstTreatment}
            onChange={(e) => setGstTreatment(e.target.value as "inclusive" | "exclusive")}
            className="field mt-0.5 block w-full text-sm"
          >
            <option value="inclusive">GST inclusive</option>
            <option value="exclusive">GST exclusive (+15%)</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          Basis
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as BudgetQuantityBasis)}
            className="field mt-0.5 block w-full text-sm"
          >
            {BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {basis !== "flat" && basis !== "consumption" ? (
        <div className="flex flex-wrap items-end gap-2">
          {basis === "manual" ? (
            <label className="block text-xs text-muted">
              Quantity
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                className="field mt-0.5 block w-24 text-sm"
              />
            </label>
          ) : null}
          <label className="block text-xs text-muted">
            Unit price ($NZD)
            <input
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="field mt-0.5 block w-32 text-sm"
            />
          </label>
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="block text-xs text-muted">
          Allocation (% of {categoryName})
          <input
            value={allocationPct}
            onChange={(e) => setAllocationPct(e.target.value)}
            placeholder="10"
            className="field mt-0.5 block w-24 text-sm"
          />
        </label>
        {pctNumber !== null && allocated !== null && derivedEstimate !== null ? (
          <p className="text-xs text-muted">
            {allocationPct.trim()}% of {categoryName} ({formatMoney(categoryAllocatedAmount)}) ={" "}
            <strong className="text-ink">{formatMoney(allocated)}</strong>
            {gstTreatment === "exclusive" ? ` — ${formatMoney(derivedEstimate)} excl. GST` : ""}
            {estimated.trim() === ""
              ? " · used as this line's estimate until you type one"
              : " · your typed estimate wins; clear it to fall back to this"}
            {sectionPct !== null ? (
              <>
                {" · takes "}
                {categoryName} to{" "}
                <span className={sectionPct > 100 ? "text-tierB" : ""}>{trimPct(sectionPct)}%</span>
              </>
            ) : null}
          </p>
        ) : pctNumber !== null ? (
          <p className="text-xs text-muted">
            Takes {categoryName} to{" "}
            <span className={sectionPct !== null && sectionPct > 100 ? "text-tierB" : ""}>
              {sectionPct !== null ? `${trimPct(sectionPct)}%` : "—"}
            </span>
            . Set an overall budget and a % on {categoryName} to turn it into an amount.
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Estimated ($NZD)
          <input value={estimated} onChange={(e) => setEstimated(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
        <label className="text-xs text-muted">
          Quoted ($NZD)
          <input value={quoted} onChange={(e) => setQuoted(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
        <label className="text-xs text-muted">
          Contracted ($NZD)
          <input value={contracted} onChange={(e) => setContracted(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="field mt-0.5 block w-full text-sm" />
      </label>

      <div className="flex gap-2">
        <button type="button" disabled={pending || !label.trim()} className="btn-primary px-3 py-1 text-sm" onClick={submit}>
          Save
        </button>
        <button type="button" className="btn px-3 py-1 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
