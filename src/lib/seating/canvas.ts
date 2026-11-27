/**
 * The designer canvas's pure maths (spec 59): wheel and pinch to zoom, the
 * selection box, align / space / grid, and snap guides. No React, no browser:
 * the Room view gives it numbers and draws what it hands back, and the tests
 * pin every rule here.
 *
 * Everything is in room centimetres, x to the right and y DOWN, as in
 * `geometry.ts`. Zoom percentages are screen pixels per centimetre × 100, so
 * 100% is one pixel to the centimetre: a 20 m room is 2000 px wide at 100%.
 */

import { CHAIR_OFFSET_CM, fixturePolygon, polygonsOverlap, tablePolygon, tableSize, type Point } from "./geometry";
import { fixtureGroup } from "./library";
import type { SeatingFixture, SeatingTable } from "./model";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type View = { x: number; y: number; w: number; h: number };

// ---------------------------------------------------------------------------
// Navigation (A.4)
// ---------------------------------------------------------------------------

/** How the wheel behaves. Chosen by the person, per device; never guessed from the events. */
export type NavMode = "trackpad" | "mouse";
export const DEFAULT_NAV_MODE: NavMode = "trackpad";

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 800;

/** The zoom a view shows, as a percentage: `widthPx` screen pixels across `view.w` centimetres. */
export function zoomPercent(viewW: number, widthPx: number): number {
  return viewW > 0 && widthPx > 0 ? (100 * widthPx) / viewW : 100;
}

/** The widest a view may be (10%) and the narrowest (800%), in centimetres. */
export function clampViewWidth(w: number, widthPx: number): number {
  const px = widthPx > 0 ? widthPx : 1000;
  return Math.min((100 * px) / MIN_ZOOM, Math.max((100 * px) / MAX_ZOOM, w));
}

/** Zooms about a point of the room: `factor` above 1 zooms in, and the point stays under the cursor. */
export function zoomViewAbout(view: View, p: Point, factor: number, widthPx: number): View {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const w = clampViewWidth(view.w / factor, widthPx);
  const ratio = w / view.w;
  return { x: p.x - (p.x - view.x) * ratio, y: p.y - (p.y - view.y) * ratio, w, h: view.h * ratio };
}

/** The view at an exact zoom percentage, keeping the point `anchor` where it is on screen. */
export function viewAtPercent(view: View, percent: number, widthPx: number, anchor?: Point): View {
  const centre = anchor ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  const target = clampViewWidth((100 * widthPx) / Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent)), widthPx);
  return zoomViewAbout(view, centre, view.w / target, widthPx);
}

/** The view that shows `box` with a margin, in a window of the given shape (width ÷ height). */
export function fitBox(box: Box, aspect: number, margin = 0.06): View {
  const a = aspect > 0 ? aspect : 1.5;
  const bw = Math.max(box.x1 - box.x0, 50);
  const bh = Math.max(box.y1 - box.y0, 50);
  let w = bw * (1 + margin * 2);
  let h = bh * (1 + margin * 2);
  if (w / h < a) w = h * a;
  else h = w / a;
  return { x: (box.x0 + box.x1) / 2 - w / 2, y: (box.y0 + box.y1) / 2 - h / 2, w, h };
}

export type WheelLike = { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
export type WheelAction = { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number };

/** One mouse-wheel notch is a delta of about 100 pixels; it zooms about 10%. */
const NOTCH_PX = 50;
const NOTCH_RATE = Math.log(1.1) / 100;
/** A trackpad pinch reports small deltas, a few pixels per event, and zooms in proportion to them. */
const PINCH_RATE = 0.01;

/** A wheel delta in pixels, whatever unit the browser reported it in. */
function pixels(delta: number, mode: number): number {
  return mode === 1 ? delta * 40 : mode === 2 ? delta * 800 : delta;
}

/**
 * The zoom factor for one wheel or pinch event: in proportion to how far the
 * gesture moved, so a trackpad never races and a mouse notch is about 10%.
 * `deltaY` is in pixels; negative zooms in. Above 1 zooms in.
 */
export function zoomFactorFor(deltaY: number): number {
  const d = Math.max(-400, Math.min(400, deltaY));
  const rate = Math.abs(d) >= NOTCH_PX ? NOTCH_RATE : PINCH_RATE;
  return Math.exp(-d * rate);
}

/**
 * What a wheel event does on the plan (A.4). The page itself never scrolls or
 * zooms: the caller always prevents the default and applies this.
 *
 * - Trackpad: two-finger scroll or the wheel pans; Shift pans sideways; pinch
 *   (a Ctrl wheel event in Chrome and Firefox) or Ctrl/⌘+scroll zooms.
 * - Mouse: the wheel zooms; Shift+wheel pans sideways; Ctrl/⌘+wheel pans up and down.
 *
 * A pan is in screen pixels: the view moves by that much, in the direction the
 * content was scrolled.
 */
export function wheelAction(e: WheelLike, mode: NavMode): WheelAction {
  const dx = pixels(e.deltaX, e.deltaMode);
  const dy = pixels(e.deltaY, e.deltaMode);
  const command = e.ctrlKey || e.metaKey;
  if (mode === "mouse") {
    if (command) return { kind: "pan", dx: 0, dy: dy || dx };
    if (e.shiftKey) return { kind: "pan", dx: dx || dy, dy: 0 };
    return { kind: "zoom", factor: zoomFactorFor(dy) };
  }
  if (command) return { kind: "zoom", factor: zoomFactorFor(dy) };
  // Some browsers already turn Shift+scroll into a sideways delta; others leave it on the vertical one.
  if (e.shiftKey && dx === 0) return { kind: "pan", dx: dy, dy: 0 };
  return { kind: "pan", dx, dy };
}

/** Safari's pinch is a gesture event with a running scale: the factor since the last event. */
export function gestureFactor(scale: number, lastScale: number): number {
  return lastScale > 0 && scale > 0 ? scale / lastScale : 1;
}

/** The view moved by a pan in screen pixels. */
export function panView(view: View, dxPx: number, dyPx: number, widthPx: number): View {
  const scale = view.w / (widthPx > 0 ? widthPx : 1000);
  return { ...view, x: view.x + dxPx * scale, y: view.y + dyPx * scale };
}

// ---------------------------------------------------------------------------
// What can be picked (A.5)
// ---------------------------------------------------------------------------

/** The layers of the room (A.5): each can be shown, hidden and locked. Venue is the building itself. */
export type Layer = "venue" | "tables" | "furniture" | "decor" | "notes";

export const LAYERS: { id: Layer; label: string }[] = [
  { id: "venue", label: "Venue" },
  { id: "tables", label: "Tables" },
  { id: "furniture", label: "Room furniture" },
  { id: "decor", label: "Flowers & décor" },
  { id: "notes", label: "Notes" },
];

/** Locked layers: drawn, but never clicked, box-selected or moved. The venue is locked until asked for. */
export type LayerLocks = Record<Layer, boolean>;
export const DEFAULT_LOCKS: LayerLocks = { venue: true, tables: false, furniture: false, decor: false, notes: false };

export function parseLocks(raw: unknown): LayerLocks {
  const out = { ...DEFAULT_LOCKS };
  if (typeof raw !== "object" || raw === null) return out;
  for (const l of LAYERS) {
    const v = (raw as Record<string, unknown>)[l.id];
    if (typeof v === "boolean") out[l.id] = v;
  }
  return out;
}

export function parseNavMode(raw: unknown): NavMode {
  return raw === "mouse" ? "mouse" : DEFAULT_NAV_MODE;
}

/** A thing on the plan that can be selected and moved: a table (with its chairs) or a piece of room furniture or décor. */
export type Body = {
  /** `t:<id>` or `f:<id>`. */
  key: string;
  kind: "table" | "fixture";
  id: string;
  x: number;
  y: number;
  rotation: number;
  /** Its footprint, and that plus the chairs (what a selection box touches). */
  poly: Point[];
  hit: Point[];
  layer: Layer;
  /** Same kind and size ⇒ same signature ("every 180 cm round", "all the candles"). */
  sig: string;
  /** Held still by the person (Lock item). */
  locked: boolean;
};

export const itemKey = (kind: "table" | "fixture", id: string) => `${kind === "table" ? "t" : "f"}:${id}`;

export function parseKey(key: string): { kind: "table" | "fixture"; id: string } | null {
  const m = /^([tf]):(.+)$/.exec(key);
  return m ? { kind: m[1] === "t" ? "table" : "fixture", id: m[2]! } : null;
}

/** A placed table as a body, or null when it has no place in the room yet. */
export function tableBody(t: SeatingTable, locked = false): Body | null {
  if (t.pos_x_cm === null || t.pos_y_cm === null) return null;
  const poly = tablePolygon(t);
  const hit = tablePolygon(t, CHAIR_OFFSET_CM + 20);
  if (!poly || !hit) return null;
  const { length, width } = tableSize(t);
  return {
    key: itemKey("table", t.id),
    kind: "table",
    id: t.id,
    x: t.pos_x_cm,
    y: t.pos_y_cm,
    rotation: t.rotation_deg,
    poly,
    hit,
    layer: "tables",
    sig: `table|${t.shape}|${t.capacity}|${length}x${width}|${t.rows_count ?? ""}|${t.aisle_cm ?? ""}`,
    locked,
  };
}

export function fixtureBody(f: SeatingFixture, locked = false): Body {
  const poly = fixturePolygon(f);
  return {
    key: itemKey("fixture", f.id),
    kind: "fixture",
    id: f.id,
    x: f.pos_x_cm,
    y: f.pos_y_cm,
    rotation: f.rotation_deg,
    poly,
    hit: poly,
    layer: fixtureGroup(f.kind) === "decor" ? "decor" : "furniture",
    sig: `fixture|${f.kind}|${f.width_cm}x${f.depth_cm}|${f.custom_item_id ?? ""}|${f.marquee_id ?? ""}`,
    locked,
  };
}

export function boundsOf(poly: Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

const boxPolygon = (b: Box): Point[] => [
  { x: b.x0, y: b.y0 },
  { x: b.x1, y: b.y0 },
  { x: b.x1, y: b.y1 },
  { x: b.x0, y: b.y1 },
];

/** A box from two corners, whichever way the person dragged. */
export function boxFrom(a: Point, b: Point): Box {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/**
 * Which bodies a selection box picks. `touch` takes everything it touches (a
 * table counts with its chairs); `contain` (Alt) only what it fully holds.
 * Locked ones (an item or a whole layer) are skipped: the caller drops those
 * layers first, and an item locked by hand is skipped here.
 */
export function boxHits(bodies: Body[], box: Box, mode: "touch" | "contain"): string[] {
  const rect = boxPolygon(box);
  const out: string[] = [];
  for (const b of bodies) {
    if (b.locked) continue;
    if (mode === "contain") {
      if (b.poly.every((p) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1)) out.push(b.key);
    } else if (polygonsOverlap(b.hit, rect) || b.hit.some((p) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1)) {
      out.push(b.key);
    }
  }
  return out;
}

/** Every body of the selection's kind and size (all the 180 cm rounds, all the candles). */
export function selectSimilar(bodies: Body[], selected: Iterable<string>): string[] {
  const sigs = new Set<string>();
  const want = new Set(selected);
  for (const b of bodies) if (want.has(b.key)) sigs.add(b.sig);
  return bodies.filter((b) => sigs.has(b.sig) && !b.locked).map((b) => b.key);
}

// ---------------------------------------------------------------------------
// Align, space, grid (A.5)
// ---------------------------------------------------------------------------

export type Delta = { dx: number; dy: number };
export type Align = "left" | "centre" | "right" | "top" | "middle" | "bottom";

const near0 = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);

/** How far each body moves to line up with the selection's outline. */
export function alignBodies(bodies: Body[], how: Align): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (bodies.length < 2) return out;
  const boxes = bodies.map((b) => boundsOf(b.poly));
  const all = unionBox(boxes)!;
  bodies.forEach((b, i) => {
    const bx = boxes[i]!;
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = all.x0 - bx.x0;
    else if (how === "right") dx = all.x1 - bx.x1;
    else if (how === "centre") dx = (all.x0 + all.x1) / 2 - (bx.x0 + bx.x1) / 2;
    else if (how === "top") dy = all.y0 - bx.y0;
    else if (how === "bottom") dy = all.y1 - bx.y1;
    else dy = (all.y0 + all.y1) / 2 - (bx.y0 + bx.y1) / 2;
    out.set(b.key, { dx: near0(dx), dy: near0(dy) });
  });
  return out;
}

/** Equal gaps between bodies across (`x`) or down (`y`): the two outermost stay, the rest are spaced between them. Needs three or more. */
export function distributeBodies(bodies: Body[], axis: "x" | "y"): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (bodies.length < 3) return out;
  const lo = axis === "x" ? "x0" : "y0";
  const hi = axis === "x" ? "x1" : "y1";
  const items = bodies
    .map((b) => ({ b, box: boundsOf(b.poly) }))
    .sort((a, c) => a.box[lo] + a.box[hi] - (c.box[lo] + c.box[hi]));
  const start = Math.min(...items.map((i) => i.box[lo]));
  const end = Math.max(...items.map((i) => i.box[hi]));
  const sizes = items.reduce((n, i) => n + (i.box[hi] - i.box[lo]), 0);
  const gap = (end - start - sizes) / (items.length - 1);
  let at = start;
  for (const i of items) {
    const move = at - i.box[lo];
    out.set(i.b.key, axis === "x" ? { dx: near0(move), dy: 0 } : { dx: 0, dy: near0(move) });
    at += i.box[hi] - i.box[lo] + gap;
  }
  return out;
}

/**
 * Lays the bodies out in a grid with `gapCm` between cells, in reading order
 * (top to bottom, left to right), starting where the selection's top-left is.
 * `columns` defaults to the squarest grid.
 */
export function gridBodies(bodies: Body[], gapCm: number, columns?: number): Map<string, Delta> {
  const out = new Map<string, Delta>();
  if (bodies.length < 2) return out;
  const cols = Math.max(1, Math.min(bodies.length, Math.round(columns ?? Math.ceil(Math.sqrt(bodies.length)))));
  const gap = Math.max(0, gapCm);
  const items = bodies.map((b) => ({ b, box: boundsOf(b.poly) }));
  const origin = unionBox(items.map((i) => i.box))!;
  const cellW = Math.max(...items.map((i) => i.box.x1 - i.box.x0));
  const cellH = Math.max(...items.map((i) => i.box.y1 - i.box.y0));
  const byRow = [...items].sort((a, c) => a.box.y0 + a.box.y1 - (c.box.y0 + c.box.y1));
  const rows: (typeof items)[] = [];
  for (let i = 0; i < byRow.length; i += cols) rows.push(byRow.slice(i, i + cols).sort((a, c) => a.box.x0 + a.box.x1 - (c.box.x0 + c.box.x1)));
  rows.forEach((row, r) =>
    row.forEach((i, c) => {
      const cx = origin.x0 + c * (cellW + gap) + cellW / 2;
      const cy = origin.y0 + r * (cellH + gap) + cellH / 2;
      out.set(i.b.key, { dx: near0(cx - (i.box.x0 + i.box.x1) / 2), dy: near0(cy - (i.box.y0 + i.box.y1) / 2) });
    }),
  );
  return out;
}

/** The delta that keeps every body's centre inside the room, so a group moved to the wall keeps its shape. */
export function clampDelta(bodies: Pick<Body, "x" | "y">[], d: Delta, roomW: number, roomD: number): Delta {
  if (bodies.length === 0) return d;
  const minX = Math.min(...bodies.map((b) => b.x));
  const maxX = Math.max(...bodies.map((b) => b.x));
  const minY = Math.min(...bodies.map((b) => b.y));
  const maxY = Math.max(...bodies.map((b) => b.y));
  return {
    dx: Math.min(roomW - maxX, Math.max(-minX, d.dx)),
    dy: Math.min(roomD - maxY, Math.max(-minY, d.dy)),
  };
}

// ---------------------------------------------------------------------------
// Snap guides (A.5)
// ---------------------------------------------------------------------------

/** A line to draw while dragging: what the moving outline lined up with, or the equal gap it kept. */
export type Guide = {
  /** `x`: a vertical line at `at`, from `from` to `to` in y. `y`: a horizontal line at `at`, from `from` to `to` in x. */
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
  kind: "edge" | "centre" | "spacing";
  /** A spacing guide's gap, in cm. */
  gap?: number;
};
/** `x` / `y` say which axes found a match, so the caller can fall back to the grid on the other. */
export type SnapResult = { dx: number; dy: number; x: boolean; y: boolean; guides: Guide[] };

type Axis = "x" | "y";
const lo = (a: Axis) => (a === "x" ? "x0" : "y0");
const hi = (a: Axis) => (a === "x" ? "x1" : "y1");
const cross = (a: Axis): Axis => (a === "x" ? "y" : "x");
const mid = (b: Box, a: Axis) => (b[lo(a)] + b[hi(a)]) / 2;
/** Do two boxes share some extent on `a`? */
const overlaps = (p: Box, q: Box, a: Axis) => Math.min(p[hi(a)], q[hi(a)]) - Math.max(p[lo(a)], q[lo(a)]) > 0;

type Candidate = { delta: number; kind: Guide["kind"]; build: (moved: Box) => Guide[] };

function axisCandidates(moving: Box, others: Box[], axis: Axis, threshold: number): Candidate[] {
  const out: Candidate[] = [];
  const x = cross(axis);
  const lines = (b: Box): [number, Guide["kind"]][] => [
    [b[lo(axis)], "edge"],
    [mid(b, axis), "centre"],
    [b[hi(axis)], "edge"],
  ];
  // Edges and centres: any of the moving outline's three lines meeting any of another's.
  for (const o of others) {
    for (const [target, kind] of lines(o)) {
      for (const [mine] of lines(moving)) {
        const delta = target - mine;
        if (Math.abs(delta) > threshold) continue;
        out.push({
          delta,
          kind,
          build: (m) => {
            const span = [m, o];
            return [{ axis, at: target, from: Math.min(...span.map((s) => s[lo(x)])), to: Math.max(...span.map((s) => s[hi(x)])), kind }];
          },
        });
      }
    }
  }
  // Equal gaps: keep the spacing two others already have.
  const nearby = others.filter((o) => overlaps(o, moving, x));
  const size = moving[hi(axis)] - moving[lo(axis)];
  for (const a of nearby) {
    for (const b of nearby) {
      if (a === b || a[hi(axis)] > b[lo(axis)] || !overlaps(a, b, x)) continue;
      const gap = b[lo(axis)] - a[hi(axis)];
      const ys = (m: Box, p: Box) => {
        const from = Math.max(m[lo(x)], p[lo(x)]);
        const to = Math.min(m[hi(x)], p[hi(x)]);
        return (from + to) / 2;
      };
      // Past b, at the same gap the two already have.
      if (gap > 0) {
        const delta = b[hi(axis)] + gap - moving[lo(axis)];
        if (Math.abs(delta) <= threshold)
          out.push({
            delta,
            kind: "spacing",
            build: (m) => [
              { axis: x, at: ys(a, b), from: a[hi(axis)], to: b[lo(axis)], kind: "spacing", gap },
              { axis: x, at: ys(b, m), from: b[hi(axis)], to: m[lo(axis)], kind: "spacing", gap },
            ],
          });
        // Before a, at that gap.
        const before = a[lo(axis)] - gap - moving[hi(axis)];
        if (Math.abs(before) <= threshold)
          out.push({
            delta: before,
            kind: "spacing",
            build: (m) => [
              { axis: x, at: ys(m, a), from: m[hi(axis)], to: a[lo(axis)], kind: "spacing", gap },
              { axis: x, at: ys(a, b), from: a[hi(axis)], to: b[lo(axis)], kind: "spacing", gap },
            ],
          });
      }
      // Between them, equal gaps both sides.
      if (gap >= size) {
        const side = (gap - size) / 2;
        const delta = a[hi(axis)] + side - moving[lo(axis)];
        if (Math.abs(delta) <= threshold)
          out.push({
            delta,
            kind: "spacing",
            build: (m) => [
              { axis: x, at: ys(a, m), from: a[hi(axis)], to: m[lo(axis)], kind: "spacing", gap: side },
              { axis: x, at: ys(m, b), from: m[hi(axis)], to: b[lo(axis)], kind: "spacing", gap: side },
            ],
          });
      }
    }
  }
  return out;
}

/**
 * How far to nudge the moving outline so it lines up with its neighbours, and
 * the lines to draw while it does. It snaps to the edges and centres of nearby
 * boxes and to equal spacing between them, on each axis separately, taking the
 * closest match inside `threshold` cm; edges and centres win a tie over
 * spacing. With nothing close, it moves nowhere and draws nothing.
 */
export function snapGuides(moving: Box, others: Box[], threshold: number): SnapResult {
  const best = (axis: Axis): Candidate | null => {
    const found = axisCandidates(moving, others, axis, threshold);
    let pick: Candidate | null = null;
    for (const c of found) {
      if (!pick || Math.abs(c.delta) < Math.abs(pick.delta) - 1e-9 || (Math.abs(c.delta) <= Math.abs(pick.delta) + 1e-9 && pick.kind === "spacing" && c.kind !== "spacing")) pick = c;
    }
    return pick;
  };
  const px = best("x");
  const py = best("y");
  const dx = px?.delta ?? 0;
  const dy = py?.delta ?? 0;
  const moved: Box = { x0: moving.x0 + dx, y0: moving.y0 + dy, x1: moving.x1 + dx, y1: moving.y1 + dy };
  return { dx, dy, x: px !== null, y: py !== null, guides: [...(px?.build(moved) ?? []), ...(py?.build(moved) ?? [])] };
}
