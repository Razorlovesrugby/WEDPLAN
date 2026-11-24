import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TableStyle } from "@/lib/seating/items";
import type { SeatingTable } from "@/lib/seating/model";
import { TableCloseup } from "./table-closeup";

const table = (over: Partial<SeatingTable> = {}): SeatingTable =>
  ({
    id: "t", wedding_id: "w", event_id: "e", space_id: "s", layout_id: "l", label: "Table 4", shape: "round", capacity: 8, reserved_seats: 0,
    reserved_note: null, ends_seated: false, accessible: false, sort_order: 0, notes: null, pos_x_cm: 0, pos_y_cm: 0, rotation_deg: 0,
    width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null, style_id: null, style_changes: null, platter_counts: null,
    created_at: "", updated_at: "", ...over,
  }) as SeatingTable;

const style: TableStyle = {
  id: "s1",
  name: "Garden round",
  place: { charger: { on: true }, dinner_plate: { on: true } },
  centre: { arrangement: { on: true, note: "low garden" }, candles: { on: true, count: 4 }, extras: [{ name: "Bud vases", count: 3 }] },
};

const draw = (t: SeatingTable, s: TableStyle | null) => renderToStaticMarkup(createElement(TableCloseup, { table: t, style: s }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("TableCloseup", () => {
  it("sets a charger and a plate at every chair, and the centre", () => {
    const html = draw(table(), style);
    expect(count(html, 'fill="#eadfc9"')).toBe(8);
    expect(count(html, 'fill="#ffffff" stroke="#d8d2c9"')).toBe(8);
    expect(html).toContain("Garden round");
    expect(html).toContain("low garden");
    expect(html).toContain("Bud vases × 3");
    expect(count(html, 'fill="#fff8e6"')).toBe(4);
  });

  it("follows the table's capacity and shape", () => {
    expect(count(draw(table({ shape: "long", capacity: 12 }), style), 'fill="#eadfc9"')).toBe(12);
    expect(draw(table({ shape: "oval", capacity: 10 }), style)).toContain("<ellipse");
    expect(draw(table({ shape: "half_moon", capacity: 6 }), style)).toContain("A ");
  });

  it("lays a table's own changes over its style", () => {
    const html = draw(table({ style_changes: { place: { charger: { on: false } } } }), style);
    expect(count(html, 'fill="#eadfc9"')).toBe(0);
    expect(html).toContain("changed from its style");
  });

  it("draws bare chairs when there is no style", () => {
    const html = draw(table(), null);
    expect(count(html, 'fill="#eadfc9"')).toBe(0);
    expect(html).toContain("No style yet");
  });

  it("says ceremony rows have no tabletop to set", () => {
    expect(draw(table({ shape: "rows", rows_count: 4 }), style)).toContain("no tabletop");
  });
});
