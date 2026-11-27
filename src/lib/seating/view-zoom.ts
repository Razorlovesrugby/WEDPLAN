/**
 * Zoom and pan for the plans that are only looked at (spec 60 D.1): the shared plan a vendor opens from a link, and the
 * table close-up. A pared-down cousin of `canvas.ts`'s navigation: here the content is a picture laid out by the page
 * (not an SVG view box), so the state is a scale and an offset in screen pixels, with 100% meaning "fits the page".
 * Pure.
 */

import { zoomFactorFor, type WheelLike } from "./canvas";

/** `k` is the scale (1 = fitted to the page's width); `x`/`y` move the picture's top left, in screen pixels. */
export type ZoomState = { k: number; x: number; y: number };

export const FIT: ZoomState = { k: 1, x: 0, y: 0 };
export const MIN_K = 0.1;
export const MAX_K = 8;

export const percentOf = (z: ZoomState): number => Math.round(z.k * 100);
export const isZoomedIn = (z: ZoomState): boolean => z.k > 1.001;

/** Zooms by `factor` keeping the screen point `p` (in the viewport's own coordinates) where it is. */
export function zoomAbout(z: ZoomState, p: { x: number; y: number }, factor: number): ZoomState {
  if (!(factor > 0) || !Number.isFinite(factor)) return z;
  const k = Math.min(MAX_K, Math.max(MIN_K, z.k * factor));
  const ratio = k / z.k;
  return { k, x: p.x - (p.x - z.x) * ratio, y: p.y - (p.y - z.y) * ratio };
}

/** Exactly `percent` (10 to 800), about `p`. */
export function zoomToPercent(z: ZoomState, percent: number, p: { x: number; y: number }): ZoomState {
  return zoomAbout(z, p, Math.min(MAX_K, Math.max(MIN_K, percent / 100)) / z.k);
}

export function panBy(z: ZoomState, dx: number, dy: number): ZoomState {
  return { ...z, x: z.x + dx, y: z.y + dy };
}

/**
 * Keeps part of the picture on screen: it can be dragged mostly out of view but never lost, so there is always
 * something to grab. `keep` is how much (in px) must stay inside the viewport on each axis.
 */
export function clampPan(z: ZoomState, view: { w: number; h: number }, content: { w: number; h: number }, keep = 48): ZoomState {
  const cw = content.w * z.k;
  const ch = content.h * z.k;
  const k = Math.min(keep, cw, ch, view.w, view.h);
  return {
    k: z.k,
    x: Math.min(view.w - k, Math.max(k - cw, z.x)),
    y: Math.min(view.h - k, Math.max(k - ch, z.y)),
  };
}

/**
 * What a wheel event does on a plan that is only looked at: pinch (Ctrl in Chrome and Firefox) and Ctrl or ⌘ with the
 * scroll zoom; a plain scroll is not ours at all, so the page scrolls (these pages have more below the plan).
 */
export function viewWheel(e: WheelLike): { factor: number } | null {
  return e.ctrlKey || e.metaKey ? { factor: zoomFactorFor(e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY) } : null;
}

export type KeyAction = "in" | "out" | "hundred" | "fit";

/** `+` `−` `0` and Shift+1, as on the planner's plan. */
export function keyAction(e: { key: string; code?: string; shiftKey: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === "+" || e.key === "=") return "in";
  if (e.key === "-" || e.key === "_") return "out";
  if (e.key === "0") return "hundred";
  if (e.shiftKey && (e.code === "Digit1" || e.key === "!")) return "fit";
  return null;
}

/** One step of the + and − buttons and keys. */
export const STEP = 1.25;
