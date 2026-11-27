/**
 * Snapping to the building (spec 60 C.3): a moving item lines up with the walls, their ends, doors and windows,
 * markers and the edges of areas, and shows how far it is from the nearest wall. Pure.
 *
 * `snapGuides` (canvas.ts) does this for other furniture. These guides are a different colour (the caller draws
 * `source: "building"` in its own), and the distance to a wall is coloured by the walkway thresholds as every other gap is.
 */

import { openingEnds, wallLength, type Drawing, type Wall } from "./drawing";
import type { Box, Guide } from "./canvas";

/** A line of the building an item can line up with: `at` on `axis`, drawn from `from` to `to` along the other axis. */
export type BuildingLine = { axis: "x" | "y"; at: number; from: number; to: number };

const EPS = 1; // a wall within a centimetre of square counts as square

/** A wall that runs straight up and down, or straight across, as a face to line up with. */
function squareWall(w: Wall): { axis: "x" | "y"; at: number; from: number; to: number } | null {
  if (w.bulge) return null;
  const [ax, ay] = w.a;
  const [bx, by] = w.b;
  if (Math.abs(ax - bx) <= EPS) return { axis: "x", at: (ax + bx) / 2, from: Math.min(ay, by), to: Math.max(ay, by) };
  if (Math.abs(ay - by) <= EPS) return { axis: "y", at: (ay + by) / 2, from: Math.min(ax, bx), to: Math.max(ax, bx) };
  return null;
}

/** The lines of the building an item can snap to. */
export function buildingLines(d: Drawing): BuildingLine[] {
  const out: BuildingLine[] = [];
  const point = (x: number, y: number, r = 0) => {
    out.push({ axis: "x", at: x, from: y - r, to: y + r }, { axis: "y", at: y, from: x - r, to: x + r });
  };
  for (const w of d.walls) {
    const sq = squareWall(w);
    if (sq) {
      // Both faces of a straight wall: an item's edge lines up with the face it stands against.
      out.push({ axis: sq.axis, at: sq.at - w.thick / 2, from: sq.from, to: sq.to }, { axis: sq.axis, at: sq.at + w.thick / 2, from: sq.from, to: sq.to });
    }
    // Where a wall ends (an arc's ends, a slanted wall's, a square wall's).
    point(w.a[0], w.a[1]);
    point(w.b[0], w.b[1]);
  }
  for (const o of d.openings) {
    const wall = d.walls.find((w) => w.id === o.wall);
    if (!wall) continue;
    const e = openingEnds(wall, o);
    point(e.centre[0], e.centre[1]);
    point(e.from[0], e.from[1]);
    point(e.to[0], e.to[1]);
  }
  for (const m of d.markers) {
    const r = ((m.rot % 360) * Math.PI) / 180;
    const hw = (Math.abs((m.w / 2) * Math.cos(r)) + Math.abs((m.d / 2) * Math.sin(r)));
    const hh = (Math.abs((m.w / 2) * Math.sin(r)) + Math.abs((m.d / 2) * Math.cos(r)));
    out.push(
      { axis: "x", at: m.x - hw, from: m.y - hh, to: m.y + hh },
      { axis: "x", at: m.x, from: m.y - hh, to: m.y + hh },
      { axis: "x", at: m.x + hw, from: m.y - hh, to: m.y + hh },
      { axis: "y", at: m.y - hh, from: m.x - hw, to: m.x + hw },
      { axis: "y", at: m.y, from: m.x - hw, to: m.x + hw },
      { axis: "y", at: m.y + hh, from: m.x - hw, to: m.x + hw },
    );
  }
  for (const a of d.areas) {
    if (a.points.length === 0) continue;
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // An area's edges, and each of its corners' lines.
    out.push({ axis: "x", at: x0, from: y0, to: y1 }, { axis: "x", at: x1, from: y0, to: y1 }, { axis: "y", at: y0, from: x0, to: x1 }, { axis: "y", at: y1, from: x0, to: x1 });
    for (const [px, py] of a.points) point(px, py);
  }
  return out;
}

export type BuildingSnap = { dx: number; dy: number; x: boolean; y: boolean; guides: BuildingGuide[] };
/** A building guide is drawn like any other, in its own colour. */
export type BuildingGuide = Guide & { source: "building" };

const lo = (a: "x" | "y") => (a === "x" ? "x0" : "y0");
const hi = (a: "x" | "y") => (a === "x" ? "x1" : "y1");

/**
 * How far to nudge the moving outline so its edges or centre line up with the building, and the guides to draw. Each
 * axis is separate and takes the closest line inside `threshold` cm; an axis the furniture already snapped on (`skip`)
 * is left alone. Nothing close: no move, no guides.
 */
export function buildingGuides(moving: Box, lines: BuildingLine[], threshold: number, skip: { x?: boolean; y?: boolean } = {}): BuildingSnap {
  const found: Partial<Record<"x" | "y", { delta: number; line: BuildingLine; kind: "edge" | "centre" }>> = {};
  for (const axis of ["x", "y"] as const) {
    if (skip[axis]) continue;
    const mine: [number, "edge" | "centre"][] = [
      [moving[lo(axis)], "edge"],
      [(moving[lo(axis)] + moving[hi(axis)]) / 2, "centre"],
      [moving[hi(axis)], "edge"],
    ];
    for (const line of lines) {
      if (line.axis !== axis) continue;
      for (const [value, kind] of mine) {
        const delta = line.at - value;
        if (Math.abs(delta) > threshold) continue;
        const best = found[axis];
        // The closest line wins; an edge beats a centre on a tie.
        if (!best || Math.abs(delta) < Math.abs(best.delta) - 1e-9 || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) <= 1e-9 && best.kind === "centre" && kind === "edge")) {
          found[axis] = { delta, line, kind };
        }
      }
    }
  }
  const dx = found.x?.delta ?? 0;
  const dy = found.y?.delta ?? 0;
  const moved: Box = { x0: moving.x0 + dx, y0: moving.y0 + dy, x1: moving.x1 + dx, y1: moving.y1 + dy };
  const guides: BuildingGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const f = found[axis];
    if (!f) continue;
    const other = axis === "x" ? "y" : "x";
    guides.push({
      axis,
      at: f.line.at,
      from: Math.min(f.line.from, moved[lo(other)]),
      to: Math.max(f.line.to, moved[hi(other)]),
      kind: f.kind,
      source: "building",
    });
  }
  return { dx, dy, x: found.x !== undefined, y: found.y !== undefined, guides };
}

/**
 * The distance from the moving outline to the nearest straight wall on each side that it faces, as spacing guides to
 * draw (the caller colours them by the walkway thresholds). Only walls within `reachCm` are shown, so a room full of
 * walls does not draw a ruler to every one.
 */
export function wallGaps(moving: Box, d: Drawing, reachCm = 300): BuildingGuide[] {
  const out: BuildingGuide[] = [];
  const sides: { axis: "x" | "y"; dir: 1 | -1 }[] = [
    { axis: "x", dir: -1 },
    { axis: "x", dir: 1 },
    { axis: "y", dir: -1 },
    { axis: "y", dir: 1 },
  ];
  for (const { axis, dir } of sides) {
    const other = axis === "x" ? "y" : "x";
    let best: { gap: number; at: number; mid: number } | null = null;
    for (const w of d.walls) {
      const sq = squareWall(w);
      if (!sq || sq.axis !== axis || wallLength(w) <= 0) continue;
      // The wall must face the outline: share some of its extent along the other axis.
      const from = Math.max(sq.from, moving[lo(other)]);
      const to = Math.min(sq.to, moving[hi(other)]);
      if (to - from <= 0) continue;
      // The wall's near face, on the side the outline is looking.
      const face = dir === 1 ? sq.at - w.thick / 2 : sq.at + w.thick / 2;
      const edge = dir === 1 ? moving[hi(axis)] : moving[lo(axis)];
      const gap = dir === 1 ? face - edge : edge - face;
      if (gap < 0 || gap > reachCm) continue;
      if (!best || gap < best.gap) best = { gap, at: face, mid: (from + to) / 2 };
    }
    if (best) {
      const edge = dir === 1 ? moving[hi(axis)] : moving[lo(axis)];
      // A spacing guide runs along `axis`, drawn at `mid` on the other axis (`axis: other` in canvas.ts's convention).
      out.push({ axis: other, at: best.mid, from: Math.min(edge, best.at), to: Math.max(edge, best.at), kind: "spacing", gap: Math.round(best.gap), source: "building" });
    }
  }
  return out;
}
