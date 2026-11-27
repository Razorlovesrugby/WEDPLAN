/**
 * Resizing by dragging a handle, and turning a selection as one formation (spec 60 C.1, C.2).
 * Pure: the Room view hands in numbers and draws what comes back.
 *
 * Everything is in room centimetres, y DOWN, rotations in degrees clockwise (as in `geometry.ts`).
 * A body has a centre, a rotation and a size `w` × `d` in its own frame: `w` runs along its own x axis
 * (a fixture's width, a table's length) and `d` along its own y axis (depth, a table's width).
 */

import { normaliseDegrees, rotate, type Point } from "./geometry";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Which way each handle pulls, in the body's own frame. */
export const HANDLE_DIRS: Record<HandleId, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/** The sizes the database holds (fixtures 20 to 5000 cm, tables 40 to 2000 cm). */
export type SizeLimits = { min: number; max: number };
export const FIXTURE_LIMITS: SizeLimits = { min: 20, max: 5000 };
export const TABLE_LIMITS: SizeLimits = { min: 40, max: 2000 };

/** Sizes snap to this many centimetres. */
export const SIZE_STEP_CM = 5;

/**
 * Tables whose drawing follows their length and width, so dragging a handle shows what it does. A banquet run, ceremony
 * rows, a half-moon and a serpentine are drawn from their own pieces or arcs: their size is set in the table's form.
 */
export const RESIZABLE_TABLE_SHAPES: readonly string[] = ["round", "square", "long", "head", "sweetheart", "oval"];

export type Resizable = {
  x: number;
  y: number;
  rotation: number;
  w: number;
  d: number;
  limits: SizeLimits;
  /** A round or square table has one size, its diameter or side: one handle, and the centre stays put. */
  single?: "round" | "square";
};

export type ResizeOptions = {
  /** Keep the proportions. */
  shift?: boolean;
  /** Resize about the centre. */
  alt?: boolean;
  /** Size step in cm; 0 turns the grid off. */
  step?: number;
  /** Lines of neighbours (room x's and y's) the moving edge may snap to, within `threshold` cm. Used only when the body is turned a quarter-turn at a time. */
  targets?: { xs: number[]; ys: number[] };
  threshold?: number;
};

export type Resized = { x: number; y: number; w: number; d: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toStep = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : Math.round(v));

/** Where each handle sits, in room coordinates: eight round the outline, or one for a round or square table. */
export function handlePoints(b: Pick<Resizable, "x" | "y" | "rotation" | "w" | "d" | "single">): { id: HandleId; at: Point }[] {
  const put = (lx: number, ly: number): Point => {
    const p = rotate({ x: lx, y: ly }, b.rotation);
    return { x: b.x + p.x, y: b.y + p.y };
  };
  if (b.single) {
    const k = b.single === "round" ? Math.SQRT1_2 : 1;
    return [{ id: "se", at: put((b.w / 2) * k, (b.d / 2) * k) }];
  }
  return (Object.keys(HANDLE_DIRS) as HandleId[]).map((id) => ({ id, at: put((HANDLE_DIRS[id].x * b.w) / 2, (HANDLE_DIRS[id].y * b.d) / 2) }));
}

/**
 * Handles on a 30 cm lantern at fit zoom would sit on top of each other and on the turn handle, so they appear only when
 * the smaller side is at least `minPx` screen pixels (`unit` is room cm per screen pixel). Below that the width and
 * depth fields are the way.
 */
export function handlesVisible(b: Pick<Resizable, "w" | "d" | "single">, unit: number, minPx = 36): boolean {
  if (!(unit > 0)) return false;
  return (b.single ? b.w : Math.min(b.w, b.d)) / unit >= minPx;
}

/** The mouse cursor for a handle: the resize arrow that matches the way it pulls once the body is turned. */
export function handleCursor(id: HandleId, rotation: number): string {
  const dir = HANDLE_DIRS[id];
  const world = rotate({ x: dir.x, y: dir.y }, rotation);
  // The axis the handle works along, folded to 0 to 180 degrees, then to the nearest of the four arrows.
  const deg = ((Math.atan2(world.y, world.x) * 180) / Math.PI + 180) % 180;
  const arrows = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const;
  return arrows[Math.round(deg / 45) % 4]!;
}

/**
 * The body as it is once the handle `handle` has been dragged to `pointer`. The edge opposite the handle stays where it
 * is (Alt: the centre stays), sizes snap to `step` cm and to a neighbour's line when one is close, and every size stays
 * inside the limits. Shift keeps the proportions.
 */
export function resizeBody(b: Resizable, handle: HandleId, pointer: Point, o: ResizeOptions = {}): Resized {
  const step = o.step ?? SIZE_STEP_CM;
  const { min, max } = b.limits;
  const local = rotate({ x: pointer.x - b.x, y: pointer.y - b.y }, -b.rotation);

  if (b.single) {
    const size = clamp(toStep(2 * Math.max(Math.abs(local.x), Math.abs(local.y)), step), min, max);
    return { x: b.x, y: b.y, w: size, d: size };
  }

  const dir = HANDLE_DIRS[handle];
  const turn90 = ((b.rotation % 90) + 90) % 90;
  const quarter = turn90 < 1e-6 || 90 - turn90 < 1e-6;

  /** One axis: the new size, and whether a neighbour's line (not the grid) decided it. */
  const axis = (a: "x" | "y", size: number, d: number, p: number): { size: number; onLine: boolean } => {
    if (d === 0) return { size, onLine: false };
    // The moving edge is at `edge`, in the body's frame; the opposite edge is at `fixed`.
    let edge = p;
    let onLine = false;
    if (o.targets && quarter && (o.threshold ?? 0) > 0) {
      const v = rotate(a === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 }, b.rotation);
      const worldAxis = Math.abs(v.x) > 0.5 ? "x" : "y";
      const sgn = Math.sign(worldAxis === "x" ? v.x : v.y) || 1;
      const here = (worldAxis === "x" ? b.x : b.y) + sgn * edge;
      let best: number | null = null;
      for (const t of worldAxis === "x" ? o.targets.xs : o.targets.ys) {
        if (Math.abs(t - here) <= (o.threshold ?? 0) && (best === null || Math.abs(t - here) < Math.abs(best - here))) best = t;
      }
      if (best !== null) {
        edge += sgn * (best - here);
        onLine = true;
      }
    }
    const raw = o.alt ? 2 * d * edge : d * edge + size / 2;
    return { size: onLine ? raw : toStep(raw, step), onLine };
  };

  let w = b.w;
  let dd = b.d;
  if (o.shift && dir.x !== 0 && dir.y !== 0) {
    // A corner with the proportions kept: the bigger of the two pulls decides the scale.
    const nw = axis("x", b.w, dir.x, local.x).size;
    const nd = axis("y", b.d, dir.y, local.y).size;
    const scale = Math.max(nw / b.w, nd / b.d);
    w = b.w * scale;
    dd = b.d * scale;
  } else if (o.shift) {
    // An edge with the proportions kept: the other side grows or shrinks in step, about its own centre.
    if (dir.x !== 0) {
      w = axis("x", b.w, dir.x, local.x).size;
      dd = b.d * (w / b.w);
    } else {
      dd = axis("y", b.d, dir.y, local.y).size;
      w = b.w * (dd / b.d);
    }
  } else {
    w = axis("x", b.w, dir.x, local.x).size;
    dd = axis("y", b.d, dir.y, local.y).size;
  }
  w = clamp(Math.round(w), min, max);
  dd = clamp(Math.round(dd), min, max);

  // The centre moves by half of what the size changed, towards the handle, so the opposite edge stays where it is.
  const shiftX = o.alt || (o.shift && dir.x === 0) ? 0 : (dir.x * (w - b.w)) / 2;
  const shiftY = o.alt || (o.shift && dir.y === 0) ? 0 : (dir.y * (dd - b.d)) / 2;
  const c = rotate({ x: shiftX, y: shiftY }, b.rotation);
  return { x: Math.round(b.x + c.x), y: Math.round(b.y + c.y), w, d: dd };
}

// ---------------------------------------------------------------------------
// Turning a selection as one formation (C.2)
// ---------------------------------------------------------------------------

export type Turned = { key: string; x: number; y: number; rotation: number };

/**
 * Turns the things round `centre` by `deg` (clockwise): their positions move round the centre, and each turns by the
 * same angle, so the formation keeps its shape. R, by contrast, turns each about its own centre.
 */
export function turnAbout(bodies: { key: string; x: number; y: number; rotation: number }[], centre: Point, deg: number): Turned[] {
  return bodies.map((b) => {
    const p = rotate({ x: b.x - centre.x, y: b.y - centre.y }, deg);
    return { key: b.key, x: Math.round(centre.x + p.x), y: Math.round(centre.y + p.y), rotation: normaliseDegrees(b.rotation + deg) };
  });
}

/** True when every turned centre is still inside the room. */
export function allInRoom(moves: { x: number; y: number }[], roomW: number, roomD: number): boolean {
  return moves.every((m) => m.x >= 0 && m.x <= roomW && m.y >= 0 && m.y <= roomD);
}
