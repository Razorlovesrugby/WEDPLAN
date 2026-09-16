"use client";

import { useState } from "react";
import type { BudgetItemView, BudgetQuantityBasis, EventRow } from "@/lib/types/database";

export type BudgetItemFormValue = {
  label: string;
  vendor_name: string;
  event_id: string;
  currency: string;
  quantity_basis: BudgetQuantityBasis;
  unit_price: string;
  quantity: string;
  estimated: string;
  quoted: string;
  contracted: string;
  notes: string;
  fx_rate?: string;
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
 * event scope, currency (with the looked-up FX rate and a manual override,
 * spec 6 section 5), the basis picker, and the four money snapshots. Used by
 * both the "Add item" form and a row's "Edit" expansion.
 */
export function BudgetItemFields({
  initial,
  events,
  fxState,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: BudgetItemView;
  events: EventRow[];
  fxState: { rate: number | null; source: string } | null;
  pending: boolean;
  onSubmit: (value: BudgetItemFormValue) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [vendorName, setVendorName] = useState(initial?.vendor_name ?? "");
  const [eventId, setEventId] = useState(initial?.event_id ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "GBP");
  const [basis, setBasis] = useState<BudgetQuantityBasis>(initial?.quantity_basis ?? "flat");
  const [unitPrice, setUnitPrice] = useState(initial?.unit_price ? String(initial.unit_price / 100) : "");
  const [quantity, setQuantity] = useState(initial?.quantity !== null && initial?.quantity !== undefined ? String(initial.quantity) : "");
  const [estimated, setEstimated] = useState(initial?.estimated ? String(initial.estimated / 100) : "");
  const [quoted, setQuoted] = useState(initial?.quoted ? String(initial.quoted / 100) : "");
  const [contracted, setContracted] = useState(initial?.contracted ? String(initial.contracted / 100) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [overriding, setOverriding] = useState(false);
  const [rateOverride, setRateOverride] = useState(initial?.fx_rate ? String(initial.fx_rate) : "");

  const currencyChanged = !initial || initial.currency !== currency;

  function submit() {
    const value: BudgetItemFormValue = {
      label,
      vendor_name: vendorName,
      event_id: eventId,
      currency: currency.toUpperCase(),
      quantity_basis: basis,
      unit_price: basis === "flat" || basis === "consumption" ? "" : String(Math.round(Number(unitPrice || "0") * 100)),
      quantity: basis === "manual" ? quantity : "",
      estimated: estimated ? String(Math.round(Number(estimated) * 100)) : "",
      quoted: quoted ? String(Math.round(Number(quoted) * 100)) : "",
      contracted: contracted ? String(Math.round(Number(contracted) * 100)) : "",
      notes,
    };
    if (overriding && rateOverride.trim() && !currencyChanged) {
      value.fx_rate = rateOverride.trim();
    }
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
          Currency
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="field mt-0.5 block w-full text-sm uppercase"
          />
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

      {!currencyChanged && fxState && fxState.rate !== null ? (
        <p className="text-xs text-muted">
          Exchange rate: 1 {currency} ≈ {fxState.rate.toFixed(4)} ({fxState.source}).{" "}
          {overriding ? (
            <>
              <input
                value={rateOverride}
                onChange={(e) => setRateOverride(e.target.value)}
                className="field ml-1 inline-block w-24 text-xs"
              />{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setOverriding(false)}>
                cancel
              </button>
            </>
          ) : (
            <button type="button" className="text-accent hover:underline" onClick={() => setOverriding(true)}>
              override
            </button>
          )}
        </p>
      ) : !currencyChanged && fxState && fxState.rate === null ? (
        <p className="text-xs text-tierB">
          Rate not available — enter one manually:{" "}
          <input
            value={rateOverride}
            onChange={(e) => {
              setRateOverride(e.target.value);
              setOverriding(true);
            }}
            className="field ml-1 inline-block w-24 text-xs"
          />
        </p>
      ) : null}

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
            Unit price ({currency})
            <input
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="field mt-0.5 block w-32 text-sm"
            />
          </label>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Estimated ({currency})
          <input value={estimated} onChange={(e) => setEstimated(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
        <label className="text-xs text-muted">
          Quoted ({currency})
          <input value={quoted} onChange={(e) => setQuoted(e.target.value)} className="field mt-0.5 block w-full text-sm" />
        </label>
        <label className="text-xs text-muted">
          Contracted ({currency})
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
