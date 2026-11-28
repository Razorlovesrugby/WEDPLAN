/**
 * Getting around the plan without a mouse (spec 60 B.1): the order Tab visits things in,
 * what a screen reader is told, and the touch rules for a long-press. No React, no browser.
 */

import type { Point } from "./geometry";

/** Things within about a metre of the row's first item, top to bottom, are one row (read left to right). */
export const ROW_CM = 100;

/**
 * Reading order: top to bottom, left to right within a row. A row starts at its first item and takes everything up to
 * `rowCm` below it, so two tables a few centimetres apart in height are neighbours, not "upper" and "lower".
 */
export function focusOrder(items: { key: string; x: number; y: number }[], rowCm = ROW_CM): string[] {
  const byY = [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
  const out: string[] = [];
  let row: typeof items = [];
  let anchor = 0;
  const flush = () => {
    row.sort((a, b) => a.x - b.x || a.y - b.y || a.key.localeCompare(b.key));
    out.push(...row.map((i) => i.key));
    row = [];
  };
  for (const item of byY) {
    if (row.length > 0 && item.y - anchor > rowCm) flush();
    if (row.length === 0) anchor = item.y;
    row.push(item);
  }
  flush();
  return out;
}

/**
 * Where Tab (1) or Shift+Tab (−1) goes from `current` (null: the plan itself, nothing focused).
 * A key is the next thing; `null` is back to the plan itself; `"leave"` is out of the plan, to the next or previous control.
 */
export function nextFocus(order: string[], current: string | null, dir: 1 | -1): string | null | "leave" {
  const at = current === null ? -1 : order.indexOf(current);
  if (at === -1) return dir === 1 ? (order[0] ?? "leave") : "leave";
  const next = at + dir;
  if (next < 0) return null;
  if (next >= order.length) return "leave";
  return order[next]!;
}

/** "near the top left", "in the middle of the room": a place in the room in words, by thirds. */
export function describePosition(p: Point, roomW: number, roomD: number): string {
  const col = p.x < roomW / 3 ? "left" : p.x > (2 * roomW) / 3 ? "right" : "";
  const row = p.y < roomD / 3 ? "top" : p.y > (2 * roomD) / 3 ? "bottom" : "";
  if (!col && !row) return "in the middle of the room";
  return `near the ${[row, col].filter(Boolean).join(" ")}`;
}

const SHAPE_WORDS: Record<string, string> = {
  round: "round",
  square: "square",
  rect: "rectangular",
  rectangle: "rectangular",
  oval: "oval",
  long: "long",
  banquet: "banquet run",
  rows: "rows of chairs",
  serpentine: "serpentine",
  u_shape: "U-shaped",
  t_shape: "T-shaped",
};

/** "Table 4, round, 6 of 8 seated, near the top left". */
export function describeTable(t: { label: string; shape: string; capacity: number; taken: number; where: string }): string {
  const shape = SHAPE_WORDS[t.shape] ?? t.shape.replace(/_/g, " ");
  return `${t.label}, ${shape}, ${t.taken} of ${t.capacity} seated, ${t.where}`;
}

/** "Dance floor, near the bottom right" (with the quantity when there are several). */
export function describeFixture(f: { label: string; quantity: number; where: string }): string {
  return `${f.quantity > 1 ? `${f.label}, ${f.quantity}` : f.label}, ${f.where}`;
}

export type Change =
  | { kind: "focus"; name: string; index: number; total: number; selected?: boolean }
  | { kind: "select"; count: number; name?: string }
  | { kind: "move"; count: number; name?: string; dx: number; dy: number }
  | { kind: "turn"; count: number; name?: string; deg: number; group?: boolean }
  | { kind: "paste" | "duplicate" | "delete" | "copy"; count: number }
  | { kind: "resize"; name: string; width: number; depth: number }
  | { kind: "lock"; count: number; locked: boolean }
  | { kind: "order"; count: number; where: "front" | "back" };

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
const subject = (count: number, name?: string) => (count === 1 && name ? name : things(count));

/** The line the polite live region reads out: "Table 4 selected, 3 of 14", "3 things moved 5 cm right", "Pasted 2 things". */
export function describeChange(c: Change): string {
  switch (c.kind) {
    case "focus":
      return `${c.name}${c.selected ? " selected" : ""}, ${c.index} of ${c.total}`;
    case "select":
      return c.count === 0 ? "Nothing selected" : c.count === 1 && c.name ? `${c.name} selected` : `${things(c.count)} selected`;
    case "move": {
      const parts: string[] = [];
      if (c.dx !== 0) parts.push(`${Math.abs(c.dx)} cm ${c.dx > 0 ? "right" : "left"}`);
      if (c.dy !== 0) parts.push(`${Math.abs(c.dy)} cm ${c.dy > 0 ? "down" : "up"}`);
      return `${subject(c.count, c.name)} moved ${parts.join(" and ") || "0 cm"}`;
    }
    case "turn": {
      const how = `${Math.abs(c.deg)}° ${c.deg >= 0 ? "clockwise" : "anticlockwise"}`;
      return c.group ? `${things(c.count)} turned ${how} as a group` : `${subject(c.count, c.name)} turned ${how}`;
    }
    case "paste":
      return `Pasted ${things(c.count)}`;
    case "duplicate":
      return `Duplicated ${things(c.count)}`;
    case "delete":
      return `Deleted ${things(c.count)}`;
    case "copy":
      return `Copied ${things(c.count)}`;
    case "resize":
      return `${c.name} is now ${Math.round(c.width)} by ${Math.round(c.depth)} cm`;
    case "lock":
      return `${c.locked ? "Locked" : "Unlocked"} ${things(c.count)}`;
    case "order":
      return `${things(c.count)} ${c.where === "front" ? "brought to the front" : "sent to the back"}`;
  }
}

// ---------------------------------------------------------------------------
// Touch (B.2)
// ---------------------------------------------------------------------------

/** How long a finger rests before it counts as a long-press, and how far it may wander meanwhile. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 8;

/** True once a pointer has moved far enough from where it went down that it is a drag, not a press. */
export function movedTooFar(from: { x: number; y: number }, to: { x: number; y: number }, slop = LONG_PRESS_SLOP_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > slop;
}
