/**
 * The designer's tools (spec 57 A.1): what the next click on the canvas does.
 * Pure, so the toolbar, the Venue panel and the canvas agree on one list.
 */

import type { MarkerKind, OpeningKind } from "./drawing";

export type Tool =
  | { kind: "select" }
  /** Pans on a drag, from any tool the Space bar does the same (spec 59 A.3). */
  | { kind: "hand" }
  | { kind: "wall" }
  | { kind: "arc" }
  | { kind: "area" }
  | { kind: "text" }
  /** Spec 59 Part E: a note pinned on the plan or on a table, for the suppliers. */
  | { kind: "note" }
  | { kind: "measure" }
  /** A door, window or opening: the next click puts it on the nearest wall. */
  | { kind: "opening"; opening: OpeningKind }
  /** A free-standing marker: the next click puts it down. */
  | { kind: "marker"; marker: MarkerKind }
  /** A library item (a table, furniture, décor): the next click puts it down. */
  | { kind: "place"; item: PlaceItem };

/** What the Library puts on the canvas. `table` items become tables, the rest fixtures. */
export type PlaceItem =
  | {
      type: "table";
      shape: string;
      capacity: number;
      label: string;
      /** What rows, banquet runs and cocktail tables need beyond a shape and a number of seats. */
      extra?: { rows_count?: number; aisle_cm?: number; segments?: { len: number; turn: number }[]; reserved_seats?: number };
    }
  | { type: "fixture"; kind: string; label: string; width: number; depth: number; customItemId?: string; marqueeId?: string };

export const SELECT: Tool = { kind: "select" };

export const TOOL_LABEL: Record<"select" | "hand" | "wall" | "arc" | "area" | "text" | "note" | "measure", string> = {
  select: "Select",
  hand: "Hand",
  wall: "Walls",
  arc: "Curved wall",
  area: "Area",
  text: "Text",
  note: "Note",
  measure: "Measure",
};

export const OPENING_LABEL: Record<OpeningKind, string> = {
  door: "Door",
  double_door: "Double door",
  window: "Window",
  opening: "Opening",
};

/** How wide each goes by default, in cm (B.4: a door 90, a double door 180). */
export const OPENING_WIDTH: Record<OpeningKind, number> = { door: 90, double_door: 180, window: 120, opening: 120 };

export const MARKER_LABEL: Record<MarkerKind, string> = {
  column: "Column",
  stairs: "Stairs",
  power: "Power point",
  fire_exit: "Fire exit",
  toilets: "Toilets",
};

/** A new marker's footprint (width × depth), in cm. */
export const MARKER_SIZE: Record<MarkerKind, { w: number; d: number }> = {
  column: { w: 40, d: 40 },
  stairs: { w: 120, d: 300 },
  power: { w: 30, d: 30 },
  fire_exit: { w: 100, d: 25 },
  toilets: { w: 200, d: 200 },
};

/** True while a tool draws on the canvas (so a click is for the tool, and the room can't be dragged by accident). */
export function isDrawing(t: Tool): boolean {
  return t.kind !== "select" && t.kind !== "place" && t.kind !== "hand";
}

/** The key that picks each tool while the plan has focus (spec 59 A.3). */
export const TOOL_KEY: Record<"select" | "hand" | "wall" | "arc" | "area" | "text" | "note" | "measure", string> = {
  select: "V",
  hand: "H",
  wall: "W",
  arc: "C",
  area: "A",
  text: "T",
  note: "N",
  measure: "M",
};

/** The tool a bare key picks, or null. Case doesn't matter; the caller leaves keys with Ctrl, ⌘ or Alt alone. */
export function toolForKey(key: string): Tool | null {
  const k = key.toLowerCase();
  for (const [kind, letter] of Object.entries(TOOL_KEY)) if (letter.toLowerCase() === k) return { kind } as Tool;
  return null;
}

/** The tool a click on a drawn item should hand over to: placing something ends the tool that placed it. */
export function toolAfterPlacing(t: Tool): Tool {
  return t.kind === "opening" || t.kind === "marker" || t.kind === "place" || t.kind === "text" || t.kind === "note" ? SELECT : t;
}
