"use client";

import { useMemo, useState, useTransition } from "react";
import { applySeatingTemplate } from "@/server/actions/seating-workspace";
import { tableSize } from "@/lib/seating/geometry";
import { buildTemplate, type CoupleSits, type RoomElement, type TableMix } from "@/lib/seating/template";
import { useSeating } from "./seating-state";

const ELEMENTS: { key: RoomElement; label: string }[] = [
  { key: "dance_floor", label: "Dance floor" },
  { key: "band", label: "Band / DJ" },
  { key: "bar", label: "Bar" },
  { key: "buffet", label: "Buffet" },
  { key: "cake", label: "Cake table" },
  { key: "photo_booth", label: "Photo booth" },
];

/**
 * Set up the room (spec 53 Part A): offered when an event's plan has no
 * tables. A few answers, a live preview, and one undoable step that makes
 * every table and fixture.
 */
export function RoomSetup({ onSkip }: { onSkip: () => void }) {
  const { eventId, data, track, refresh, setError } = useSeating();
  const [pending, startTransition] = useTransition();
  const counts = useMemo(() => {
    const coming = data.guests.filter((g) => g.invited && !g.excluded && g.rsvp !== "no");
    return { yes: coming.filter((g) => g.rsvp === "yes").length, yesPending: coming.length };
  }, [data.guests]);

  const [basis, setBasis] = useState<"yes_pending" | "yes">(counts.yes > 0 ? "yes" : "yes_pending");
  const [tables, setTables] = useState<TableMix>("round10");
  const [couple, setCouple] = useState<CoupleSits>("top");
  const [elements, setElements] = useState<Set<RoomElement>>(new Set(["dance_floor"]));

  const people = basis === "yes" ? counts.yes : counts.yesPending;
  const room = { widthCm: data.plan?.room_width_cm ?? 2000, depthCm: data.plan?.room_depth_cm ?? 1500 };
  const layout = useMemo(() => buildTemplate({ people, tables, couple, elements: [...elements], room }), [people, tables, couple, elements, room.widthCm, room.depthCm]);

  return (
    <section className="card space-y-3 p-4 text-sm" aria-label="Set up the room">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg">Set up the room</h2>
        <button type="button" className="underline" onClick={onSkip}>Start blank</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block">How many to seat
            <select className="field mt-1" value={basis} onChange={(e) => setBasis(e.target.value as "yes" | "yes_pending")}>
              <option value="yes_pending">Said yes + not answered ({counts.yesPending})</option>
              <option value="yes">Said yes only ({counts.yes})</option>
            </select>
          </label>
          <label className="block">Tables
            <select className="field mt-1" value={tables} onChange={(e) => setTables(e.target.value as TableMix)}>
              <option value="round8">Round of 8</option>
              <option value="round10">Round of 10</option>
              <option value="long12">Long of 12</option>
              <option value="mixed">Round and long</option>
            </select>
          </label>
          <label className="block">Where the couple sits
            <select className="field mt-1" value={couple} onChange={(e) => setCouple(e.target.value as CoupleSits)}>
              <option value="top">Top table (8, couple and wedding party)</option>
              <option value="sweetheart">Sweetheart table (2)</option>
              <option value="guests">With the guests</option>
            </select>
          </label>
          <fieldset>
            <legend>In the room</legend>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {ELEMENTS.map((el) => (
                <label key={el.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={elements.has(el.key)}
                    onChange={() => setElements((cur) => { const next = new Set(cur); if (!next.delete(el.key)) next.add(el.key); return next; })}
                  />
                  {el.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <svg viewBox={`0 0 ${room.widthCm} ${room.depthCm}`} className="w-full rounded border border-line bg-white" role="img" aria-label="Preview of the layout">
            {layout.fixtures.map((f, i) => (
              <rect key={`f${i}`} x={f.pos_x_cm - f.width_cm / 2} y={f.pos_y_cm - f.depth_cm / 2} width={f.width_cm} height={f.depth_cm} fill="#e7e0d5" stroke="#b8b0a4" />
            ))}
            {layout.tables.map((t, i) => {
              const size = tableSize({ shape: t.shape, capacity: t.capacity, ends_seated: false, width_cm: null, length_cm: null });
              return t.shape === "round" ? (
                <circle key={i} cx={t.pos_x_cm} cy={t.pos_y_cm} r={size.length / 2} fill="#f3efe8" stroke="#8a8580" strokeWidth={6} />
              ) : (
                <rect key={i} x={t.pos_x_cm - size.length / 2} y={t.pos_y_cm - size.width / 2} width={size.length} height={size.width} fill="#f3efe8" stroke="#8a8580" strokeWidth={6} />
              );
            })}
          </svg>
          <p className="mt-2" aria-live="polite">{layout.summary}</p>
          {!layout.fits ? <p className="text-amber-800">Some tables don&rsquo;t fit this room size. Change the room first, or use fewer people.</p> : null}
        </div>
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending || layout.tables.length === 0}
        onClick={() =>
          startTransition(async () => {
            const r = await track("Set up the room", () => applySeatingTemplate(eventId, { people, tables, couple, elements: [...elements] }));
            if (!r.ok) setError(r.error);
            refresh();
          })
        }
      >
        Use this layout
      </button>
    </section>
  );
}
