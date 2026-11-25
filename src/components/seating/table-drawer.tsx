"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { clearTableChairs, deleteSeatingTable, updateSeatingTable } from "@/server/actions/seating";
import { duplicateSeatingTable, renumberSeatingTable, setChairBlocked } from "@/server/actions/seating-workspace";
import { trayHouseholds, type TrayMode } from "@/lib/seating/tray";
import { guestColour } from "@/lib/seating/colour";
import { localSeatPositions, serpentinePath, tableSize, CHAIR_OFFSET_CM } from "@/lib/seating/geometry";
import { guestName, type SeatingTable } from "@/lib/seating/model";
import type { SeatingTableShape } from "@/lib/types/database";
import { GuestDietaryNeeds } from "@/components/guest-dietary-needs";
import { dietaryText, hasAllergy, hasAnyDietary } from "@/lib/dietary";
import { setSeatFood } from "@/server/actions/seating-service";
import { buildKitchen, mealQuestion, sharedFlags } from "@/lib/seating/kitchen";
import { effectiveStyle, parseStyleChanges } from "@/lib/seating/items";
import { courseStyle, isServiceStyle, isKidsMeal, parseMenu } from "@/lib/seating/service";
import { GuestChip } from "./guest-chip";
import { useSeating } from "./seating-state";
import { PICKABLE_SHAPES, SHAPE_LABEL } from "./tables-grid";
import { TableStyleSection } from "./styles-panel";

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
  const { eventId, openTable, occupancy, refresh, setError, track } = useSeating();
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
      <DietaryAtTable table={table} />
      <FoodAtTable table={table} />
      <TableStyleSection table={table} />

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFieldError(null);
          setMessage(null);
          startTransition(async () => {
            // A new name first: a number another table has swaps the two labels (spec 53 Part B).
            if (form.label.trim() && form.label.trim() !== table.label) {
              const renamed = await track(`Renamed ${table.label}`, () => renumberSeatingTable(table.id, eventId, form.label));
              if (!renamed.ok) {
                setFieldError(renamed.error);
                return;
              }
            }
            const result = await track(`Edited ${table.label}`, () =>
              updateSeatingTable(table.id, eventId, {
                ...form,
                length_cm: form.length_cm === "" ? null : Number(form.length_cm),
                width_cm: form.width_cm === "" ? null : Number(form.width_cm),
              }),
            );
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
            {PICKABLE_SHAPES.map((v) => [v, SHAPE_LABEL[v]] as const).map(([v, l]) => (
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
                const r = await track(`Cleared the chairs at ${table.label}`, () => clearTableChairs(table.id, eventId));
                if (!r.ok) setError(r.error);
                refresh();
              })
            }
          >
            Clear chairs
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await track(`Duplicated ${table.label}`, () => duplicateSeatingTable(table.id, eventId));
                if (!r.ok) setError(r.error);
                else setMessage("Copied: same shape and seats, no guests.");
                refresh();
              })
            }
          >
            Duplicate
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
                const r = await track(`Deleted ${table.label}`, () => deleteSeatingTable(table.id, eventId));
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

/**
 * What this table eats (spec 57 F.3 to F.5): platters per shared dish, the
 * flags for a tight or tall table, and who has an own plate or shares. Only
 * shown when the menu has a course that isn't plated.
 */
function FoodAtTable({ table }: { table: SeatingTable }) {
  const { eventId, layoutId, data, tables, assignments, settings, colourBy, track, refresh, setError, guestById } = useSeating();
  const [pending, startTransition] = useTransition();
  const parsed = parseMenu(data.plan?.menu);
  const menu = parsed.ok ? parsed.menu : [];
  const defaultStyle = isServiceStyle(data.plan?.service_style) ? data.plan.service_style : "plated";
  const courses = menu.filter((c) => courseStyle(c, defaultStyle) !== "plated");
  if (courses.length === 0) return null;

  const meal = mealQuestion(data.colour.questions, data.colour.answers, colourBy.kind === "question" ? colourBy.questionId : null);
  const kitchen = buildKitchen({ menu, defaultStyle, tables, seats: assignments, guests: data.guests, settings, meal });
  const seated = assignments.filter((a) => a.tableId === table.id && guestById.has(a.guestId));
  const style = table.style_id ? (data.styles.find((s) => s.id === table.style_id) ?? null) : null;
  const flags = courses.some((c) => courseStyle(c, defaultStyle) === "shared") ? sharedFlags(table, effectiveStyle(style, parseStyleChanges(table.style_changes)).centre, settings) : [];
  const shared = kitchen.courses.filter((c) => c.style === "shared");

  const change = (guestId: string, courseId: string, patch: { ownPlate?: boolean; kidsMeal?: boolean }, label: string) =>
    startTransition(async () => {
      const r = await track(label, () => setSeatFood(eventId, guestId, courseId, patch, layoutId));
      if (!r.ok) setError(r.error);
      refresh();
    });

  return (
    <section className="mt-3 border-t border-line pt-2" aria-label="Food at this table">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Food</h3>
      {flags.map((f) => (
        <p key={f} className="mb-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {f}
        </p>
      ))}
      {shared.map((c) => (
        <div key={c.courseId} className="mb-2 text-xs">
          <p className="font-medium">{c.name}</p>
          {c.shared.length === 0 ? <p className="text-muted">No dishes yet.</p> : null}
          {c.shared.map((d) => {
            const t = d.tables.find((x) => x.tableId === table.id);
            return (
              <p key={d.dishId} className="text-muted">
                {d.name || "Dish"}: {d.needsServes ? "set “serves” in Food service" : t?.platters === null || t?.platters === undefined ? "nobody sharing" : `${t.platters} ${d.vessel}${t.platters === 1 ? "" : "s"}`}
                {t?.stale ? <span className="ml-1 text-amber-800">Check platters</span> : null}
              </p>
            );
          })}
        </div>
      ))}
      <ul className="space-y-1.5 text-sm">
        {seated.map((a) => {
          const g = guestById.get(a.guestId)!;
          const child = g.ageBand !== "adult";
          return (
            <li key={a.guestId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="w-32 shrink-0 truncate font-medium">{guestName(g)}</span>
              {courses.map((c) => {
                const kids = isKidsMeal({ ageBand: g.ageBand, kidsMeal: a.kidsMeal ?? {} }, c.id);
                return (
                  <span key={c.id} className="flex items-center gap-1 text-xs">
                    <span className="text-muted">{c.name}:</span>
                    {child ? (
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={kids} disabled={pending} onChange={(e) => change(a.guestId, c.id, { kidsMeal: e.target.checked }, `${guestName(g)}: ${e.target.checked ? "kids' meal" : "shares"} at ${c.name}`)} />
                        <span className={kids ? "text-purple-800" : undefined}>Kids&rsquo; meal</span>
                      </label>
                    ) : null}
                    {!kids ? (
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={a.ownPlate?.[c.id] === true} disabled={pending} onChange={(e) => change(a.guestId, c.id, { ownPlate: e.target.checked }, `${guestName(g)}: ${e.target.checked ? "own plate" : "shares"} at ${c.name}`)} />
                        <span className={a.ownPlate?.[c.id] === true ? "text-orange-700" : undefined}>Own plate</span>
                      </label>
                    ) : null}
                  </span>
                );
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Who at this table has a dietary need, and a way to change it (spec 57 Part H). */
function DietaryAtTable({ table }: { table: SeatingTable }) {
  const { assignments, guestById, refresh } = useSeating();
  const [editing, setEditing] = useState<string | null>(null);
  const guests = assignments
    .filter((a) => a.tableId === table.id && guestById.has(a.guestId))
    .map((a) => guestById.get(a.guestId)!)
    .sort((a, b) => guestName(a).localeCompare(guestName(b), "en-GB"));
  if (guests.length === 0) return null;
  return (
    <section className="mt-3 border-t border-line pt-2" aria-label="Dietary needs at this table">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Dietary needs</h3>
      <ul className="space-y-1 text-sm">
        {guests.map((g) => (
          <li key={g.id}>
            <div className="flex items-start gap-2">
              <span className="w-32 shrink-0 truncate font-medium">{guestName(g)}</span>
              <span className={`flex-1 ${hasAllergy(g.dietaryNeeds) ? "text-red-800" : "text-muted"}`}>
                {hasAnyDietary(g.dietaryNeeds, g.dietary) ? dietaryText(g.dietaryNeeds, g.dietary) : "None given"}
              </span>
              <button type="button" className="text-xs underline" onClick={() => setEditing(editing === g.id ? null : g.id)}>
                {editing === g.id ? "Close" : "Edit"}
              </button>
            </div>
            {editing === g.id ? (
              <div className="mt-1 rounded border border-line p-2">
                <GuestDietaryNeeds
                  guestId={g.id}
                  initial={g.dietaryNeeds}
                  label={`${guestName(g)}'s dietary needs`}
                  onSaved={() => {
                    setEditing(null);
                    refresh();
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The chairs, drawn round the table, numbered clockwise from the top (Q5). */
function Chairs({ table }: { table: SeatingTable }) {
  const { assignments, guestById, held, hold, move, colourBy, data, highlightGuestId, trayMode, track, eventId, refresh, setError, show } = useSeating();
  const [pickChair, setPickChair] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const seats = localSeatPositions(table);
  const blockedSet = new Set(data.blocked.filter((b) => b.tableId === table.id).map((b) => b.seatIndex));
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
        ) : table.shape === "serpentine" ? (
          <path d={serpentinePath(length / 2, width / 2)} fill="#f3efe8" stroke="#b8b0a4" />
        ) : table.shape === "oval" ? (
          <ellipse rx={length / 2} ry={width / 2} fill="#f3efe8" stroke="#b8b0a4" />
        ) : table.shape === "half_moon" ? (
          <path d={`M ${-length / 2} ${width / 2} A ${length / 2} ${length / 2} 0 0 1 ${length / 2} ${width / 2} Z`} fill="#f3efe8" stroke="#b8b0a4" />
        ) : (
          <rect x={-length / 2} y={-width / 2} width={length} height={width} fill="#f3efe8" stroke="#b8b0a4" />
        )}
        {seats.map((p, i) => {
          const guestId = byChair.get(i);
          const g = guestId ? guestById.get(guestId) : undefined;
          const reserved = i >= reservedFrom;
          const blocked = blockedSet.has(i);
          const colour = g ? guestColour(g, colourBy, data.colour)?.colour : undefined;
          const isHeld = (guestId !== undefined && heldOne === guestId) || (guestId !== undefined && highlightGuestId === guestId);
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
                if (blocked) {
                  setPickChair(pickChair === i ? null : i);
                  return;
                }
                if (heldOne) {
                  move([heldOne], table.id, i);
                  hold(null);
                } else if (g) {
                  hold({ guestIds: [g.id], label: guestName(g) });
                } else {
                  // Seat first (Part D): an empty chair opens a search of who still needs a seat.
                  setPickChair(pickChair === i ? null : i);
                  setSearch("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") (e.currentTarget as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
              }}
            >
              <title>{name}</title>
              <circle
                r={24}
                fill={g ? colour ?? "#ffffff" : reserved || blocked ? "#f3efe8" : "#ffffff"}
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
                {g ? (show.names ? (g.preferredName || g.firstName).slice(0, 7) : initials(guestName(g))) : reserved ? "R" : blocked ? "✕" : i + 1}
                {g && show.numbers ? ` ${i + 1}` : ""}
                {g?.arrivedAt ? " ✓" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      {pickChair !== null ? (
        <ChairPicker
          table={table}
          chair={pickChair}
          blocked={blockedSet.has(pickChair)}
          search={search}
          setSearch={setSearch}
          trayMode={trayMode}
          onSeat={(ids, withChair) => {
            move(ids, table.id, withChair ? pickChair : null);
            setPickChair(null);
          }}
          onBlock={(block) =>
            void track(block ? "Blocked a chair" : "Unblocked a chair", () => setChairBlocked(eventId, table.id, pickChair, block)).then((r) => {
              if (!r.ok) setError(r.error);
              setPickChair(null);
              refresh();
            })
          }
        />
      ) : null}
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

/** Seat first (spec 53 Part D): tap an empty chair, search for who goes there. Households show together. */
function ChairPicker({
  table,
  chair,
  blocked,
  search,
  setSearch,
  trayMode,
  onSeat,
  onBlock,
}: {
  table: SeatingTable;
  chair: number;
  blocked: boolean;
  search: string;
  setSearch: (s: string) => void;
  trayMode: TrayMode;
  onSeat: (ids: string[], withChair: boolean) => void;
  onBlock: (block: boolean) => void;
}) {
  const { data, assignments } = useSeating();
  const households = trayHouseholds(data.guests, assignments, trayMode, { query: search }).slice(0, 6);
  return (
    <div className="mt-3 space-y-2 rounded border border-line p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <strong>Chair {chair + 1}</strong>
        <button type="button" className="text-xs underline" onClick={() => onBlock(!blocked)}>
          {blocked ? "Unblock this chair" : "Block this chair"}
        </button>
      </div>
      {blocked ? (
        <p className="text-xs text-muted">This chair is out of use (a broken chair, a pillar) and is never offered as spare.</p>
      ) : (
        <>
          <input className="field" autoFocus placeholder="Who sits here?" aria-label="Search unseated guests" value={search} onChange={(e) => setSearch(e.target.value)} />
          {households.length === 0 ? <p className="text-xs text-muted">Nobody unseated matches.</p> : null}
          {households.map((h) => (
            <div key={h.householdId} className="space-y-1">
              {h.guests.length > 1 ? (
                <button type="button" className="btn py-0.5 text-xs" onClick={() => onSeat(h.guests.map((g) => g.id), false)}>
                  Seat all {h.guests.length} · {h.householdName}
                </button>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {h.guests.map((g) => (
                  <button key={g.id} type="button" className="rounded-full border border-line px-2.5 py-0.5 hover:border-muted" onClick={() => onSeat([g.id], true)}>
                    {h.guests.length > 1 ? `Just ${g.preferredName || g.firstName}` : guestName(g)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">Table {table.label}</p>
        </>
      )}
    </div>
  );
}
