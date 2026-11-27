import { TABLE_ITEM_LABEL, TABLE_ITEM_SIZE, type TableItem, type TableItemKind } from "@/lib/seating/table-items";

const FILL: Record<TableItemKind, string> = {
  arrangement: "#a9c49a",
  candles: "#fff8e6",
  bud_vase: "#f3c7d1",
  lantern: "#f2d9a0",
  sign: "#ffffff",
  dish: "#e8eef2",
  custom: "#d9c9e8",
};
const STROKE: Record<TableItemKind, string> = {
  arrangement: "#6f8f60",
  candles: "#d9c58f",
  bud_vase: "#c98a9b",
  lantern: "#b88a2f",
  sign: "#8a8580",
  dish: "#8aa0b0",
  custom: "#8b6fb0",
};

/**
 * One thing on a table's top, drawn to scale in the table's own frame (spec 59 D.1): `along` and `across` are fractions
 * of its length and width from the centre. A ghost is an item placed by rule (a dashed outline: it is the rule's, not
 * placed by hand). Pure SVG, so it draws in the room, the close-up and the printed exports alike.
 */
export function TableItemGlyph({
  item,
  length,
  width,
  ghost = false,
  selected = false,
  name,
  textSize = 9,
  dx = 0,
  dy = 0,
}: {
  item: TableItem;
  length: number;
  width: number;
  ghost?: boolean;
  selected?: boolean;
  /** What to write under it (a dish's name, a custom item's, a label). */
  name?: string;
  textSize?: number;
  /** Extra offset in cm, for a drag in progress. */
  dx?: number;
  dy?: number;
}) {
  const size = TABLE_ITEM_SIZE[item.kind];
  const x = item.along * length + dx;
  const y = item.across * width + dy;
  const stroke = selected ? "#1a1a1a" : STROKE[item.kind];
  const common = { fill: FILL[item.kind], stroke, strokeWidth: selected ? 2.2 : 1.2, strokeDasharray: ghost ? "3 2" : undefined };
  const text = item.label ?? name ?? (item.kind === "sign" || item.kind === "dish" || item.kind === "custom" ? TABLE_ITEM_LABEL[item.kind] : undefined);
  return (
    <g transform={`translate(${x} ${y}) rotate(${item.rotation})`} data-item={item.id} opacity={ghost ? 0.6 : 1}>
      {size.round ? <circle r={size.w / 2} {...common} /> : <rect x={-size.w / 2} y={-size.d / 2} width={size.w} height={size.d} rx={2} {...common} />}
      {item.kind === "arrangement" ? <circle r={size.w * 0.22} fill="#ffffff" stroke="none" /> : null}
      {item.kind === "candles" ? <circle r={size.w * 0.18} fill="#f2c14e" stroke="none" /> : null}
      {text && (item.kind === "sign" || item.kind === "dish" || item.kind === "custom" || item.label) ? (
        <text y={size.d / 2 + textSize + 1} textAnchor="middle" fontSize={textSize} fill="#3a3632" stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" transform={`rotate(${-item.rotation})`} style={{ pointerEvents: "none" }}>
          {text}
        </text>
      ) : null}
    </g>
  );
}
