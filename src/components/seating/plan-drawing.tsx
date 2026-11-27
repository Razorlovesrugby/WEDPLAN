import { FIXTURE_DEFAULTS, banquetPieces, rowBlocks, seatPositions, serpentinePath, tableSize } from "@/lib/seating/geometry";
import { parseDrawing, emptyDrawing, formatLength } from "@/lib/seating/drawing";
import { fixtureGroup } from "@/lib/seating/library";
import type { SeatingFixture, SeatingTable } from "@/lib/seating/model";
import type { SeatingCustomItemRow, SeatingMarqueeRow, SeatingSpaceRow } from "@/lib/types/database";
import { VenueLayer } from "./venue-layer";

/** What one chair shows on a printed plan. */
export type PlanSeat = { label: string; colour: string | null; allergy: boolean; dot: boolean };

export type PlanOptions = {
  /** Walls, doors, windows, markers, areas, kept dimensions. */
  venue: boolean;
  furniture: boolean;
  decor: boolean;
  /** `numbered`: every chair carries its number, coloured when `seats` says so; `none`: no chairs. */
  chairs: "none" | "numbered";
  /** Chair index by table id: who sits there, for the caterer's plan. Absent means "don't say". */
  seats?: ReadonlyMap<string, ReadonlyMap<number, PlanSeat>>;
  /** A tag drawn on each table: its label, with `seated/capacity` or the number of chairs. */
  tableText: "label" | "label_count" | "label_capacity";
  /** Florist: décor items numbered 1, 2, 3… and tables' centres marked. */
  numberDecor?: boolean;
  /** Hire: furniture pieces marked with a letter. */
  markFurniture?: boolean;
  seatedAt?: ReadonlyMap<string, number>;
};

type Props = {
  space: Pick<SeatingSpaceRow, "id" | "name" | "room_width_cm" | "room_depth_cm" | "drawing">;
  tables: readonly SeatingTable[];
  fixtures: readonly SeatingFixture[];
  customItems?: readonly SeatingCustomItemRow[];
  marquees?: readonly SeatingMarqueeRow[];
  options: PlanOptions;
  /** The venue's own plan, signed, to lay under the drawing. */
  backgroundUrl?: string | null;
  backgroundOpacity?: number;
  className?: string;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * One space as a plan to print, export as an image or show on a shared page
 * (spec 57 Part E): the venue's drawing, furniture, décor and tables to scale,
 * with a scale bar. Pure SVG with no state, so it renders on the server and in
 * a test. What it shows (names, colours, numbers) is the caller's choice: the
 * venue's copy passes no seats at all.
 */
export function PlanDrawing({ space, tables, fixtures, customItems = [], marquees = [], options, backgroundUrl, backgroundOpacity = 45, className }: Props) {
  const w = space.room_width_cm;
  const d = space.room_depth_cm;
  const parsed = parseDrawing(space.drawing);
  const drawing = parsed.ok ? parsed.drawing : emptyDrawing();
  const unit = Math.max(w, d) / 900;
  const font = Math.max(16, Math.max(w, d) / 75);
  const placed = tables.filter((t) => t.pos_x_cm !== null && t.space_id === space.id);
  const here = fixtures.filter((f) => f.space_id === space.id).filter((f) => (fixtureGroup(f.kind) === "decor" ? options.decor : options.furniture));
  const customById = new Map(customItems.map((c) => [c.id, c]));
  const marqueeById = new Map(marquees.map((m) => [m.id, m]));
  let decorNo = 0;
  let furnitureNo = 0;

  // A scale bar: the nearest of 1, 2, 5, 10 m under a fifth of the room's width.
  const bar = [1000, 500, 200, 100].find((m) => m <= w / 4) ?? 100;

  return (
    <figure className={className}>
      <svg viewBox={`-80 -80 ${w + 160} ${d + 240}`} className="w-full border border-line bg-white" role="img" aria-label={`${space.name}, ${formatLength(w)} by ${formatLength(d)}`}>
        <rect x={0} y={0} width={w} height={d} fill="#fff" stroke="#8a8580" strokeWidth={3 * unit} />
        {backgroundUrl && options.venue ? <image href={backgroundUrl} x={0} y={0} width={w} height={d} preserveAspectRatio="none" opacity={backgroundOpacity / 100} /> : null}
        {options.venue ? <VenueLayer drawing={drawing} unit={unit} /> : null}

        {here.map((f) => {
          const custom = f.custom_item_id ? customById.get(f.custom_item_id) : undefined;
          const marquee = f.marquee_id ? marqueeById.get(f.marquee_id) : undefined;
          const label = f.label ?? custom?.name ?? FIXTURE_DEFAULTS[f.kind]?.label ?? f.kind;
          const isDecor = fixtureGroup(f.kind) === "decor";
          const tag = isDecor && options.numberDecor ? String(++decorNo) : !isDecor && options.markFurniture ? (LETTERS[furnitureNo++ % 26] ?? "") : null;
          return (
            <g key={f.id} transform={`translate(${f.pos_x_cm} ${f.pos_y_cm}) rotate(${f.rotation_deg})`}>
              {custom?.shape === "round" || f.kind === "tree" || f.kind === "plant" ? (
                <ellipse rx={f.width_cm / 2} ry={f.depth_cm / 2} fill={custom?.colour ?? (isDecor ? "#e3efd9" : "#eee")} stroke="#888" strokeWidth={2 * unit} />
              ) : marquee?.rounded_ends ? (
                <rect x={-f.width_cm / 2} y={-f.depth_cm / 2} width={f.width_cm} height={f.depth_cm} rx={f.width_cm / 2} fill="#fbfaf6" stroke="#888" strokeWidth={2 * unit} />
              ) : (
                <rect x={-f.width_cm / 2} y={-f.depth_cm / 2} width={f.width_cm} height={f.depth_cm} fill={custom?.colour ?? (isDecor ? "#e3efd9" : "#eee")} stroke="#888" strokeWidth={2 * unit} />
              )}
              <g transform={`rotate(${-f.rotation_deg})`}>
                {tag ? (
                  <>
                    <circle r={font * 0.8} fill="#fff" stroke="#333" strokeWidth={unit * 1.5} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={font * 0.9} fill="#111" fontWeight={700}>
                      {tag}
                    </text>
                  </>
                ) : (
                  <text textAnchor="middle" dominantBaseline="central" fontSize={font * 0.8} fill="#555">
                    {label}
                    {f.quantity > 1 ? ` ×${f.quantity}` : ""}
                  </text>
                )}
              </g>
            </g>
          );
        })}

        {options.furniture
          ? placed.map((t) => {
              const { length, width } = tableSize(t);
              const seats = options.chairs === "numbered" ? (seatPositions({ ...t, pos_x_cm: 0, pos_y_cm: 0, rotation_deg: 0 }) ?? []) : [];
              const who = options.seats?.get(t.id);
              const seated = options.seatedAt?.get(t.id) ?? 0;
              const body = { fill: "#f6f6f6", stroke: "#333", strokeWidth: 3 * unit };
              return (
                <g key={t.id} transform={`translate(${t.pos_x_cm} ${t.pos_y_cm}) rotate(${t.rotation_deg})`}>
                  {seats.map((p, i) => {
                    const seat = who?.get(i);
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={20} fill={seat?.colour ?? "#fff"} stroke={seat?.allergy ? "#c81e1e" : "#888"} strokeWidth={seat?.allergy ? 5 : 2} />
                        <text transform={`translate(${p.x} ${p.y}) rotate(${-t.rotation_deg})`} textAnchor="middle" dominantBaseline="central" fontSize={14} fill={seat?.colour ? "#fff" : "#333"} fontWeight={600}>
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}
                  {t.shape === "rows" ? (
                    rowBlocks(t).map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} {...body} />)
                  ) : t.shape === "banquet" ? (
                    banquetPieces(t.segments, t.capacity).map((poly, i) => <polygon key={i} points={poly.map((p) => `${p.x},${p.y}`).join(" ")} {...body} />)
                  ) : t.shape === "round" ? (
                    <circle r={length / 2} {...body} />
                  ) : t.shape === "oval" ? (
                    <ellipse rx={length / 2} ry={width / 2} {...body} />
                  ) : t.shape === "serpentine" ? (
                    <path d={serpentinePath(length / 2, width / 2)} {...body} />
                  ) : t.shape === "half_moon" ? (
                    <path d={`M ${-length / 2} ${width / 2} A ${length / 2} ${length / 2} 0 0 1 ${length / 2} ${width / 2} Z`} {...body} />
                  ) : (
                    <rect x={-length / 2} y={-width / 2} width={length} height={width} {...body} />
                  )}
                  <g transform={`rotate(${-t.rotation_deg})`}>
                    <text textAnchor="middle" y={-font * 0.1} fontSize={font} fill="#111">
                      {t.label}
                    </text>
                    {options.tableText !== "label" ? (
                      <text textAnchor="middle" y={font} fontSize={font * 0.75} fill="#555">
                        {options.tableText === "label_count" ? `${seated}/${t.capacity}` : `${t.capacity} chairs`}
                      </text>
                    ) : null}
                    {options.numberDecor ? <circle r={font * 0.35} cy={-font * 1.6} fill="#a9c49a" stroke="#4d6b3f" strokeWidth={unit * 1.5} /> : null}
                  </g>
                </g>
              );
            })
          : null}

        {/* Scale bar. */}
        <g transform={`translate(0 ${d + 70})`}>
          <line x1={0} y1={0} x2={bar} y2={0} stroke="#333" strokeWidth={4 * unit} />
          <line x1={0} y1={-12 * unit} x2={0} y2={12 * unit} stroke="#333" strokeWidth={3 * unit} />
          <line x1={bar} y1={-12 * unit} x2={bar} y2={12 * unit} stroke="#333" strokeWidth={3 * unit} />
          <text x={bar + 20 * unit} y={0} dominantBaseline="central" fontSize={font * 0.9} fill="#333">
            {formatLength(bar)}
          </text>
        </g>
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        {space.name} · {formatLength(w)} × {formatLength(d)}
      </figcaption>
    </figure>
  );
}
