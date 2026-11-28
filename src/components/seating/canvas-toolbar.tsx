"use client";

import { useEffect, useRef, useState } from "react";
import type { NavMode } from "@/lib/seating/canvas";
import { SELECT, TOOL_KEY, TOOL_LABEL, type Tool } from "@/lib/seating/tools";

const TOOLS = ["select", "hand", "wall", "arc", "area", "text", "note", "measure"] as const;
/** The drawing tools stay hidden while the room is locked (spec 57 Part D, spec 59 A.3). */
const ALWAYS = new Set(["select", "hand"]);

/**
 * The floating bar at the bottom centre of the plan (spec 59 A.3): one tool
 * active at a time, and the zoom. The tool's name and keys, and what a click
 * will do, are on the hint line under it.
 */
export function FloatingToolbar({
  tool,
  setTool,
  canDraw,
  toolsHidden = false,
  onStamp,
  zoomPct,
  zoomBy,
  onFit,
  onSelection,
  hasSelection,
  onPercent,
  navMode,
  setNavMode,
  onDone,
  onMulti,
  multi = false,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  /** Called after any action here, so the caller can put keyboard focus back on the plan (its shortcuts live there). */
  onDone: () => void;
  canDraw: boolean;
  /** With the panels hidden (spec 59 A.2) only the zoom remains. */
  toolsHidden?: boolean;
  /** Starts Stamp with the last item stamped (or opens the Library to choose one). */
  onStamp?: () => void;
  /** Select several (spec 60 B.2): given on a touch screen, where a tap and a drag have no Shift. */
  onMulti?: () => void;
  multi?: boolean;
  zoomPct: number;
  zoomBy: (factor: number) => void;
  onFit: () => void;
  onSelection: () => void;
  hasSelection: boolean;
  onPercent: (pct: number) => void;
  navMode: NavMode;
  setNavMode: (m: NavMode) => void;
}) {
  return (
    <div role="toolbar" aria-label="Plan tools" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg border border-line bg-white/95 p-1 text-sm shadow-lg">
      {TOOLS.filter((k) => !toolsHidden && (canDraw || ALWAYS.has(k))).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={tool.kind === k}
          title={`${TOOL_LABEL[k]} (${TOOL_KEY[k]})`}
          className={`rounded px-2.5 py-1 ${tool.kind === k ? "bg-ink text-white" : "hover:bg-line/50"}`}
          onClick={() => {
            setTool(k === "select" || tool.kind === k ? SELECT : ({ kind: k } as Tool));
            onDone();
          }}
        >
          {TOOL_LABEL[k]}
          <kbd className={`ml-1.5 hidden font-sans text-[10px] sm:inline ${tool.kind === k ? "text-white/70" : "text-muted"}`}>{TOOL_KEY[k]}</kbd>
        </button>
      ))}
      {!toolsHidden && canDraw && onStamp ? (
        <button
          type="button"
          aria-pressed={tool.kind === "place"}
          title="Stamp: click to put one down, as many as you like (S)"
          className={`rounded px-2.5 py-1 ${tool.kind === "place" ? "bg-ink text-white" : "hover:bg-line/50"}`}
          onClick={() => {
            if (tool.kind === "place") setTool(SELECT);
            else onStamp();
            onDone();
          }}
        >
          Stamp
          <kbd className={`ml-1.5 hidden font-sans text-[10px] sm:inline ${tool.kind === "place" ? "text-white/70" : "text-muted"}`}>S</kbd>
        </button>
      ) : null}
      {!toolsHidden && canDraw && onMulti ? (
        <button
          type="button"
          aria-pressed={multi}
          title="Select several: tap to add or remove, drag on the floor for a box (Esc turns it off)"
          className={`rounded px-2.5 py-1 ${multi ? "bg-ink text-white" : "hover:bg-line/50"}`}
          onClick={() => {
            onMulti();
            onDone();
          }}
        >
          Select several
        </button>
      ) : null}
      {toolsHidden ? null : <span aria-hidden className="mx-1 h-5 w-px bg-line" />}
      <button type="button" className="rounded px-2 py-1 hover:bg-line/50" aria-label="Zoom out" title="Zoom out (−)" onClick={() => (zoomBy(1 / 1.25), onDone())}>
        −
      </button>
      <ZoomMenu onDone={onDone} zoomPct={zoomPct} onFit={onFit} onSelection={onSelection} hasSelection={hasSelection} onPercent={onPercent} navMode={navMode} setNavMode={setNavMode} />
      <button type="button" className="rounded px-2 py-1 hover:bg-line/50" aria-label="Zoom in" title="Zoom in (+)" onClick={() => (zoomBy(1.25), onDone())}>
        +
      </button>
    </div>
  );
}

/** The zoom box: the percentage, and a menu of Fit, Selection, 50%, 100%, 200% and the navigation mode (spec 59 A.4). */
function ZoomMenu({
  onDone,
  zoomPct,
  onFit,
  onSelection,
  hasSelection,
  onPercent,
  navMode,
  setNavMode,
}: {
  onDone: () => void;
  zoomPct: number;
  onFit: () => void;
  onSelection: () => void;
  hasSelection: boolean;
  onPercent: (pct: number) => void;
  navMode: NavMode;
  setNavMode: (m: NavMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    fn();
    setOpen(false);
    onDone();
  };
  const row = "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} className="min-w-[3.75rem] rounded px-2 py-1 text-center tabular-nums hover:bg-line/50" onClick={() => setOpen((o) => !o)} title="Zoom">
        {Math.round(zoomPct)}%
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-1/2 z-40 mb-2 w-52 -translate-x-1/2 rounded border border-line bg-white py-1 text-sm shadow-lg">
          <button role="menuitem" type="button" className={row} onClick={pick(onFit)}>
            Fit the room <kbd className="font-sans text-[10px] text-muted">⇧1</kbd>
          </button>
          <button role="menuitem" type="button" className={row} disabled={!hasSelection} onClick={pick(onSelection)}>
            Zoom to selection <kbd className="font-sans text-[10px] text-muted">⇧2</kbd>
          </button>
          {[50, 100, 200].map((p) => (
            <button key={p} role="menuitem" type="button" className={row} onClick={pick(() => onPercent(p))}>
              {p}% {p === 100 ? <kbd className="font-sans text-[10px] text-muted">0</kbd> : null}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <p className="px-3 pb-0.5 pt-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted">Navigation</p>
          {(["trackpad", "mouse"] as const).map((m) => (
            <button key={m} role="menuitemradio" aria-checked={navMode === m} type="button" className={row} onClick={pick(() => setNavMode(m))}>
              {m === "trackpad" ? "Trackpad" : "Mouse"}
              <span aria-hidden>{navMode === m ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
