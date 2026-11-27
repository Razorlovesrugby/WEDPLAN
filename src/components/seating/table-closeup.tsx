import { CHAIR_OFFSET_CM, localSeatPositions, serpentinePath, tableSize } from "@/lib/seating/geometry";
import { CENTRE_LABEL, effectiveStyle, parseStyleChanges, type TableStyle } from "@/lib/seating/items";
import type { CloseupFood } from "@/lib/seating/kitchen";
import type { SeatingTable } from "@/lib/seating/model";
import type { TableItem } from "@/lib/seating/table-items";
import type { Ref, ReactNode } from "react";
import { TableItemGlyph } from "./table-item-glyph";

/**
 * One table, top down and to scale, with what the style puts on it (spec 57
 * C.2): every place setting at its chair, and the centre. Presentational: it
 * reads the table and its style and draws.
 */

type Vec = { x: number; y: number };

/** The way from a chair toward the tabletop, as a unit vector. */
function inward(p: Vec, shape: SeatingTable["shape"], hl: number, hw: number): Vec {
  void hl;
  if (shape === "serpentine") return { x: 0, y: p.y < 0 ? 1 : -1 };
  if (shape === "long" || shape === "head" || shape === "sweetheart" || shape === "square") {
    if (Math.abs(p.y) > hw) return { x: 0, y: p.y < 0 ? 1 : -1 };
    return { x: p.x < 0 ? 1 : -1, y: 0 };
  }
  const cx = 0;
  const cy = shape === "half_moon" ? hw : 0;
  const dx = cx - p.x;
  const dy = cy - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** The tabletop's outline, grown by `grow` cm (the cloth's overhang). */
function Outline({ shape, hl, hw, grow, fill, stroke }: { shape: SeatingTable["shape"]; hl: number; hw: number; grow: number; fill: string; stroke: string }) {
  if (shape === "round") return <circle r={hl + grow} fill={fill} stroke={stroke} />;
  if (shape === "serpentine") return <path d={serpentinePath(hl, hw, grow)} fill={fill} stroke={stroke} />;
  if (shape === "oval") return <ellipse rx={hl + grow} ry={hw + grow} fill={fill} stroke={stroke} />;
  if (shape === "half_moon") {
    return <path d={`M ${-hl - grow} ${hw + grow} A ${hl + grow} ${hl + grow} 0 0 1 ${hl + grow} ${hw + grow} Z`} fill={fill} stroke={stroke} />;
  }
  return <rect x={-hl - grow} y={-hw - grow} width={2 * (hl + grow)} height={2 * (hw + grow)} rx={grow ? 4 : 0} fill={fill} stroke={stroke} />;
}

function PlaceSetting({
  place,
}: {
  place: ReturnType<typeof effectiveStyle>["place"];
}) {
  const on = (k: keyof typeof place) => place[k]?.on === true;
  const cutlery = place.cutlery?.on ? place.cutlery.count ?? 4 : 0;
  const glasses = place.glasses?.on ? place.glasses.count ?? 2 : 0;
  const left = Math.ceil(cutlery / 2);
  const right = cutlery - left;
  return (
    <g>
      {on("charger") ? <circle r={17} fill="#eadfc9" stroke="#cdb894" strokeWidth={1} /> : null}
      {on("dinner_plate") ? <circle r={13.5} fill="#ffffff" stroke="#d8d2c9" strokeWidth={1} /> : null}
      {on("napkin") ? <rect x={-6} y={-4} width={12} height={8} rx={1.5} fill="#c9d9c0" stroke="#a9bf9d" strokeWidth={0.6} transform="rotate(-8)" /> : null}
      {on("side_plate") ? <circle cx={-29} cy={-8} r={8.5} fill="#ffffff" stroke="#d8d2c9" strokeWidth={1} /> : null}
      {Array.from({ length: left }, (_, i) => (
        <rect key={`l${i}`} x={-23 - i * 4} y={-14} width={2.2} height={26} rx={1} fill="#9a9389" />
      ))}
      {Array.from({ length: right }, (_, i) => (
        <rect key={`r${i}`} x={21 + i * 4} y={-14} width={2.2} height={26} rx={1} fill="#9a9389" />
      ))}
      {Array.from({ length: Math.min(glasses, 5) }, (_, i) => (
        <circle key={`g${i}`} cx={20 + (i % 3) * 8 - (i > 2 ? 4 : 0)} cy={-22 - Math.floor(i / 3) * 8 - (i % 3) * 3} r={4} fill="rgba(190,210,225,0.35)" stroke="#a7b8c6" strokeWidth={1} />
      ))}
      {on("name_card") ? <rect x={-7} y={-26} width={14} height={6} fill="#ffffff" stroke="#c9c4bb" strokeWidth={0.8} /> : null}
      {on("menu_card") ? <rect x={-19} y={-29} width={8} height={12} fill="#ffffff" stroke="#c9c4bb" strokeWidth={0.8} /> : null}
    </g>
  );
}

export function TableCloseup({
  table,
  style,
  food,
  items,
  dishNames,
  overlay,
  svgRef,
  svgProps,
}: {
  table: SeatingTable;
  style: TableStyle | null;
  /** Shared dishes down the middle, plate rings and name tags (spec 57 C.2, F.4, F.5). */
  food?: CloseupFood;
  /** What is placed on the top (spec 59 D.1), and what rules place: ghosts have `fromRule`. Drawn to scale, so exports show them. */
  items?: (TableItem & { fromRule?: string })[];
  /** Names for `dish` and `custom` items, by their `ref`. */
  dishNames?: Readonly<Record<string, string>>;
  /** More SVG drawn on top, in the table's own frame: the editor's selection and guides. */
  overlay?: ReactNode;
  /** The close-up editor reads pointer positions off this. */
  svgRef?: Ref<SVGSVGElement>;
  svgProps?: React.SVGAttributes<SVGSVGElement>;
}) {
  if (table.shape === "rows") {
    return <p className="text-sm text-muted">Ceremony rows are chairs only: there is no tabletop to set.</p>;
  }
  const eff = effectiveStyle(style, parseStyleChanges(table.style_changes));
  const { length, width } = tableSize(table);
  const hl = length / 2;
  const hw = width / 2;
  const pad = CHAIR_OFFSET_CM + 70;
  const seats = localSeatPositions(table);
  const centre = eff.centre;
  const longish = table.shape === "long" || table.shape === "head" || table.shape === "banquet" || table.shape === "serpentine" || table.shape === "sweetheart";
  const arrangementSize = Math.min(26, Math.max(14, Math.min(length, width) * 0.2));
  const candles = centre.candles?.on ? Math.min(centre.candles.count ?? 6, 12) : 0;
  const extras = centre.extras ?? [];

  return (
    <figure className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`${-hl - pad} ${-hw - pad} ${length + pad * 2} ${width + pad * 2}`}
        className="mx-auto block max-h-96 w-full"
        role="img"
        aria-label={`${table.label} set with ${style?.name ?? "nothing"}`}
        {...svgProps}
      >
        {centre.tablecloth?.on ? <Outline shape={table.shape} hl={hl} hw={hw} grow={12} fill="#f7f3ed" stroke="#e2dbd0" /> : null}
        <Outline shape={table.shape} hl={hl} hw={hw} grow={0} fill="#ffffff" stroke="#b8b0a4" />
        {centre.runner?.on && longish ? <rect x={-hl * 0.92} y={-14} width={length * 0.92} height={28} fill="#efe7dc" stroke="#dccfbd" /> : null}
        {seats.map((p, i) => {
          const dir = inward(p, table.shape, hl, hw);
          const out = { x: -dir.x, y: -dir.y };
          const rot = (Math.atan2(-out.x, out.y) * 180) / Math.PI;
          const at = { x: p.x + dir.x * (CHAIR_OFFSET_CM + 24), y: p.y + dir.y * (CHAIR_OFFSET_CM + 24) };
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={17} fill="#f4f1ec" stroke="#c9c4bb" />
              {food?.rings[i] ? <circle cx={p.x} cy={p.y} r={21} fill="none" stroke={food.rings[i] === "kids" ? "#7e3fb8" : "#d97706"} strokeWidth={3.5} /> : null}
              {food?.names[i] ? (
                <text x={p.x + out.x * 34} y={p.y + out.y * 34} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#3a3632" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                  {food.names[i]}
                </text>
              ) : null}
              <g transform={`translate(${at.x} ${at.y}) rotate(${rot})`}>
                <PlaceSetting place={eff.place} />
              </g>
            </g>
          );
        })}
        {centre.arrangement?.on ? (
          <g>
            <circle r={arrangementSize} fill="#a9c49a" />
            {[0, 1, 2, 3, 4].map((i) => (
              <circle
                key={i}
                cx={Math.cos((i * 2 * Math.PI) / 5) * arrangementSize * 0.5}
                cy={Math.sin((i * 2 * Math.PI) / 5) * arrangementSize * 0.5}
                r={arrangementSize * 0.28}
                fill={i % 2 ? "#f3c7d1" : "#e7a9b7"}
              />
            ))}
            <circle r={arrangementSize * 0.22} fill="#ffffff" />
          </g>
        ) : null}
        {food && food.dishes.length > 0 ? (
          <g aria-label="Shared dishes">
            {food.dishes.map((d, i) => {
              const along = longish ? -hl * 0.7 + ((i + 0.5) * (hl * 1.4)) / food.dishes.length : Math.cos((i * 2 * Math.PI) / food.dishes.length) * Math.min(hl, hw) * 0.45;
              const across = longish ? 0 : Math.sin((i * 2 * Math.PI) / food.dishes.length) * Math.min(hl, hw) * 0.45;
              return (
                <g key={d.name + i} transform={`translate(${along} ${across})`}>
                  {d.vessel === "board" ? <rect x={-14} y={-6} width={28} height={12} rx={2} fill="#d9b98a" stroke="#a98a5c" /> : d.vessel === "bowl" ? <circle r={9} fill="#e8eef2" stroke="#8aa0b0" /> : <ellipse rx={15} ry={9} fill="#f3f3f3" stroke="#9a9a9a" />}
                  <text y={20} textAnchor="middle" fontSize={9} fill="#3a3632">
                    {d.name} ×{d.count}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}
        {(items ?? []).map((it) => (
          <TableItemGlyph key={it.id} item={it} length={length} width={width} ghost={Boolean(it.fromRule)} name={it.ref ? dishNames?.[it.ref] : undefined} />
        ))}
        {Array.from({ length: candles }, (_, i) => {
          const a = (i * 2 * Math.PI) / Math.max(candles, 1) + Math.PI / 6;
          const r = arrangementSize + 14;
          const x = longish ? (-hl * 0.8) + ((i + 0.5) * (hl * 1.6)) / Math.max(candles, 1) : Math.cos(a) * r;
          const y = longish ? (i % 2 ? 18 : -18) : Math.sin(a) * r;
          return <circle key={i} cx={x} cy={y} r={4.5} fill="#fff8e6" stroke="#e7d7b0" style={{ filter: "drop-shadow(0 0 4px rgba(242,193,78,0.6))" }} />;
        })}
        {overlay}
      </svg>
      <figcaption className="text-xs text-muted">
        {style ? <>Style: <strong className="text-ink">{style.name}</strong></> : "No style yet."}
        {centre.arrangement?.on && centre.arrangement.note ? ` · ${CENTRE_LABEL.arrangement.toLowerCase().replace("centre ", "")}: ${centre.arrangement.note}` : ""}
        {extras.length > 0 ? ` · ${extras.map((e) => `${e.name} × ${e.count}`).join(", ")}` : ""}
        {table.style_changes ? " · changed from its style" : ""}
      </figcaption>
    </figure>
  );
}
