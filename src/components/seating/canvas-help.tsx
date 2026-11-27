"use client";

import { useEffect, useRef, useState } from "react";
import { useFlag } from "./canvas-prefs";

type Row = [keys: string, what: string];
const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Moving around",
    rows: [
      ["Scroll", "Pan (Trackpad mode) · zoom (Mouse mode)"],
      ["Pinch, or ⌘/Ctrl + scroll", "Zoom about the pointer"],
      ["Space + drag, middle-button drag, or the Hand tool (H)", "Pan from any tool"],
      ["+  −  0", "Zoom in, out, to 100%"],
      ["⇧1  ⇧2", "Fit the room · zoom to the selection"],
    ],
  },
  {
    title: "Tools",
    rows: [
      ["V  H", "Select · Hand"],
      ["S", "Stamp: click to put one down, as many as you like, until Esc"],
      ["1–9, while stamping", "Switch to your favourites, then your recent items"],
      ["Shift + drag, while stamping", "Stamp along a line, every N cm (set it under the toolbar)"],
      ["W  C  A  T  M", "Walls · Curved wall · Area · Text · Measure"],
      ["Esc", "Stop the tool, then clear the selection"],
    ],
  },
  {
    title: "Selecting",
    rows: [
      ["Click · Shift-click", "Pick one · add or remove"],
      ["Drag on empty plan", "Draw a box and pick what it touches (Alt: only what it holds)"],
      ["⌘/Ctrl + A", "Everything movable in this room"],
      ["⌘/Ctrl + ⇧A", "Select similar: the same kind and size"],
    ],
  },
  {
    title: "Without a mouse",
    rows: [
      ["Tab · ⇧Tab", "Into the plan, then through its tables and furniture, top to bottom and left to right"],
      ["Enter", "Open a table's close-up, or a piece of furniture's inspector"],
      ["⇧Enter, or Space on its own", "Add it to the selection, or take it out"],
      ["Arrows, R, Delete, ⌘/Ctrl + D, C", "Act on the item Tab has reached when nothing else is picked"],
      ["Esc", "Clear the selection, then step out of the plan to the next control"],
    ],
  },
  {
    title: "On a tablet",
    rows: [
      ["Select several", "On the toolbar: tap to add or remove, drag on the floor for a box"],
      ["Press and hold", "The right-click menu, on an item or on the floor"],
      ["Line, while stamping", "Drag to stamp along a line"],
      ["Two fingers", "Pinch to zoom, as before"],
    ],
  },
  {
    title: "Changing",
    rows: [
      ["Drag", "Move the whole selection (snaps to neighbours and to the building; hold Alt during the drag to turn snapping off). Pink guides are to furniture, violet to walls, doors and areas"],
      ["Drag a handle on one item", "Resize it, to 5 cm (⇧ keeps the proportions, Alt resizes about the centre). A round or square table has one handle, for its size"],
      ["Drag the turn handle on a selection", "Turn the whole formation about its centre, every 15° (⇧ for free)"],
      ["Alt, then drag", "Drag a copy"],
      ["Arrow keys · ⇧ + arrows", "Nudge 5 cm · 25 cm"],
      ["R · ⇧R", "Turn each 15° · back"],
      ["⌘/Ctrl + D", "Duplicate, 50 cm over"],
      ["⌘/Ctrl + C · V", "Copy · paste (also between rooms of one layout)"],
      ["Delete", "Remove"],
      ["⌘/Ctrl + Z · ⇧Z", "Undo · redo"],
      ["Right-click", "Everything above, and more"],
    ],
  },
];

/** The designer's shortcut sheet, opened with ? (spec 59 A.6). */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Shortcuts for the plan" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center">
          <h2 className="text-lg font-semibold">Shortcuts for the plan</h2>
          <button ref={close} type="button" className="btn ml-auto py-1" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{s.title}</h3>
              <dl className="space-y-1.5 text-sm">
                {s.rows.map(([keys, what]) => (
                  <div key={keys}>
                    <dt className="font-medium">{keys}</dt>
                    <dd className="text-muted">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const TIPS = [
  { title: "Scrolling moves the plan", body: "Two fingers on the trackpad slide it around. On a mouse, switch to Mouse mode (right-click the plan, or the zoom box) and the wheel zooms instead." },
  { title: "Pinch to zoom", body: "Pinch, or hold ⌘ or Ctrl and scroll, to zoom about the pointer. Space and drag, or the Hand tool, pans from anywhere." },
  { title: "Drag to select", body: "Drag on the empty floor to draw a box around tables and furniture, then move, align or copy them together." },
];

/** Three tips, one after another, the first time the designer opens on this device (spec 59 A.6). */
export function FirstVisitTips() {
  const [seen, setSeen] = useFlag("wedplan.seating.tips");
  // Not on the server's first paint: the flag is only known in the browser.
  const [ready, setReady] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => setReady(true), []);
  if (!ready || seen) return null;
  const tip = TIPS[i]!;
  const last = i === TIPS.length - 1;
  return (
    <div role="status" className="pointer-events-auto absolute left-3 top-3 z-20 w-64 rounded-lg border border-line bg-white p-3 text-sm shadow-lg">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">
        Tip {i + 1} of {TIPS.length}
      </p>
      <p className="mt-0.5 font-medium">{tip.title}</p>
      <p className="mt-1 text-muted">{tip.body}</p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn py-1" onClick={() => (last ? setSeen(true) : setI(i + 1))}>
          {last ? "Got it" : "Next"}
        </button>
        {!last ? (
          <button type="button" className="text-xs underline text-muted" onClick={() => setSeen(true)}>
            Skip
          </button>
        ) : null}
      </div>
    </div>
  );
}
