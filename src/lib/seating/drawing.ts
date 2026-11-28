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
/**
 * A short note pinned on the plan for the suppliers (spec 59 Part E): "Flowers hang from this beam". `vendor_ids` names the
 * vendors it is for (none: everyone). With a `table_id`, `x` and `y` are an offset in cm from that table's centre, so the note
 * moves with the table; without one they are a place in the room.
 */
export type Note = { id: string; x: number; y: number; text: string; vendor_ids: string[]; table_id: string | null };

export type Drawing = {
  walls: Wall[];
  openings: Opening[];
  markers: Marker[];
  areas: Area[];
  labels: Label[];
  dimensions: Dimension[];
  notes: Note[];
};

export const LIMITS = {
  walls: 400,
  openings: 200,
  markers: 200,
  areas: 60,
  areaPoints: 60,
  labels: 100,
  dimensions: 100,
  notes: 100,
  noteText: 280,
  noteVendors: 10,
  coord: 100_000,
  thick: { min: 5, max: 100, default: 20 },
  openingWidth: { min: 40, max: 1000 },
  labelText: 120,
  labelSize: { min: 12, max: 48, default: 16 },
  areaName: 60,
} as const;

export function emptyDrawing(): Drawing {
  return { walls: [], openings: [], markers: [], areas: [], labels: [], dimensions: [], notes: [] };
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

  // Notes (spec 59 Part E): a drawing saved before them has none.
  const notes = list("notes", LIMITS.notes);
  if (typeof notes === "string") return { ok: false, error: notes };
  for (const n of notes) {
    if (!isObj(n)) return { ok: false, error: "A note isn't an object." };
    const nid = id(n.id);
    const text = typeof n.text === "string" ? n.text.trim() : "";
    const x = num(n.x);
    const y = num(n.y);
    if (!nid || !text || text.length > LIMITS.noteText || x === null || y === null) {
      return { ok: false, error: `A note needs an id, text of up to ${LIMITS.noteText} characters and a place.` };
    }
    if (!uniq(nid)) return { ok: false, error: `Two items share the id ${nid}.` };
    const vendors = Array.isArray(n.vendor_ids) ? [...new Set(n.vendor_ids.filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))].slice(0, LIMITS.noteVendors) : [];
    const tableId = id(n.table_id);
    out.notes.push({ id: nid, text, x: Math.round(clamp(x, -LIMITS.coord, LIMITS.coord)), y: Math.round(clamp(y, -LIMITS.coord, LIMITS.coord)), vendor_ids: vendors, table_id: tableId });
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

// ---------------------------------------------------------------------------
// Walls as geometry: arcs, points along a wall, the nearest wall, splitting
// ---------------------------------------------------------------------------

type Arc = { cx: number; cy: number; r: number; a0: number; span: number; dir: 1 | -1 };

/** The circle a bulging wall lies on, or null when it is straight. Angles are `atan2` in room coordinates (y down). */
function arcOf(w: Pick<Wall, "a" | "b" | "bulge">): Arc | null {
  const r = wallRadius(w);
  if (r === null) return null;
  const dx = w.b[0] - w.a[0];
  const dy = w.b[1] - w.a[1];
  const chord = Math.hypot(dx, dy);
  const nx = -dy / chord;
  const ny = dx / chord;
  const mx = (w.a[0] + w.b[0]) / 2;
  const my = (w.a[1] + w.b[1]) / 2;
  // The arc's middle is `bulge` off the chord along the normal; the centre is on the other side of it.
  const px = mx + nx * w.bulge;
  const py = my + ny * w.bulge;
  const cx = mx + nx * (w.bulge - Math.sign(w.bulge) * r);
  const cy = my + ny * (w.bulge - Math.sign(w.bulge) * r);
  const cross = (w.a[0] - cx) * (py - cy) - (w.a[1] - cy) * (px - cx);
  return { cx, cy, r, a0: Math.atan2(w.a[1] - cy, w.a[0] - cx), span: wallLength(w) / r, dir: cross >= 0 ? 1 : -1 };
}

/** The point `t` (0 to 1) of the way along a wall, and the direction it runs there, in degrees. */
export function wallPoint(w: Pick<Wall, "a" | "b" | "bulge">, t: number): { x: number; y: number; angle: number } {
  const k = Math.min(1, Math.max(0, t));
  const arc = arcOf(w);
  if (!arc) {
    return {
      x: w.a[0] + (w.b[0] - w.a[0]) * k,
      y: w.a[1] + (w.b[1] - w.a[1]) * k,
      angle: (Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]) * 180) / Math.PI,
    };
  }
  const theta = arc.a0 + arc.dir * arc.span * k;
  return {
    x: arc.cx + arc.r * Math.cos(theta),
    y: arc.cy + arc.r * Math.sin(theta),
    angle: ((theta + (arc.dir * Math.PI) / 2) * 180) / Math.PI,
  };
}

/** An SVG path along a wall's centre line: a straight line, or an arc. */
export function wallPath(w: Pick<Wall, "a" | "b" | "bulge">): string {
  const arc = arcOf(w);
  if (!arc) return `M ${w.a[0]} ${w.a[1]} L ${w.b[0]} ${w.b[1]}`;
  const chord = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const large = Math.abs(w.bulge) > chord / 2 ? 1 : 0;
  return `M ${w.a[0]} ${w.a[1]} A ${arc.r.toFixed(1)} ${arc.r.toFixed(1)} 0 ${large} ${arc.dir > 0 ? 1 : 0} ${w.b[0]} ${w.b[1]}`;
}

/** How far (signed, cm) `p` is from the chord a→b, on the side a bulge of that sign bends towards: what dragging a curve's middle sets. */
export function bulgeFromPoint(a: Pt, b: Pt, p: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const d = ((p[0] - a[0]) * -dy + (p[1] - a[1]) * dx) / len;
  // A bulge past a full circle's width has no arc; a hair's breadth is straight.
  const limited = Math.max(-len * 2, Math.min(len * 2, d));
  return Math.abs(limited) < 1 ? 0 : Math.round(limited);
}

/** The wall nearest `p` within `within` cm, with how far along it (0 to 1) the nearest point is. */
export function nearestOnWall(
  walls: readonly Wall[],
  p: Pt,
  within: number,
): { wall: Wall; t: number; x: number; y: number; dist: number } | null {
  let best: { wall: Wall; t: number; x: number; y: number; dist: number } | null = null;
  for (const wall of walls) {
    const arc = arcOf(wall);
    let t: number;
    if (!arc) {
      const dx = wall.b[0] - wall.a[0];
      const dy = wall.b[1] - wall.a[1];
      const len2 = dx * dx + dy * dy;
      t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - wall.a[0]) * dx + (p[1] - wall.a[1]) * dy) / len2));
    } else {
      const phi = Math.atan2(p[1] - arc.cy, p[0] - arc.cx);
      const TAU = Math.PI * 2;
      const along = (((phi - arc.a0) * arc.dir) % TAU + TAU) % TAU;
      // Past the end of the arc: whichever end is nearer in angle.
      t = along <= arc.span ? along / arc.span : along - arc.span < TAU - along ? 1 : 0;
    }
    const at = wallPoint(wall, t);
    const dist = Math.hypot(p[0] - at.x, p[1] - at.y);
    if (dist <= within && (!best || dist < best.dist)) best = { wall, t, x: at.x, y: at.y, dist };
  }
  return best;
}

/**
 * Splits a wall in the middle into two that carry on from each other, handing
 * its openings to whichever half they now sit on. The second half gets
 * `newId`. A curve splits into two curves of the same circle.
 */
export function splitWall(d: Drawing, wallId: string, newId: string): Drawing {
  const w = d.walls.find((x) => x.id === wallId);
  if (!w || d.walls.some((x) => x.id === newId)) return d;
  const mid = wallPoint(w, 0.5);
  const m: Pt = [Math.round(mid.x), Math.round(mid.y)];
  let bulge = 0;
  const r = wallRadius(w);
  if (r !== null) {
    const half = wallLength(w) / r / 4;
    bulge = Math.sign(w.bulge) * Math.round(r * (1 - Math.cos(half)));
  }
  const first: Wall = { ...w, b: m, bulge };
  const second: Wall = { ...w, id: newId, a: m, bulge };
  return {
    ...d,
    walls: d.walls.flatMap((x) => (x.id === wallId ? [first, second] : [x])),
    openings: d.openings.map((o) => {
      if (o.wall !== wallId) return o;
      return o.at < 0.5 ? { ...o, at: o.at * 2 } : { ...o, wall: newId, at: o.at * 2 - 1, hinge: o.hinge };
    }),
  };
}

/** The drawing without a wall, and without the doors and windows that were on it. */
export function removeWall(d: Drawing, wallId: string): Drawing {
  return { ...d, walls: d.walls.filter((w) => w.id !== wallId), openings: d.openings.filter((o) => o.wall !== wallId) };
}

/** A door or window's two ends along its wall, as room points, for drawing its gap. */
export function openingEnds(w: Pick<Wall, "a" | "b" | "bulge">, o: Pick<Opening, "at" | "width">): { from: Pt; to: Pt; centre: Pt; angle: number } {
  const len = wallLength(w) || 1;
  const half = o.width / 2 / len;
  const c = wallPoint(w, o.at);
  const f = wallPoint(w, Math.max(0, o.at - half));
  const t = wallPoint(w, Math.min(1, o.at + half));
  return { from: [f.x, f.y], to: [t.x, t.y], centre: [c.x, c.y], angle: c.angle };
}

/** A fresh id for a drawing item: a short random run of letters and digits. */
export function newDrawingId(prefix: string, taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (let i = 0; i < 20; i++) {
    const id = `${prefix}${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
    if (!taken.has(id)) return id;
  }
  return `${prefix}${taken.size + 1}`;
}

/** Every id in use in a drawing, for `newDrawingId`. */
export function drawingIds(d: Drawing): Set<string> {
  return new Set([...d.walls, ...d.openings, ...d.markers, ...d.areas, ...d.labels, ...d.dimensions, ...d.notes].map((x) => x.id));
}

/** The bounding box of an area's points, for placing its name. */
export function polygonCentre(points: readonly Pt[]): Pt {
  if (points.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}
