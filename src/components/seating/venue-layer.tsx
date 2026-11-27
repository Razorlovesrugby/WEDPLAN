import type { PointerEvent as RPointerEvent } from "react";
import {
  formatLength,
  openingEnds,
  polygonArea,
  polygonCentre,
  wallLength,
  wallPath,
  wallPoint,
  type Drawing,
  type Marker,
  type Opening,
  type Wall,
} from "@/lib/seating/drawing";

/** What the pointer can pick in the venue's drawing. */
export type DrawingPick = { kind: "wall" | "opening" | "marker" | "area" | "label" | "dimension"; id: string };

const WALL = "#4a4540";
const PICK = "#b0532b";
const PAPER = "#ffffff";

/**
 * The venue's drawing (spec 57 Part B) in room centimetres: areas, walls,
 * doors and windows, markers, text and kept dimensions. Pure SVG, so it can be
 * drawn on the screen, in a print and in a test. `unit` is how many room
 * centimetres a screen pixel is, so lines and text stay readable at any zoom.
 * With `onPick`, each item can be picked (the Select tool).
 */
export function VenueLayer({
  drawing,
  unit,
  selected = null,
  onPick,
}: {
  drawing: Drawing;
  unit: number;
  selected?: DrawingPick | null;
  onPick?: (pick: DrawingPick, e: RPointerEvent) => void;
}) {
  const is = (kind: DrawingPick["kind"], id: string) => selected?.kind === kind && selected.id === id;
  const pick = (kind: DrawingPick["kind"], id: string) =>
    onPick
      ? { onPointerDown: (e: RPointerEvent) => onPick({ kind, id }, e), style: { cursor: "pointer" } as const }
      : { style: { pointerEvents: "none" } as const };
  const wallById = new Map(drawing.walls.map((w) => [w.id, w]));

  return (
    <g aria-label="Venue drawing">
      <defs>
        <pattern id="venue-hatch" width={12 * unit} height={12 * unit} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={12 * unit} stroke="#7a9a68" strokeWidth={2 * unit} />
        </pattern>
      </defs>

      {drawing.areas.map((a) => {
        const centre = polygonCentre(a.points);
        const tint = a.tint ?? (a.outdoor ? "#cfe3c4" : "#e6dff0");
        return (
          <g key={a.id} {...pick("area", a.id)}>
            <polygon
              points={a.points.map((p) => p.join(",")).join(" ")}
              fill={tint}
              fillOpacity={0.45}
              stroke={is("area", a.id) ? PICK : "#9a948b"}
              strokeWidth={(is("area", a.id) ? 3 : 1.5) * unit}
              strokeDasharray={`${6 * unit} ${4 * unit}`}
            />
            {a.outdoor ? <polygon points={a.points.map((p) => p.join(",")).join(" ")} fill="url(#venue-hatch)" fillOpacity={0.5} style={{ pointerEvents: "none" }} /> : null}
            <text x={centre[0]} y={centre[1]} textAnchor="middle" fontSize={14 * unit} fill="#5a554f" style={{ pointerEvents: "none" }}>
              {a.name}
              <tspan x={centre[0]} dy={16 * unit} fontSize={12 * unit} fill="#8a8580">
                {(polygonArea(a.points) / 10_000).toFixed(1)} m²
              </tspan>
            </text>
          </g>
        );
      })}

      {drawing.walls.map((w) => (
        <g key={w.id}>
          <path
            d={wallPath(w)}
            fill="none"
            stroke={is("wall", w.id) ? PICK : WALL}
            strokeWidth={w.thick}
            strokeLinecap="square"
            style={{ pointerEvents: "none" }}
          />
          {onPick ? (
            // A wider, invisible stroke so a thin wall can be picked.
            <path d={wallPath(w)} fill="none" stroke="transparent" strokeWidth={Math.max(w.thick, 18 * unit)} {...pick("wall", w.id)} />
          ) : null}
        </g>
      ))}

      {drawing.openings.map((o) => {
        const wall = wallById.get(o.wall);
        return wall ? <OpeningShape key={o.id} wall={wall} opening={o} selected={is("opening", o.id)} unit={unit} pick={pick("opening", o.id)} /> : null;
      })}

      {drawing.markers.map((m) => (
        <MarkerShape key={m.id} marker={m} selected={is("marker", m.id)} unit={unit} pick={pick("marker", m.id)} />
      ))}

      {drawing.dimensions.map((d) => {
        const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
        const mid = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2] as const;
        return (
          <g key={d.id} {...pick("dimension", d.id)}>
            <line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke={is("dimension", d.id) ? PICK : "#1d6fa5"} strokeWidth={2 * unit} strokeDasharray={`${8 * unit} ${5 * unit}`} />
            {[d.a, d.b].map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={4 * unit} fill="#1d6fa5" />
            ))}
            <text x={mid[0]} y={mid[1] - 8 * unit} textAnchor="middle" fontSize={13 * unit} fill="#1d6fa5" stroke={PAPER} strokeWidth={4 * unit} paintOrder="stroke">
              {formatLength(len)}
            </text>
          </g>
        );
      })}

      {drawing.labels.map((l) => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          fontSize={l.size * unit}
          fill={is("label", l.id) ? PICK : "#2f2b27"}
          stroke={PAPER}
          strokeWidth={3 * unit}
          paintOrder="stroke"
          dominantBaseline="middle"
          {...pick("label", l.id)}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

function OpeningShape({
  wall,
  opening: o,
  selected,
  unit,
  pick,
}: {
  wall: Wall;
  opening: Opening;
  selected: boolean;
  unit: number;
  pick: Record<string, unknown>;
}) {
  const { from, to, centre, angle } = openingEnds(wall, o);
  const colour = selected ? PICK : WALL;
  // The wall's own gap, drawn in the paper's colour over it.
  const gap = <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={PAPER} strokeWidth={wall.thick + 2} />;
  const rad = (angle * Math.PI) / 180;
  // Left of the wall's direction is "in", the other side "out".
  const side = o.swing === "in" ? 1 : -1;
  const n: [number, number] = [-Math.sin(rad) * side, Math.cos(rad) * side];
  const hinge = o.hinge === "a" ? from : to;
  const free = o.hinge === "a" ? to : from;

  let symbol: React.ReactNode = null;
  if (o.kind === "door") {
    const w = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const open: [number, number] = [hinge[0] + n[0] * w, hinge[1] + n[1] * w];
    const cross = (free[0] - hinge[0]) * (open[1] - hinge[1]) - (free[1] - hinge[1]) * (open[0] - hinge[0]);
    symbol = (
      <>
        <line x1={hinge[0]} y1={hinge[1]} x2={open[0]} y2={open[1]} stroke={colour} strokeWidth={3 * unit} />
        <path d={`M ${free[0]} ${free[1]} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${open[0]} ${open[1]}`} fill="none" stroke={colour} strokeWidth={1.5 * unit} strokeDasharray={`${5 * unit} ${4 * unit}`} />
      </>
    );
  } else if (o.kind === "double_door") {
    const w = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2;
    const leaf = (h: readonly [number, number], f: readonly [number, number]) => {
      const open: [number, number] = [h[0] + n[0] * w, h[1] + n[1] * w];
      const cross = (f[0] - h[0]) * (open[1] - h[1]) - (f[1] - h[1]) * (open[0] - h[0]);
      return (
        <g key={`${h[0]},${h[1]}`}>
          <line x1={h[0]} y1={h[1]} x2={open[0]} y2={open[1]} stroke={colour} strokeWidth={3 * unit} />
          <path d={`M ${f[0]} ${f[1]} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${open[0]} ${open[1]}`} fill="none" stroke={colour} strokeWidth={1.5 * unit} strokeDasharray={`${5 * unit} ${4 * unit}`} />
        </g>
      );
    };
    symbol = (
      <>
        {leaf(from, centre)}
        {leaf(to, centre)}
      </>
    );
  } else if (o.kind === "window") {
    const off = (wall.thick / 4) * 1;
    const shift = (k: number) => [n[0] * off * k, n[1] * off * k] as const;
    const [s1, s2] = [shift(1), shift(-1)];
    symbol = (
      <>
        <line x1={from[0] + s1[0]} y1={from[1] + s1[1]} x2={to[0] + s1[0]} y2={to[1] + s1[1]} stroke={colour} strokeWidth={1.5 * unit} />
        <line x1={from[0] + s2[0]} y1={from[1] + s2[1]} x2={to[0] + s2[0]} y2={to[1] + s2[1]} stroke={colour} strokeWidth={1.5 * unit} />
      </>
    );
  } else {
    symbol = <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={colour} strokeWidth={1.5 * unit} strokeDasharray={`${6 * unit} ${5 * unit}`} />;
  }

  return (
    <g>
      {gap}
      {symbol}
      {/* A wider target to pick or drag it by. */}
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="transparent" strokeWidth={Math.max(wall.thick, 18 * unit)} {...pick} />
    </g>
  );
}

const MARKER_GLYPH: Record<Marker["kind"], string> = { column: "", stairs: "", power: "⚡", fire_exit: "EXIT", toilets: "WC" };

function MarkerShape({
  marker: m,
  selected,
  unit,
  pick,
}: {
  marker: Marker;
  selected: boolean;
  unit: number;
  pick: Record<string, unknown>;
}) {
  const stroke = selected ? PICK : WALL;
  const fill = m.kind === "column" ? WALL : m.kind === "fire_exit" ? "#2f7d4f" : m.kind === "toilets" ? "#e2dfe9" : m.kind === "power" ? "#f5e6a8" : "#ece9e3";
  return (
    <g transform={`translate(${m.x} ${m.y}) rotate(${m.rot})`} {...pick}>
      <rect x={-m.w / 2} y={-m.d / 2} width={m.w} height={m.d} fill={fill} stroke={stroke} strokeWidth={(selected ? 3 : 1.5) * unit} />
      {m.kind === "stairs"
        ? Array.from({ length: Math.max(2, Math.floor(m.d / 25)) }, (_, i) => {
            const steps = Math.max(2, Math.floor(m.d / 25));
            const y = -m.d / 2 + ((i + 1) * m.d) / (steps + 1);
            return <line key={i} x1={-m.w / 2} y1={y} x2={m.w / 2} y2={y} stroke={stroke} strokeWidth={unit} />;
          })
        : null}
      {MARKER_GLYPH[m.kind] ? (
        <text transform={`rotate(${-m.rot})`} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(Math.min(m.w, m.d) * 0.45, 22 * unit * 1.6)} fill={m.kind === "fire_exit" ? "#ffffff" : "#2f2b27"} style={{ pointerEvents: "none" }}>
          {MARKER_GLYPH[m.kind]}
        </text>
      ) : null}
    </g>
  );
}

/** A wall being drawn: the segment, and its length and angle beside it. */
export function WallPreview({ from, to, bulge = 0, unit }: { from: [number, number]; to: [number, number]; bulge?: number; unit: number }) {
  const w = { a: from, b: to, bulge };
  const mid = wallPoint(w, 0.5);
  const len = wallLength(w);
  const angle = Math.round((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI);
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={wallPath(w)} fill="none" stroke={PICK} strokeWidth={20} strokeOpacity={0.45} strokeLinecap="square" />
      <circle cx={from[0]} cy={from[1]} r={5 * unit} fill={PICK} />
      <text x={mid.x} y={mid.y - 18 * unit} textAnchor="middle" fontSize={13 * unit} fill={PICK} stroke={PAPER} strokeWidth={4 * unit} paintOrder="stroke">
        {formatLength(len)} · {angle}°
      </text>
    </g>
  );
}
