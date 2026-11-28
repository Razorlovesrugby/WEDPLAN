import type { PointerEvent as RPointerEvent } from "react";
import type { NumberedNote } from "@/lib/seating/notes";

const PIN = "#6741d9";

/**
 * The notes for suppliers, pinned on the plan (spec 59 Part E): a numbered pin and the start of the text beside it, with
 * who it is for when it isn't everyone. Pure SVG in room centimetres, so it draws on the Room view and, with no `onPick`,
 * on a print or a shared page. `unit` is room centimetres per screen pixel.
 */
export function NotesLayer({
  notes,
  unit,
  selectedId,
  onPick,
  textLimit = 34,
}: {
  notes: NumberedNote[];
  unit: number;
  selectedId?: string | null;
  onPick?: (id: string, e: RPointerEvent) => void;
  textLimit?: number;
}) {
  return (
    <g aria-label="Notes for suppliers">
      {notes.map((n) => {
        const r = 10 * unit;
        const picked = n.id === selectedId;
        const text = n.text.length > textLimit ? `${n.text.slice(0, textLimit - 1)}…` : n.text;
        return (
          <g key={n.id} transform={`translate(${n.at.x} ${n.at.y})`} data-note={n.id} style={onPick ? { cursor: "pointer", pointerEvents: "all" } : { pointerEvents: "none" }} onPointerDown={onPick ? (e) => onPick(n.id, e) : undefined} role={onPick ? "button" : undefined} aria-label={`Note ${n.n}: ${n.text}. For ${n.for}.`}>
            <circle r={r} fill={PIN} stroke={picked ? "#1a1a1a" : "#ffffff"} strokeWidth={(picked ? 2.5 : 1.5) * unit} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.15} fontWeight={700} fill="#ffffff" style={{ pointerEvents: "none" }}>
              {n.n}
            </text>
            <g style={{ pointerEvents: "none" }}>
              <text x={r + 4 * unit} y={0} dominantBaseline="central" fontSize={12 * unit} fill="#2b2250" stroke="#ffffff" strokeWidth={3.5 * unit} paintOrder="stroke">
                {text}
              </text>
              {n.for !== "Everyone" ? (
                <text x={r + 4 * unit} y={13 * unit} dominantBaseline="central" fontSize={10 * unit} fill={PIN} stroke="#ffffff" strokeWidth={3 * unit} paintOrder="stroke">
                  for {n.for}
                </text>
              ) : null}
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The list beside a plan: each note's number, its text, and who it is for. */
export function NotesList({ notes }: { notes: NumberedNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="Notes for suppliers" className="space-y-1 text-sm">
      <h3 className="font-medium">Notes</h3>
      <ol className="space-y-0.5">
        {notes.map((n) => (
          <li key={n.id} className="flex gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: PIN }}>
              {n.n}
            </span>
            <span>
              {n.text}
              {n.for !== "Everyone" ? <span className="text-muted"> — for {n.for}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
