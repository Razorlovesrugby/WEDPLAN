/**
 * Placing many things fast (spec 59 Part C): favourites and recent items, the
 * keys 1 to 9 that pick between them, stamping along a line, and repeating an
 * item at a gap. Pure: the Library, the Room view and the tests share it.
 *
 * An item is named by a reference: a built-in tile by its id (`round`,
 * `candles`), the couple's own item as `custom:<id>`, a marquee template as
 * `marquee:<id>`. These are the ids the Library already gives its tiles.
 */

import type { Point } from "./geometry";

export const MAX_FAVOURITES = 40;
export const RECENT_MAX = 6;
/** Keys 1 to 9 pick the first nine choices while Stamp is on. */
export const STAMP_KEYS = 9;
/** A line or a repeat never makes more than this many at once. */
export const MAX_STAMPS = 60;
/** Stamping along a line puts the next one this far (cm) past the width of the item, by default. */
export const LINE_EXTRA_CM = 20;

/** Item references from stored data: only sensible strings, once each, in order. */
export function parseRefs(raw: unknown, max = MAX_FAVOURITES): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const ref = v.trim();
    if (ref.length === 0 || ref.length > 80 || out.includes(ref)) continue;
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

/** Stars an item (added at the end, "in the order starred") or takes the star off. Full is refused by leaving the list as it was. */
export function toggleFavourite(favourites: readonly string[], ref: string): string[] {
  if (favourites.includes(ref)) return favourites.filter((r) => r !== ref);
  return favourites.length >= MAX_FAVOURITES ? [...favourites] : [...favourites, ref];
}

/** Moves a favourite to a position in the row (dragging to reorder). */
export function moveFavourite(favourites: readonly string[], ref: string, to: number): string[] {
  const from = favourites.indexOf(ref);
  if (from < 0) return [...favourites];
  const next = favourites.filter((r) => r !== ref);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, ref);
  return next;
}

/** The item just stamped goes to the front of the recent list, once, and the list keeps the last six. */
export function pushRecent(recent: readonly string[], ref: string): string[] {
  return [ref, ...recent.filter((r) => r !== ref)].slice(0, RECENT_MAX);
}

/** What keys 1 to 9 pick: the favourites in order, then the recent ones not already there. */
export function stampChoices(favourites: readonly string[], recent: readonly string[]): string[] {
  const out: string[] = [];
  for (const ref of [...favourites, ...recent]) if (!out.includes(ref)) out.push(ref);
  return out.slice(0, STAMP_KEYS);
}

/** The choice a digit key picks (1 to 9), or null. */
export function choiceForKey(key: string, choices: readonly string[]): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  return choices[Number(key) - 1] ?? null;
}

/** How far apart stamps go along a line by default: the item's width and a little more. */
export function defaultStep(widthCm: number): number {
  return Math.max(10, Math.round(widthCm + LINE_EXTRA_CM));
}

/**
 * Where each stamp goes along a drag from `a` to `b`: the first at `a`, then
 * every `step` cm, and none past `b`. At most `MAX_STAMPS`. A drag shorter than
 * one step is a single stamp at `a`.
 */
export function lineStops(a: Point, b: Point, step: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const s = Math.max(5, step);
  if (!(length > 0)) return [{ ...a }];
  const n = Math.min(MAX_STAMPS - 1, Math.floor(length / s));
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ux * s * i, y: a.y + uy * s * i }));
}

/**
 * Where `count` more copies of an item go, in a row across (`x`) or a column
 * down (`y`), each `gap` cm clear of the one before. `size` is the item's
 * outline along that direction; `origin` is the original's centre.
 */
export function repeatStops(origin: Point, size: { w: number; h: number }, count: number, gap: number, dir: "across" | "down"): Point[] {
  const n = Math.max(0, Math.min(MAX_STAMPS, Math.floor(count)));
  const pitch = (dir === "across" ? size.w : size.h) + Math.max(0, gap);
  return Array.from({ length: n }, (_, i) => (dir === "across" ? { x: origin.x + pitch * (i + 1), y: origin.y } : { x: origin.x, y: origin.y + pitch * (i + 1) }));
}
