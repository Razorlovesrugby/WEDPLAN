"use client";

import { useState } from "react";
import type { Align } from "@/lib/seating/canvas";

const ALIGNS: { how: Align; label: string; glyph: string }[] = [
  { how: "left", label: "Align left", glyph: "⇤" },
  { how: "centre", label: "Align centres across", glyph: "↔" },
  { how: "right", label: "Align right", glyph: "⇥" },
  { how: "top", label: "Align top", glyph: "⤒" },
  { how: "middle", label: "Align middles down", glyph: "↕" },
  { how: "bottom", label: "Align bottom", glyph: "⤓" },
];

/**
 * What the inspector shows for several things at once (spec 59 A.2 and A.5):
 * how many of each kind, and the actions that need more than one: align, space
 * evenly, arrange in a grid. Every action is one undo step.
 */
export function MultiSelectionPanel({
  summary,
  count,
  editable,
  onAlign,
  onDistribute,
  onGrid,
  onSimilar,
  onDuplicate,
  onTurn,
  onDelete,
  onClear,
}: {
  /** "3 round tables, 5 candles". */
  summary: string;
  count: number;
  editable: boolean;
  onAlign: (how: Align) => void;
  onDistribute: (axis: "x" | "y") => void;
  onGrid: (gapCm: number) => void;
  onSimilar: () => void;
  onDuplicate: () => void;
  onTurn: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [gap, setGap] = useState("50");
  const btn = "btn py-1 disabled:opacity-40";
  return (
    <div className="card space-y-2 p-3 text-sm" aria-label="Selection">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{count} selected</strong>
        <span className="text-muted">{summary}</span>
        <button type="button" className="ml-auto underline text-muted" onClick={onClear}>
          Clear
        </button>
      </div>
      {editable ? (
        <>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Align">
            <span className="mr-1 text-xs text-muted">Align</span>
            {ALIGNS.map((a) => (
              <button key={a.how} type="button" className={btn} title={a.label} aria-label={a.label} onClick={() => onAlign(a.how)}>
                {a.glyph}
              </button>
            ))}
            <span className="ml-2 mr-1 text-xs text-muted">Space evenly</span>
            <button type="button" className={btn} disabled={count < 3} title={count < 3 ? "Needs three or more" : "Space evenly across"} onClick={() => onDistribute("x")}>
              Across
            </button>
            <button type="button" className={btn} disabled={count < 3} title={count < 3 ? "Needs three or more" : "Space evenly down"} onClick={() => onDistribute("y")}>
              Down
            </button>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(gap.replace(",", "."));
              if (Number.isFinite(n) && n >= 0) onGrid(Math.min(n, 2000));
            }}
          >
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Gap (cm)</span>
              <input className="field w-20" inputMode="numeric" value={gap} onChange={(e) => setGap(e.target.value)} />
            </label>
            <button type="submit" className={btn}>
              Arrange in a grid
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={btn} onClick={onSimilar} title="Select similar (⌘/Ctrl+Shift+A)">
              Select similar
            </button>
            <button type="button" className={btn} onClick={onDuplicate} title="Duplicate (⌘/Ctrl+D)">
              Duplicate
            </button>
            <button type="button" className={btn} onClick={onTurn} title="Turn each 90°">
              Turn 90°
            </button>
            <button type="button" className={`${btn} text-red-700`} onClick={onDelete} title="Delete">
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
