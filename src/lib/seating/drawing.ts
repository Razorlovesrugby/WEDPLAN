/**
 * The venue drawing (spec 57 Part B): walls, arcs, doors and windows,
 * markers, areas, labels and kept dimensions, in room centimetres. It lives
 * in one jsonb column per space, so it is validated here before every write
 * (the database only bounds the type and the size). Pure.
 */

export type Pt = [number, number];

/** A wall from `a` to `b`. `bulge` bends it into an arc: the sideways distance (cm) of the middle from the chord, signed; 0 or absent is straight. */
export type Wall = { id: string; a: Pt; b: Pt; thick: number; bulge: number };

export const OPENING_KINDS = ["door", "double_door", "window", "opening"] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];
/** Sits on a wall: `at` is how far along it (0 to 1), `width` in cm. A door also opens `in` or `out` of the room, hinged at the wall's `a` or `b` end. */
export type Opening = { id: string; kind: OpeningKind; wall: string; at: number; width: number; swing: "in" | "out"; hinge: "a" | "b" };

export const MARKER_KINDS = ["column", "stairs", "power", "fire_exit", "toilets"] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];
export type Marker = { id: string; kind: MarkerKind; x: number; y: number; w: number; d: number; rot: number };

export type Area = { id: string; name: string; points: Pt[]; tint: string | null; outdoor: boolean };
export type Label = { id: string; text: string; x: number; y: number; size: number };
export type Dimension = { id: string; a: Pt; b: Pt };

export type Drawing = {
  walls: Wall[];
  openings: Opening[];
  markers: Marker[];
  areas: Area[];
  labels: Label[];
  dimensions: Dimension[];
};

export const LIMITS = {
  walls: 400,
  openings: 200,
  markers: 200,
  areas: 60,
  areaPoints: 60,
  labels: 100,
  dimensions: 100,
  coord: 100_000,
  thick: { min: 5, max: 100, default: 20 },
  openingWidth: { min: 40, max: 1000 },
  labelText: 120,
  labelSize: { min: 12, max: 48, default: 16 },
  areaName: 60,
} as const;

export function emptyDrawing(): Drawing {
  return { walls: [], openings: [], markers: [], areas: [], labels: [], dimensions: [] };
}

export type ParseResult = { ok: true; drawing: Drawing } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function pt(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const x = num(v[0]);
  const y = num(v[1]);
  if (x === null || y === null || Math.abs(x) > LIMITS.coord || Math.abs(y) > LIMITS.coord) return null;
  return [Math.round(x), Math.round(y)];
}

function id(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null;
}

/**
 * Reads whatever was stored or sent and returns a clean drawing, or says what
 * is wrong. An absent or `{}` drawing is an empty one. Unknown keys are
 * dropped; out-of-range sizes are clamped; a broken item, a repeated id or a
 * door on a wall that isn't there is an error, not a silent repair.
 */
export function parseDrawing(raw: unknown): ParseResult {
  if (raw === null || raw === undefined) return { ok: true, drawing: emptyDrawing() };
  if (!isObj(raw)) return { ok: false, error: "The drawing isn't an object." };
  const list = (key: keyof Drawing, max: number): unknown[] | string => {
    const v = raw[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) return `"${key}" isn't a list.`;
    if (v.length > max) return `Too many ${key} (at most ${max}).`;
    return v;
  };
  const seen = new Set<string>();
  const uniq = (v: string): boolean => {
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  };

  const out = emptyDrawing();

  const walls = list("walls", LIMITS.walls);
  if (typeof walls === "string") return { ok: false, error: walls };
  for (const w of walls) {
    if (!isObj(w)) return { ok: false, error: "A wall isn't an object." };
    const wid = id(w.id);
    const a = pt(w.a);
    const b = pt(w.b);
    if (!wid || !a || !b) return { ok: false, error: "A wall needs an id and two corners." };
    if (!uniq(wid)) return { ok: false, error: `Two items share the id ${wid}.` };
    if (a[0] === b[0] && a[1] === b[1]) return { ok: false, error: "A wall can't start and end at the same point." };
    const thick = clamp(num(w.thick) ?? LIMITS.thick.default, LIMITS.thick.min, LIMITS.thick.max);
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bulge = clamp(Math.round(num(w.bulge) ?? 0), -chord, chord);
    out.walls.push({ id: wid, a, b, thick: Math.round(thick), bulge });
  }
  const wallIds = new Set(out.walls.map((w) => w.id));

  const openings = list("openings", LIMITS.openings);
  if (typeof openings === "string") return { ok: false, error: openings };
  for (const o of openings) {
    if (!isObj(o)) return { ok: false, error: "A door or window isn't an object." };
    const oid = id(o.id);
    const kind = (OPENING_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as OpeningKind) : null;
    const wall = id(o.wall);
    if (!oid || !kind || !wall) return { ok: false, error: "A door or window needs an id, a kind and a wall." };
    if (!wallIds.has(wall)) return { ok: false, error: "A door or window is on a wall that isn't there." };
    if (!uniq(oid)) return { ok: false, error: `Two items share the id ${oid}.` };
    const width = clamp(Math.round(num(o.width) ?? (kind === "double_door" ? 180 : 90)), LIMITS.openingWidth.min, LIMITS.openingWidth.max);
    out.openings.push({
      id: oid,
      kind,
      wall,
      at: clamp(num(o.at) ?? 0.5, 0, 1),
      width,
      swing: o.swing === "out" ? "out" : "in",
      hinge: o.hinge === "b" ? "b" : "a",
    });
  }

  const markers = list("markers", LIMITS.markers);
  if (typeof markers === "string") return { ok: false, error: markers };
  for (const m of markers) {
    if (!isObj(m)) return { ok: false, error: "A marker isn't an object." };
    const mid = id(m.id);
    const kind = (MARKER_KINDS as readonly unknown[]).includes(m.kind) ? (m.kind as MarkerKind) : null;
    const x = num(m.x);
    const y = num(m.y);
    if (!mid || !kind || x === null || y === null || Math.abs(x) > LIMITS.coord || Math.abs(y) > LIMITS.coord) {
      return { ok: false, error: "A marker needs an id, a kind and a position." };
    }
    if (!uniq(mid)) return { ok: false, error: `Two items share the id ${mid}.` };
    out.markers.push({
      id: mid,
      kind,
      x: Math.round(x),
      y: Math.round(y),
      w: clamp(Math.round(num(m.w) ?? 40), 10, 2000),
      d: clamp(Math.round(num(m.d) ?? 40), 10, 2000),
      rot: ((Math.round(num(m.rot) ?? 0) % 360) + 360) % 360,
    });
  }

  const areas = list("areas", LIMITS.areas);
  if (typeof areas === "string") return { ok: false, error: areas };
  for (const ar of areas) {
    if (!isObj(ar)) return { ok: false, error: "An area isn't an object." };
    const aid = id(ar.id);
    const name = typeof ar.name === "string" ? ar.name.trim() : "";
    if (!aid || !name || name.length > LIMITS.areaName) return { ok: false, error: `An area needs an id and a name of up to ${LIMITS.areaName} characters.` };
    if (!Array.isArray(ar.points) || ar.points.length < 3 || ar.points.length > LIMITS.areaPoints) {
      return { ok: false, error: `The area "${name}" needs 3 to ${LIMITS.areaPoints} corners.` };
    }
    const points: Pt[] = [];
    for (const p of ar.points) {
      const q = pt(p);
      if (!q) return { ok: false, error: `The area "${name}" has a corner that isn't a point.` };
      points.push(q);
    }
    if (!uniq(aid)) return { ok: false, error: `Two items share the id ${aid}.` };
    out.areas.push({
      id: aid,
      name,
      points,
      tint: typeof ar.tint === "string" && /^#[0-9a-fA-F]{6}$/.test(ar.tint) ? ar.tint : null,
      outdoor: ar.outdoor === true,
    });
  }

  const labels = list("labels", LIMITS.labels);
  if (typeof labels === "string") return { ok: false, error: labels };
  for (const l of labels) {
    if (!isObj(l)) return { ok: false, error: "A label isn't an object." };
    const lid = id(l.id);
    const text = typeof l.text === "string" ? l.text.trim() : "";
    const x = num(l.x);
    const y = num(l.y);
    if (!lid || !text || text.length > LIMITS.labelText || x === null || y === null) {
      return { ok: false, error: `A label needs an id, text of up to ${LIMITS.labelText} characters and a position.` };
    }
    if (!uniq(lid)) return { ok: false, error: `Two items share the id ${lid}.` };
    out.labels.push({
      id: lid,
      text,
      x: Math.round(clamp(x, -LIMITS.coord, LIMITS.coord)),
      y: Math.round(clamp(y, -LIMITS.coord, LIMITS.coord)),
      size: clamp(Math.round(num(l.size) ?? LIMITS.labelSize.default), LIMITS.labelSize.min, LIMITS.labelSize.max),
    });
  }

  const dimensions = list("dimensions", LIMITS.dimensions);
  if (typeof dimensions === "string") return { ok: false, error: dimensions };
  for (const d of dimensions) {
    if (!isObj(d)) return { ok: false, error: "A dimension isn't an object." };
    const did = id(d.id);
    const a = pt(d.a);
    const b = pt(d.b);
    if (!did || !a || !b) return { ok: false, error: "A dimension needs an id and two points." };
    if (!uniq(did)) return { ok: false, error: `Two items share the id ${did}.` };
    out.dimensions.push({ id: did, a, b });
  }

  return { ok: true, drawing: out };
}

/** A wall's length in cm: the chord, or the arc when it bulges. */
export function wallLength(w: Pick<Wall, "a" | "b" | "bulge">): number {
  const chord = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const h = Math.abs(w.bulge);
  if (h < 1 || chord === 0) return chord;
  // Circular arc through the chord's ends and a point h off its middle.
  const r = (chord * chord) / (8 * h) + h / 2;
  const theta = 2 * Math.asin(Math.min(1, chord / (2 * r)));
  const full = h > chord / 2 ? 2 * Math.PI - theta : theta;
  return r * full;
}

/** A wall's radius in cm, or null when it's straight. */
export function wallRadius(w: Pick<Wall, "a" | "b" | "bulge">): number | null {
  const chord = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const h = Math.abs(w.bulge);
  if (h < 1 || chord === 0) return null;
  return (chord * chord) / (8 * h) + h / 2;
}

/** The smallest box round every wall corner and every arc's middle, or null with no walls. */
export function wallBounds(walls: readonly Wall[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (walls.length === 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of walls) {
    xs.push(w.a[0], w.b[0]);
    ys.push(w.a[1], w.b[1]);
    if (Math.abs(w.bulge) >= 1) {
      const mx = (w.a[0] + w.b[0]) / 2;
      const my = (w.a[1] + w.b[1]) / 2;
      const dx = w.b[0] - w.a[0];
      const dy = w.b[1] - w.a[1];
      const len = Math.hypot(dx, dy) || 1;
      xs.push(mx + (-dy / len) * w.bulge);
      ys.push(my + (dx / len) * w.bulge);
    }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Area in square centimetres (shoelace). */
export function polygonArea(points: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Snaps a wall end to the nearest existing corner within `within` cm, else to the grid. */
export function snapCorner(p: Pt, walls: readonly Wall[], grid: number, within = 20): Pt {
  let best: Pt | null = null;
  let bestD = within;
  for (const w of walls) {
    for (const c of [w.a, w.b]) {
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  if (best) return [best[0], best[1]];
  return grid > 0 ? [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid] : [Math.round(p[0]), Math.round(p[1])];
}

/** Constrains `to` so the line from `from` runs at 0, 45 or 90 degrees (the Shift key). */
export function constrainAngle(from: Pt, to: Pt): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return to;
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return [Math.round(from[0] + len * Math.cos(a)), Math.round(from[1] + len * Math.sin(a))];
}

/** A length in metres to two places ("6.60 m"); under a metre in cm ("85 cm"). Spec 57 is metric only. */
export function formatLength(cm: number): string {
  if (cm < 100) return `${Math.round(cm)} cm`;
  return `${(cm / 100).toFixed(2).replace(/\.?0+$/, "")} m`;
}
