"use client";

import { LAYERS, type Layer } from "@/lib/seating/canvas";
import { useLayerLocks } from "./canvas-prefs";
import { useSeating, type ShowSettings } from "./seating-state";

/** The layer → the Show flag that hides it. */
const SHOW_FLAG: Partial<Record<Layer, keyof ShowSettings>> = { venue: "venue", tables: "tables", furniture: "furniture", decor: "decor", notes: "notes" };

/**
 * The layers of the room (spec 59 A.5): each can be shown or hidden, and
 * locked, so a selection box over the room picks furniture and not the
 * building. Shown and hidden follow the plan's Show menu; locks are per
 * device and separate from Lock room, which binds everyone.
 */
export function LayersMenu() {
  const { show, setShow } = useSeating();
  const [locks, setLocks] = useLayerLocks();
  return (
    <ul className="space-y-0.5" aria-label="Layers">
      {LAYERS.filter((l) => SHOW_FLAG[l.id]).map((l) => {
        const flag = SHOW_FLAG[l.id]!;
        return (
          <li key={l.id} className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              <input type="checkbox" checked={show[flag]} onChange={(e) => setShow({ ...show, [flag]: e.target.checked })} />
              {l.label}
            </label>
            <button
              type="button"
              aria-pressed={locks[l.id]}
              aria-label={`${locks[l.id] ? "Unlock" : "Lock"} ${l.label}`}
              title={locks[l.id] ? `${l.label} is locked: drawn, but can't be picked or moved` : `Lock ${l.label}`}
              className={`rounded px-1.5 text-xs ${locks[l.id] ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}
              onClick={() => setLocks({ ...locks, [l.id]: !locks[l.id] })}
            >
              {locks[l.id] ? "Locked" : "Lock"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
