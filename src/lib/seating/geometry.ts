/**
 * Seating geometry (spec 33 §C.2) — sizes, chair positions, overlap and
 * distance, all in room centimetres. Pure, so the Room view, the table drawer,
 * the printed floor plan and the warnings all draw and measure the same thing.
 *
 * Coordinates are screen-style: x to the right, y DOWN. A table's own frame
 * has its long side along x; `rotation_deg` turns it clockwise on screen.
 */

import type { SeatingTableShape } from "@/lib/types/database";

export type Point = { x: number; y: number };

export type TableGeometryInput = {
  shape: SeatingTableShape;
  capacity: number;
  ends_seated: boolean;
  width_cm: number | null;
  length_cm: number | null;
  pos_x_cm: number | null;
  pos_y_cm: number | null;
  rotation_deg: number;
  /** Ceremony rows (spec 57): rows of chairs, and the aisle between the two blocks. */
  rows_count?: number | null;
  aisle_cm?: number | null;
  /** Banquet runs (spec 57): `[{len, turn}]`, read defensively because it is stored as json. */
  segments?: unknown;
};

/** A banquet run is straight pieces: each `len` cm long, turned `turn` degrees (clockwise on screen) from the one before. */
export type BanquetSegment = { len: number; turn: number };

type SizeInput = Pick<
  TableGeometryInput,
  "shape" | "capacity" | "ends_seated" | "width_cm" | "length_cm" | "rows_count" | "aisle_cm" | "segments"
>;

export type RectInput = {
  pos_x_cm: number;
  pos_y_cm: number;
  width_cm: number;
  depth_cm: number;
  rotation_deg: number;
};

/** Centimetres of table edge one diner needs. */
export const CM_PER_CHAIR = 60;
/** How far a chair's centre sits outside the table's edge. */
export const CHAIR_OFFSET_CM = 35;
/** Depth of a long or head table. */
export const LONG_TABLE_DEPTH_CM = 75;
/** Ceremony rows: a chair's width along a row, and the distance between rows. */
export const ROW_CHAIR_PITCH_CM = 50;
export const ROW_PITCH_CM = 55;
export const DEFAULT_AISLE_CM = 120;
/** Chair depth plus a walkway, for the optional clearance rings (§C.1, Q6). */
export const CLEARANCE_CM = 120;
/** Edges further apart than this aren't "near" (§B.1). */
export const NEAR_CM = 300;

function longSideSeats(capacity: number, endsSeated: boolean): number {
  const along = endsSeated ? Math.max(0, capacity - 2) : capacity;
  return Math.max(1, Math.ceil(along / 2));
}

/**
 * The table's footprint: `length` along its own x axis, `width` along y.
 * Round and square tables are the same both ways. Explicit sizes win.
 */
export function tableSize(t: SizeInput): {
  length: number;
  width: number;
} {
  let length = 0;
  let width = 0;
  switch (t.shape) {
    case "round": {
      const d = Math.max(90, Math.round((t.capacity * CM_PER_CHAIR) / Math.PI));
      length = d;
      width = d;
      break;
    }
    case "square": {
      const side = Math.max(90, Math.ceil(t.capacity / 4) * CM_PER_CHAIR);
      length = side;
      width = side;
      break;
    }
    case "long":
      length = Math.max(120, longSideSeats(t.capacity, t.ends_seated) * CM_PER_CHAIR);
      width = LONG_TABLE_DEPTH_CM;
      break;
    case "head":
      length = Math.max(120, t.capacity * CM_PER_CHAIR);
      width = LONG_TABLE_DEPTH_CM;
      break;
    case "sweetheart":
      length = Math.max(120, t.capacity * CM_PER_CHAIR);
      width = 60;
      break;
    case "oval": {
      width = t.width_cm ?? 110;
      length = Math.max(160, Math.round((2 * t.capacity * CM_PER_CHAIR) / Math.PI - width));
      break;
    }
    case "half_moon": {
      const d = Math.max(120, Math.round((2 * t.capacity * CM_PER_CHAIR) / Math.PI));
      length = d;
      width = Math.round(d / 2);
      break;
    }
    case "serpentine":
      length = Math.max(180, Math.ceil(t.capacity / 2) * CM_PER_CHAIR);
      width = LONG_TABLE_DEPTH_CM;
      break;
    case "rows": {
      const rows = Math.max(1, t.rows_count ?? 1);
      const perRow = Math.ceil(t.capacity / rows);
      length = perRow * ROW_CHAIR_PITCH_CM + (t.aisle_cm ?? DEFAULT_AISLE_CM);
      width = rows * ROW_PITCH_CM;
      break;
    }
    case "banquet": {
      const run = banquetRun(t.segments, t.capacity);
      return { length: t.length_cm ?? run.length, width: t.width_cm ?? run.width };
    }
  }
  if (t.shape === "round" || t.shape === "square") {
    const explicit = t.length_cm ?? t.width_cm;
    if (explicit) return { length: explicit, width: explicit };
    return { length, width };
  }
  return { length: t.length_cm ?? length, width: t.width_cm ?? width };
}

/** Reads a banquet run's stored segments, dropping anything that isn't a sane piece. At most 12 pieces. */
export function readSegments(raw: unknown): BanquetSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: BanquetSegment[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const len = Number((item as { len?: unknown }).len);
    const turn = Number((item as { turn?: unknown }).turn);
    if (Number.isFinite(len) && len >= 60 && len <= 5000) out.push({ len, turn: Number.isFinite(turn) ? turn : 0 });
  }
  return out;
}

/**
 * A banquet run laid out in its own frame, centred on its bounding box: the
 * bounding box's size, and `capacity` chairs along both sides of every piece,
 * in order along one side and back along the other. An empty or unreadable
 * run is one straight piece sized for the capacity.
 */
function banquetRun(raw: unknown, capacity: number): { length: number; width: number; seats: Point[] } {
  let segs = readSegments(raw);
  if (segs.length === 0) segs = [{ len: Math.max(120, Math.ceil(capacity / 2) * CM_PER_CHAIR), turn: 0 }];
  const depth = LONG_TABLE_DEPTH_CM;
  let x = 0;
  let y = 0;
  let heading = 0;
  type Piece = { a: Point; h: number; len: number };
  const pieces: Piece[] = [];
  const corners: Point[] = [];
  for (const seg of segs) {
    heading += seg.turn;
    const h = (heading * Math.PI) / 180;
    const a = { x, y };
    const b = { x: x + seg.len * Math.cos(h), y: y + seg.len * Math.sin(h) };
    pieces.push({ a, h, len: seg.len });
    const nx = -Math.sin(h) * (depth / 2);
    const ny = Math.cos(h) * (depth / 2);
    corners.push({ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny });
    x = b.x;
    y = b.y;
  }
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // How many chairs on each side of each piece: proportional to its length, at least one, summing to `capacity`.
  const total = pieces.reduce((sum, p) => sum + p.len, 0);
  const counts = pieces.flatMap((p) => [Math.max(1, Math.round(((capacity / 2) * p.len) / total)), Math.max(1, Math.round(((capacity / 2) * p.len) / total))]);
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum !== capacity && capacity > 0) {
    if (sum < capacity) {
      let best = 0;
      counts.forEach((c, i) => {
        if (pieces[i >> 1]!.len / c > pieces[best >> 1]!.len / counts[best]!) best = i;
      });
      counts[best]!++;
      sum++;
    } else {
      let best = -1;
      counts.forEach((c, i) => {
        if (c > 1 && (best < 0 || pieces[i >> 1]!.len / c < pieces[best >> 1]!.len / counts[best]!)) best = i;
      });
      if (best < 0) break;
      counts[best]!--;
      sum--;
    }
  }
  const off = depth / 2 + CHAIR_OFFSET_CM;
  const side = (i: number, sign: 1 | -1): Point[] => {
    const p = pieces[i]!;
    const n = counts[i * 2 + (sign === 1 ? 0 : 1)]!;
    return Array.from({ length: n }, (_, k) => {
      const along = (p.len * (k + 0.5)) / n;
      return {
        x: p.a.x + along * Math.cos(p.h) - sign * Math.sin(p.h) * off - cx,
        y: p.a.y + along * Math.sin(p.h) + sign * Math.cos(p.h) * off - cy,
      };
    });
  };
  const seats: Point[] = [];
  for (let i = 0; i < pieces.length; i++) seats.push(...side(i, -1));
  for (let i = pieces.length - 1; i >= 0; i--) seats.push(...side(i, 1).reverse());
  return { length: maxX - minX, width: maxY - minY, seats: seats.slice(0, capacity) };
}

/** A serpentine table's wave: how far its centre line sits from straight at `x` (the table's own frame). */
export const SERPENTINE_AMPLITUDE_CM = 40;
export function serpentineWave(x: number, halfLength: number): number {
  return SERPENTINE_AMPLITUDE_CM * Math.sin((Math.PI * x) / halfLength);
}

/** The outline of a serpentine table as an SVG path, `grow` cm bigger all round: a band that follows the wave. */
export function serpentinePath(halfLength: number, halfWidth: number, grow = 0): string {
  const n = 24;
  const xs = Array.from({ length: n + 1 }, (_, i) => -halfLength + (2 * halfLength * i) / n);
  const top = xs.map((x) => `${x.toFixed(1)} ${(serpentineWave(x, halfLength) - halfWidth - grow).toFixed(1)}`);
  const bottom = [...xs].reverse().map((x) => `${x.toFixed(1)} ${(serpentineWave(x, halfLength) + halfWidth + grow).toFixed(1)}`);
  return `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
}

export function rotate(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function spread(count: number, from: number, to: number): number[] {
  if (count <= 0) return [];
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, i) => from + step * (i + 0.5));
}

/**
 * Chair centres in the table's OWN frame (centre at 0,0, unrotated), in
 * seat-index order: clockwise from the top. A head table seats one side only,
 * numbered left to right as the room sees it (Q5).
 */
export function localSeatPositions(t: SizeInput): Point[] {
  const { length, width } = tableSize(t);
  const n = t.capacity;
  const hl = length / 2;
  const hw = width / 2;
  const o = CHAIR_OFFSET_CM;

  switch (t.shape) {
    case "round": {
      const r = hl + o;
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
    }
    case "head":
    case "sweetheart":
      return spread(n, -hl, hl).map((x) => ({ x, y: -hw - o }));
    case "oval":
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: (hl + o) * Math.cos(a), y: (hw + o) * Math.sin(a) };
      });
    case "half_moon": {
      // The flat side is the bottom of the box; chairs follow the curve, left to right over the top.
      const r = hl + o;
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI + (Math.PI * (i + 0.5)) / n;
        return { x: r * Math.cos(a), y: hw + r * Math.sin(a) };
      });
    }
    case "serpentine": {
      // A long table with one S in it: both sides follow y = amplitude * sin(pi * x / hl).
      const top = Math.ceil(n / 2);
      const bottom = n - top;
      const wave = (x: number) => serpentineWave(x, hl);
      return [
        ...spread(top, -hl, hl).map((x) => ({ x, y: wave(x) - hw - o })),
        ...spread(bottom, -hl, hl)
          .reverse()
          .map((x) => ({ x, y: wave(x) + hw + o })),
      ];
    }
    case "rows": {
      const rows = Math.max(1, t.rows_count ?? 1);
      const perRow = Math.ceil(n / rows);
      const aisle = t.aisle_cm ?? DEFAULT_AISLE_CM;
      const left = Math.ceil(perRow / 2);
      const seats: Point[] = [];
      for (let r = 0; r < rows && seats.length < n; r++) {
        const y = -hw + ROW_PITCH_CM * (r + 0.5);
        for (let c = 0; c < perRow && seats.length < n; c++) {
          const x = c < left
            ? -hl + ROW_CHAIR_PITCH_CM * (c + 0.5)
            : -hl + ROW_CHAIR_PITCH_CM * left + aisle + ROW_CHAIR_PITCH_CM * (c - left + 0.5);
          seats.push({ x, y });
        }
      }
      return seats;
    }
    case "banquet":
      return banquetRun(t.segments, n).seats;
    case "long": {
      const ends = t.ends_seated && n >= 3 ? 2 : 0;
      const along = n - ends;
      const top = Math.ceil(along / 2);
      const bottom = along - top;
      const seats: Point[] = spread(top, -hl, hl).map((x) => ({ x, y: -hw - o }));
      if (ends) seats.push({ x: hl + o, y: 0 });
      seats.push(...spread(bottom, -hl, hl).reverse().map((x) => ({ x, y: hw + o })));
      if (ends) seats.push({ x: -hl - o, y: 0 });
      return seats;
    }
    case "square": {
      // Fill sides top, right, bottom, left as evenly as possible.
      const base = Math.floor(n / 4);
      const extra = n % 4;
      const per = [0, 1, 2, 3].map((i) => base + (i < extra ? 1 : 0));
      const seats: Point[] = [];
      seats.push(...spread(per[0]!, -hl, hl).map((x) => ({ x, y: -hw - o })));
      seats.push(...spread(per[1]!, -hw, hw).map((y) => ({ x: hl + o, y })));
      seats.push(...spread(per[2]!, -hl, hl).reverse().map((x) => ({ x, y: hw + o })));
      seats.push(...spread(per[3]!, -hw, hw).reverse().map((y) => ({ x: -hl - o, y })));
      return seats;
    }
  }
}

/** Chair centres in room coordinates, or null if the table isn't placed. */
export function seatPositions(t: TableGeometryInput): Point[] | null {
  if (t.pos_x_cm === null || t.pos_y_cm === null) return null;
  const cx = t.pos_x_cm;
  const cy = t.pos_y_cm;
  return localSeatPositions(t).map((p) => {
    const r = rotate(p, t.rotation_deg);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/** A rotated rectangle's corners, clockwise from top-left. */
export function rectCorners(cx: number, cy: number, length: number, width: number, deg: number): Point[] {
  const hl = length / 2;
  const hw = width / 2;
  return [
    { x: -hl, y: -hw },
    { x: hl, y: -hw },
    { x: hl, y: hw },
    { x: -hl, y: hw },
  ].map((p) => {
    const r = rotate(p, deg);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/** A convex polygon for the table's footprint (a 24-gon for a round one). */
export function tablePolygon(t: TableGeometryInput, grow = 0): Point[] | null {
  if (t.pos_x_cm === null || t.pos_y_cm === null) return null;
  const { length, width } = tableSize(t);
  if (t.shape === "round") {
    const r = length / 2 + grow;
    return Array.from({ length: 24 }, (_, i) => {
      const a = (2 * Math.PI * i) / 24;
      return { x: t.pos_x_cm! + r * Math.cos(a), y: t.pos_y_cm! + r * Math.sin(a) };
    });
  }
  if (t.shape === "oval") {
    return Array.from({ length: 24 }, (_, i) => {
      const a = (2 * Math.PI * i) / 24;
      const p = rotate({ x: (length / 2 + grow) * Math.cos(a), y: (width / 2 + grow) * Math.sin(a) }, t.rotation_deg);
      return { x: t.pos_x_cm! + p.x, y: t.pos_y_cm! + p.y };
    });
  }
  return rectCorners(t.pos_x_cm, t.pos_y_cm, length + 2 * grow, width + 2 * grow, t.rotation_deg);
}

export function fixturePolygon(f: RectInput): Point[] {
  return rectCorners(f.pos_x_cm, f.pos_y_cm, f.width_cm, f.depth_cm, f.rotation_deg);
}

function project(poly: Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * axis.x + p.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * Separating-axis test for two convex polygons. Touching edges don't count:
 * two tables pushed end to end are a deliberate long table, not an overlap.
 */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
      const [aMin, aMax] = project(a, axis);
      const [bMin, bMax] = project(b, axis);
      const len = Math.hypot(axis.x, axis.y) || 1;
      if (aMax <= bMin + 0.5 * len || bMax <= aMin + 0.5 * len) return false;
    }
  }
  return true;
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest edge-to-edge distance between two convex polygons; 0 if they overlap. */
export function polygonDistance(a: Point[], b: Point[]): number {
  if (polygonsOverlap(a, b)) return 0;
  let best = Infinity;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const p of from) {
      for (let i = 0; i < to.length; i++) {
        best = Math.min(best, pointSegmentDistance(p, to[i]!, to[(i + 1) % to.length]!));
      }
    }
  }
  return best;
}

/** Snap to a grid step (§C.1: 25 cm by default). */
export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : Math.round(value);
}

/** 0–359, whatever comes in. */
export function normaliseDegrees(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** A sensible default footprint for a new fixture (§C.1). */
export const FIXTURE_DEFAULTS: Record<string, { width: number; depth: number; label: string }> = {
  dance_floor: { width: 500, depth: 500, label: "Dance floor" },
  bar: { width: 300, depth: 80, label: "Bar" },
  band: { width: 400, depth: 250, label: "Band" },
  dj: { width: 200, depth: 100, label: "DJ" },
  stage: { width: 500, depth: 300, label: "Stage" },
  cake: { width: 90, depth: 90, label: "Cake" },
  gifts: { width: 150, depth: 75, label: "Gifts" },
  entrance: { width: 200, depth: 40, label: "Entrance" },
  photo_booth: { width: 250, depth: 250, label: "Photo booth" },
  buffet: { width: 400, depth: 90, label: "Buffet" },
  other: { width: 150, depth: 150, label: "Other" },
  lounge: { width: 300, depth: 200, label: "Lounge" },
  kids_area: { width: 300, depth: 300, label: "Kids' area" },
  floral_arch: { width: 200, depth: 60, label: "Floral arch" },
  garland: { width: 300, depth: 20, label: "Garland" },
  aisle_flowers: { width: 40, depth: 40, label: "Aisle flowers" },
  candles: { width: 60, depth: 20, label: "Candles" },
  plant: { width: 60, depth: 60, label: "Plant" },
  sign: { width: 60, depth: 10, label: "Sign" },
  lantern: { width: 30, depth: 30, label: "Lantern" },
  drape: { width: 300, depth: 15, label: "Drape" },
  marquee: { width: 900, depth: 1500, label: "Marquee" },
  tree: { width: 300, depth: 300, label: "Tree" },
  path: { width: 150, depth: 800, label: "Path" },
  pool: { width: 400, depth: 800, label: "Pool" },
  garden_bed: { width: 300, depth: 120, label: "Garden bed" },
  slope: { width: 500, depth: 500, label: "Slope" },
  custom: { width: 100, depth: 100, label: "Item" },
};

/**
 * Two points on the venue image and the real distance between them → the
 * room's size in centimetres (§C.3). The room box is the image, so its size is
 * the image's pixel size times centimetres-per-pixel. Clamped to the range the
 * database accepts; null for a degenerate measurement.
 */
export function calibrateRoom(
  image: { width: number; height: number },
  a: Point,
  b: Point,
  realCm: number,
): { room_width_cm: number; room_depth_cm: number } | null {
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(px >= 5) || !(realCm > 0) || image.width <= 0 || image.height <= 0) return null;
  const cmPerPx = realCm / px;
  const clamp = (v: number) => Math.min(20000, Math.max(300, Math.round(v)));
  return { room_width_cm: clamp(image.width * cmPerPx), room_depth_cm: clamp(image.height * cmPerPx) };
}
