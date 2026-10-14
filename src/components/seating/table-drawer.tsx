"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { clearTableChairs, deleteSeatingTable, updateSeatingTable } from "@/server/actions/seating";
import { guestColour } from "@/lib/seating/colour";
import { localSeatPositions, tableSize, CHAIR_OFFSET_CM } from "@/lib/seating/geometry";
import { guestName, type SeatingTable } from "@/lib/seating/model";
import type { SeatingTableShape } from "@/lib/types/database";
import { GuestChip } from "./guest-chip";
import { useSeating } from "./seating-state";
import { SHAPE_LABEL } from "./tables-grid";

/**
 * One table, opened (spec 33 §D.1): its settings, and its chairs drawn round
 * the shape for seat-by-seat placement. Tap a chair with someone held to seat
 * them there (an occupied chair swaps); tap a seated guest to pick them up.
 */
export function TableDrawer() {
  const { openTableId, openTable, tableById } = useSeating();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const table = openTableId ? tableById.get(openTableId) : undefined;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (table && !d.open) d.showModal();
    if (!table && d.open) d.close();
  }, [table]);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => openTable(null)}
      className="w-[min(46rem,calc(100vw-1rem))] rounded-lg border border-line bg-white p-0 backdrop:bg-black/30"
    >
      {table ? <DrawerBody key={table.id} table={table} /> : null}
    </dialog>
  );
}

function DrawerBody({ table }: { table: SeatingTable }) {
  const { eventId, openTable, occupancy, refresh, setError } = useSeating();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: table.label,
    shape: table.shape,
    capacity: table.capacity,
    reserved_seats: table.reserved_seats,
    reserved_note: table.reserved_note ?? "",
    ends_seated: table.ends_seated,
    accessible: table.accessible,
    notes: table.notes ?? "",
    length_cm: table.length_cm ?? "",
    width_cm: table.width_cm ?? "",
  });
  const occ = occupancy.get(table.id)!;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-h-[90vh] overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl">{table.label}</h2>
        <button type="button" className="btn" onClick={() => openTable(null)}>
          Close
        </button>
      </div>

      <Chairs table={table} />

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFieldError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await updateSeatingTable(table.id, eventId, {
              ...form,
              length_cm: form.length_cm === "" ? null : Number(form.length_cm),
              width_cm: form.width_cm === "" ? null : Number(form.width_cm),
            });
            if (!result.ok) {
              setFieldError(result.error);
              return;
            }
            setMessage(
              result.data.chairsCleared > 0
                ? `Saved. ${result.data.chairsCleared} guest${result.data.chairsCleared === 1 ? "" : "s"} lost their chair and stay at the table.`
                : "Saved.",
            );
            refresh();
          });
        }}
      >
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-xs text-muted">Name</span>
          <input className="field" value={form.label} maxLength={60} onChange={(e) => set("label", e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Shape</span>
          <select className="field" value={form.shape} onChange={(e) => set("shape", e.target.value as SeatingTableShape)}>
            {Object.entries(SHAPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Seats</span>
          <input
            className="field"
            type="number"
            min={1}
            max={60}
            value={form.capacity}
            onChange={(e) => set("capacity", Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Reserved seats</span>
          <input
            className="field"
            type="number"
            min={0}
            max={form.capacity}
            value={form.reserved_seats}
            onChange={(e) => set("reserved_seats", Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Reserved for</span>
          <input
            className="field"
            placeholder="The two of us, the celebrant…"
            value={form.reserved_note}
            onChange={(e) => set("reserved_note", e.target.value)}
          />
        </label>
        {form.shape === "long" ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ends_seated} onChange={(e) => set("ends_seated", e.target.checked)} />
            A chair at each end
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.accessible} onChange={(e) => set("accessible", e.target.checked)} />
          Accessible table
        </label>
        <details className="text-sm sm:col-span-2">
          <summary className="cursor-pointer text-muted">Size (leave blank to work it out from the seats)</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs text-muted">
                {form.shape === "round" || form.shape === "square" ? "Across (cm)" : "Length (cm)"}
              </span>
              <input
                className="field"
                type="number"
                min={40}
                max={2000}
                placeholder={String(tableSize({ ...table, ...form, width_cm: null, length_cm: null }).length)}
                value={form.length_cm}
                onChange={(e) => set("length_cm", e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            {form.shape === "long" || form.shape === "head" ? (
              <label>
                <span className="mb-1 block text-xs text-muted">Depth (cm)</span>
                <input
                  className="field"
                  type="number"
                  min={40}
                  max={2000}
                  placeholder={String(tableSize({ ...table, ...form, width_cm: null, length_cm: null }).width)}
                  value={form.width_cm}
                  onChange={(e) => set("width_cm", e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
            ) : null}
          </div>
        </details>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-xs text-muted">Notes</span>
          <textarea className="field" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>

        {fieldError ? <p className="text-sm text-red-700 sm:col-span-2">{fieldError}</p> : null}
        {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            Save table
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await clearTableChairs(table.id, eventId);
                if (!r.ok) setError(r.error);
                refresh();
              })
            }
          >
            Clear chairs
          </button>
          <button
            type="button"
            className="btn ml-auto text-red-700"
            disabled={pending}
            onClick={() => {
              const n = occ.guestIds.length;
              const ok = window.confirm(
                n > 0
                  ? `Delete ${table.label}? ${n} guest${n === 1 ? "" : "s"} go back to the not-yet-seated list.`
                  : `Delete ${table.label}?`,
              );
              if (!ok) return;
              startTransition(async () => {
                const r = await deleteSeatingTable(table.id, eventId);
                if (!r.ok) {
                  setFieldError(r.error);
                  return;
                }
                openTable(null);
                refresh();
              });
            }}
          >
            Delete table
          </button>
        </div>
      </form>
    </div>
  );
}

/** The chairs, drawn round the table, numbered clockwise from the top (Q5). */
function Chairs({ table }: { table: SeatingTable }) {
  const { assignments, guestById, held, hold, move, colourBy, data } = useSeating();
  const seats = localSeatPositions(table);
  const { length, width } = tableSize(table);
  const pad = CHAIR_OFFSET_CM + 40;
  const w = length + pad * 2;
  const h = width + pad * 2;
  const atTable = assignments.filter((a) => a.tableId === table.id && guestById.has(a.guestId));
  const byChair = new Map(atTable.filter((a) => a.seatIndex !== null).map((a) => [a.seatIndex!, a.guestId]));
  const noChair = atTable.filter((a) => a.seatIndex === null || a.seatIndex >= table.capacity);
  const reservedFrom = table.capacity - table.reserved_seats;
  const heldOne = held && held.guestIds.length === 1 ? held.guestIds[0]! : null;

  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        {heldOne
          ? `Tap a chair to seat ${held!.label} there.`
          : "Tap a guest to pick them up, then tap a chair. Tapping a taken chair swaps the two."}
      </p>
      <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} className="mx-auto block max-h-80 w-full" role="group" aria-label="Chairs">
        {table.shape === "round" ? (
          <circle r={length / 2} fill="#f3efe8" stroke="#b8b0a4" />
        ) : (
          <rect x={-length / 2} y={-width / 2} width={length} height={width} fill="#f3efe8" stroke="#b8b0a4" />
        )}
        {seats.map((p, i) => {
          const guestId = byChair.get(i);
          const g = guestId ? guestById.get(guestId) : undefined;
          const reserved = i >= reservedFrom;
          const colour = g ? guestColour(g, colourBy, data.colour)?.colour : undefined;
          const isHeld = guestId !== undefined && heldOne === guestId;
          const name = g ? guestName(g) : reserved ? "Reserved" : `Chair ${i + 1}`;
          return (
            <g
              key={i}
              transform={`translate(${p.x} ${p.y})`}
              role="button"
              tabIndex={reserved ? -1 : 0}
              aria-label={`${i + 1}: ${name}`}
              className={reserved ? "" : "cursor-pointer"}
              onClick={() => {
                if (reserved) return;
                if (heldOne) {
                  move([heldOne], table.id, i);
                  hold(null);
                } else if (g) {
                  hold({ guestIds: [g.id], label: guestName(g) });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") (e.currentTarget as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
              }}
            >
              <title>{name}</title>
              <circle
                r={24}
                fill={g ? colour ?? "#ffffff" : reserved ? "#f3efe8" : "#ffffff"}
                stroke={isHeld ? "#1a1a1a" : "#8a8580"}
                strokeWidth={isHeld ? 5 : 2}
                strokeDasharray={reserved ? "6 4" : undefined}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={g ? 15 : 13}
                fill={g && colour ? "#ffffff" : "#6b6560"}
                style={{ pointerEvents: "none" }}
              >
                {g ? initials(guestName(g)) : reserved ? "R" : i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {noChair.length > 0 ? (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted">At this table, chair not chosen</p>
          <div className="flex flex-wrap gap-1.5">
            {noChair.map((a) => (
              <GuestChip key={a.guestId} guest={guestById.get(a.guestId)!} compact />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
