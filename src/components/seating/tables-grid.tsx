"use client";

import { useState, useTransition } from "react";
import { useDroppable } from "@dnd-kit/core";
import { createSeatingTable } from "@/server/actions/seating";
import { compareBySurname, type SeatingTable } from "@/lib/seating/model";
import type { SeatingTableShape } from "@/lib/types/database";
import { GuestChip } from "./guest-chip";
import { useSeating } from "./seating-state";

export const SHAPE_LABEL: Record<SeatingTableShape, string> = {
  round: "Round",
  long: "Long",
  square: "Square",
  head: "Head table",
};

/** A small drawing of the shape, for the card header. */
export function ShapeIcon({ shape }: { shape: SeatingTableShape }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
      {shape === "round" ? <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {shape === "square" ? <rect x="3" y="3" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {shape === "long" ? <rect x="1.5" y="6" width="17" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {shape === "head" ? (
        <>
          <rect x="1.5" y="8" width="17" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 5h12" stroke="currentColor" strokeWidth="1.5" />
        </>
      ) : null}
    </svg>
  );
}

/**
 * The Tables view: one card per table, guests as chips. Fast, and the one
 * that works on a phone (§C.4 opens here below tablet width).
 */
export function TablesGrid() {
  const { tables } = useSeating();
  return (
    <div className="space-y-3">
      {tables.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">No tables yet — add your first one.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => (
            <TableCard key={t.id} table={t} />
          ))}
        </div>
      )}
      <AddTable />
    </div>
  );
}

function TableCard({ table }: { table: SeatingTable }) {
  const { occupancy, guestById, assignments, warningsByTable, held, hold, move, openTable } = useSeating();
  const { setNodeRef, isOver } = useDroppable({ id: `table:${table.id}` });
  const occ = occupancy.get(table.id)!;
  const warnings = (warningsByTable.get(table.id) ?? []).filter((w) => w.severity === "warning");
  const seated = assignments
    .filter((a) => a.tableId === table.id && guestById.has(a.guestId))
    .sort(
      (a, b) =>
        (a.seatIndex ?? 999) - (b.seatIndex ?? 999) || compareBySurname(guestById.get(a.guestId)!, guestById.get(b.guestId)!),
    );
  const over = occ.chairsTaken > table.capacity;

  return (
    <section
      ref={setNodeRef}
      aria-label={table.label}
      onClick={() => {
        if (held) {
          move(held.guestIds, table.id);
          hold(null);
        }
      }}
      className={`card flex min-h-32 flex-col gap-2 p-3 ${isOver ? "ring-2 ring-accent" : ""} ${
        held ? "cursor-copy hover:ring-2 hover:ring-accent/60" : ""
      } ${warnings.length > 0 ? "border-amber-300" : ""}`}
    >
      <header className="flex items-center gap-2">
        <ShapeIcon shape={table.shape} />
        <h3 className="min-w-0 flex-1 truncate font-medium">{table.label}</h3>
        {table.accessible ? (
          <span className="shrink-0 text-xs text-muted" title="Accessible table" aria-label="Accessible table">
            ♿
          </span>
        ) : null}
        <span className={`shrink-0 text-sm tabular-nums ${over ? "font-semibold text-red-700" : "text-muted"}`}>
          {occ.chairsTaken} / {table.capacity}
        </span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/50 hover:text-ink"
          onClick={(e) => {
            e.stopPropagation();
            openTable(table.id);
          }}
        >
          Open
        </button>
      </header>

      {seated.length === 0 && table.reserved_seats === 0 ? (
        <p className="flex-1 text-sm text-muted">{held ? `Tap to seat ${held.label} here` : "Drop guests here"}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {seated.map((a) => (
            <GuestChip key={a.guestId} guest={guestById.get(a.guestId)!} compact />
          ))}
          {table.reserved_seats > 0 ? (
            <span className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted">
              {table.reserved_seats} reserved{table.reserved_note ? ` · ${table.reserved_note}` : ""}
            </span>
          ) : null}
        </div>
      )}

      {warnings.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-amber-800">
          {warnings.slice(0, 3).map((w, i) => (
            <li key={i}>⚠ {w.message}</li>
          ))}
          {warnings.length > 3 ? <li>and {warnings.length - 3} more</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

function AddTable() {
  const { eventId, refresh, setError } = useSeating();
  const [shape, setShape] = useState<SeatingTableShape>("round");
  const [capacity, setCapacity] = useState(8);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="card flex flex-wrap items-end gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await createSeatingTable(eventId, { shape, capacity });
          if (!result.ok) setError(result.error);
          refresh();
        });
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Shape</span>
        <select
          value={shape}
          onChange={(e) => {
            const next = e.target.value as SeatingTableShape;
            setShape(next);
            if (next === "head" && capacity === 8) setCapacity(6);
          }}
          className="field"
        >
          {Object.entries(SHAPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">Seats</span>
        <input
          type="number"
          min={1}
          max={60}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          className="field w-20"
        />
      </label>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add table"}
      </button>
    </form>
  );
}
