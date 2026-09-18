"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addConsumptionComponent,
  removeConsumptionComponent,
  updateConsumptionComponent,
} from "@/server/actions/budget";
import { componentTotal } from "@/lib/budget";
import { formatMoney } from "@/lib/format";
import type { ConsumptionComponentRow } from "@/lib/types/database";

/**
 * Add/remove/edit component rows within a consumption-mode budget line
 * (spec 6, section 3) — each priced independently, summed for the parent
 * item's `computed_current`. The per-row and running totals are computed
 * client-side with src/lib/budget.ts's componentTotal, the same function the
 * server's v_budget_items view mirrors, so what's shown while typing matches
 * what saves.
 */
export function ConsumptionEditor({
  budgetItemId,
  components,
  counts,
}: {
  budgetItemId: string;
  components: ConsumptionComponentRow[];
  counts: { adult: number; child: number; seat: number };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  const total = components.reduce(
    (sum, c) =>
      sum +
      componentTotal(
        {
          guestBasis: c.guest_basis,
          servingsPerGuestPerHour: c.servings_per_guest_per_hour,
          durationHours: c.duration_hours,
          pricePerServing: c.price_per_serving,
          wastageBufferPct: c.wastage_buffer_pct,
        },
        counts,
      ),
    0,
  );

  function onRemove(id: string) {
    startTransition(async () => {
      const result = await removeConsumptionComponent(id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded border border-line/70 bg-paper/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Components</p>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {components.length === 0 ? (
        <p className="text-sm text-muted">No components yet — add one below.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 pr-2 font-normal">Label</th>
              <th className="pb-1 pr-2 font-normal">Basis</th>
              <th className="pb-1 pr-2 font-normal">Servings/guest/hr</th>
              <th className="pb-1 pr-2 font-normal">Hours</th>
              <th className="pb-1 pr-2 font-normal">Price/serving</th>
              <th className="pb-1 pr-2 font-normal">Wastage</th>
              <th className="pb-1 pr-2 text-right font-normal">Total</th>
              <th className="pb-1" />
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <ComponentRow
                key={c.id}
                component={c}
                counts={counts}
                pending={pending}
                onRemove={() => onRemove(c.id)}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      )}
      <p className="text-sm">
        Component total: <strong>{formatMoney(total)}</strong>
      </p>
      {adding ? (
        <AddComponentForm
          budgetItemId={budgetItemId}
          onDone={() => setAdding(false)}
          onError={setError}
        />
      ) : (
        <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setAdding(true)}>
          + Add a component
        </button>
      )}
    </div>
  );
}

function ComponentRow({
  component,
  counts,
  pending,
  onRemove,
  onError,
}: {
  component: ConsumptionComponentRow;
  counts: { adult: number; child: number; seat: number };
  pending: boolean;
  onRemove: () => void;
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, startTransition] = useTransition();

  const total = componentTotal(
    {
      guestBasis: component.guest_basis,
      servingsPerGuestPerHour: component.servings_per_guest_per_hour,
      durationHours: component.duration_hours,
      pricePerServing: component.price_per_serving,
      wastageBufferPct: component.wastage_buffer_pct,
    },
    counts,
  );

  if (editing) {
    return (
      <tr>
        <td colSpan={8} className="py-2">
          <AddComponentForm
            budgetItemId={component.budget_item_id}
            initial={component}
            onDone={() => setEditing(false)}
            onError={onError}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-line/50">
      <td className="py-1 pr-2">{component.label}</td>
      <td className="py-1 pr-2">{component.guest_basis === "per_adult" ? "Per adult" : "Per seat"}</td>
      <td className="py-1 pr-2">{component.servings_per_guest_per_hour}</td>
      <td className="py-1 pr-2">{component.duration_hours}</td>
      <td className="py-1 pr-2">{formatMoney(component.price_per_serving)}</td>
      <td className="py-1 pr-2">{Math.round(component.wastage_buffer_pct * 100)}%</td>
      <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(total)}</td>
      <td className="py-1 text-right">
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEditing(true)}>
          Edit
        </button>{" "}
        <button
          type="button"
          disabled={pending || saving}
          className="text-xs text-red-700 hover:underline"
          onClick={() => {
            startTransition(onRemove);
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function AddComponentForm({
  budgetItemId,
  initial,
  onDone,
  onError,
}: {
  budgetItemId: string;
  initial?: ConsumptionComponentRow;
  onDone: () => void;
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [guestBasis, setGuestBasis] = useState<"per_adult" | "per_seat">(initial?.guest_basis ?? "per_adult");
  const [rate, setRate] = useState(String(initial?.servings_per_guest_per_hour ?? "1"));
  const [hours, setHours] = useState(String(initial?.duration_hours ?? "4"));
  const [price, setPrice] = useState(String(initial ? initial.price_per_serving / 100 : ""));
  const [wastage, setWastage] = useState(String(initial ? Math.round(initial.wastage_buffer_pct * 100) : "0"));

  function submit() {
    const fields = {
      label,
      guest_basis: guestBasis,
      servings_per_guest_per_hour: rate,
      duration_hours: hours,
      price_per_serving: Math.round(Number(price || "0") * 100),
      wastage_buffer_pct: Number(wastage || "0") / 100,
    };
    startTransition(async () => {
      const result = initial
        ? await updateConsumptionComponent(initial.id, fields)
        : await addConsumptionComponent(budgetItemId, fields);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onError(null);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-white p-2">
      <label className="text-xs text-muted">
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="field mt-0.5 block w-32 text-sm" />
      </label>
      <label className="text-xs text-muted">
        Basis
        <select
          value={guestBasis}
          onChange={(e) => setGuestBasis(e.target.value as "per_adult" | "per_seat")}
          className="field mt-0.5 block text-sm"
        >
          <option value="per_adult">Per adult</option>
          <option value="per_seat">Per seat</option>
        </select>
      </label>
      <label className="text-xs text-muted">
        Servings/guest/hr
        <input value={rate} onChange={(e) => setRate(e.target.value)} className="field mt-0.5 block w-20 text-sm" />
      </label>
      <label className="text-xs text-muted">
        Hours
        <input value={hours} onChange={(e) => setHours(e.target.value)} className="field mt-0.5 block w-16 text-sm" />
      </label>
      <label className="text-xs text-muted">
        Price/serving
        <input value={price} onChange={(e) => setPrice(e.target.value)} className="field mt-0.5 block w-20 text-sm" />
      </label>
      <label className="text-xs text-muted">
        Wastage %
        <input value={wastage} onChange={(e) => setWastage(e.target.value)} className="field mt-0.5 block w-16 text-sm" />
      </label>
      <button type="button" disabled={pending} className="btn-primary px-2 py-1 text-xs" onClick={submit}>
        Save
      </button>
      <button type="button" className="btn px-2 py-1 text-xs" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}
