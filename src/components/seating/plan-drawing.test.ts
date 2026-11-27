import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SeatingFixture, SeatingTable } from "@/lib/seating/model";
import { PlanDrawing, type PlanOptions } from "./plan-drawing";

const space = { id: "s1", name: "Hall", room_width_cm: 2000, room_depth_cm: 1500, drawing: { walls: [{ id: "w1", a: [0, 0], b: [2000, 0], thick: 20, bulge: 0 }] } };
const table = (o: Partial<SeatingTable>): SeatingTable =>
  ({ id: "t1", wedding_id: "w", event_id: "e", layout_id: "l", space_id: "s1", label: "Table 1", shape: "round", capacity: 4, reserved_seats: 0, reserved_note: null, ends_seated: false, accessible: false, sort_order: 0, notes: null, pos_x_cm: 600, pos_y_cm: 600, rotation_deg: 0, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null, style_id: null, style_changes: null, platter_counts: null, created_at: "", updated_at: "", ...o }) as SeatingTable;
const fixture = (o: Partial<SeatingFixture>): SeatingFixture =>
  ({ id: "f1", wedding_id: "w", event_id: "e", layout_id: "l", space_id: "s1", kind: "bar", label: null, pos_x_cm: 100, pos_y_cm: 100, width_cm: 300, depth_cm: 80, rotation_deg: 0, quantity: 1, vendor_id: null, custom_item_id: null, marquee_id: null, created_at: "", updated_at: "", ...o }) as SeatingFixture;
const base: PlanOptions = { venue: true, furniture: true, decor: true, chairs: "numbered", tableText: "label" };
const draw = (props: Partial<Parameters<typeof PlanDrawing>[0]> = {}, options: Partial<PlanOptions> = {}) =>
  renderToStaticMarkup(createElement(PlanDrawing, { space, tables: [table({})], fixtures: [fixture({}), fixture({ id: "f2", kind: "aisle_flowers", quantity: 12, width_cm: 40, depth_cm: 40 })], options: { ...base, ...options }, ...props }));

describe("PlanDrawing", () => {
  it("draws the venue, a table with its chairs numbered, and a scale bar", () => {
    const html = draw();
    expect(html).toContain('d="M 0 0 L 2000 0"');
    expect(html).toContain(">Table 1<");
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`>${n}</text>`);
    // The bar is the longest of 10, 5, 2 and 1 m that fits in a quarter of the room: 5 m of 20.
    expect(html).toContain(">5 m<");
  });
  it("leaves the venue out for the layouts that don't want it", () => {
    expect(draw({}, { venue: false })).not.toContain('d="M 0 0 L 2000 0"');
  });
  it("names no one unless told who sits where", () => {
    expect(draw()).not.toContain("Aroha");
    const seats = new Map([["t1", new Map([[0, { label: "Aroha N", colour: "#2f7d4f", allergy: true, dot: false }]])]]);
    const html = draw({}, { seats });
    expect(html).toContain('fill="#2f7d4f"');
    expect(html).toContain('stroke="#c81e1e"');
  });
  it("shows seated over capacity on request", () => {
    const html = draw({}, { tableText: "label_count", seatedAt: new Map([["t1", 3]]) });
    expect(html).toContain("3/4");
  });
  it("numbers the décor for the florist and marks the furniture for the hire company", () => {
    const florist = draw({}, { numberDecor: true });
    expect(florist).toContain(">1<");
    const hire = draw({}, { markFurniture: true });
    expect(hire).toContain(">A<");
  });
  it("hides décor or furniture by layer", () => {
    expect(draw({}, { decor: false })).not.toContain("Aisle flowers");
    expect(draw({}, { furniture: false })).not.toContain(">Bar<");
    expect(draw({}, { furniture: false })).not.toContain(">Table 1<");
  });
  it("draws only the tables placed in this space", () => {
    const html = draw({ tables: [table({}), table({ id: "t2", label: "Elsewhere", space_id: "s2" }), table({ id: "t3", label: "Loose", pos_x_cm: null, pos_y_cm: null })] });
    expect(html).not.toContain("Elsewhere");
    expect(html).not.toContain("Loose");
  });
  it("draws ceremony rows and banquet runs", () => {
    expect(draw({ tables: [table({ shape: "rows", capacity: 20, rows_count: 2, aisle_cm: 120 })] })).toContain("<rect");
    expect(draw({ tables: [table({ shape: "banquet", capacity: 12, segments: [{ len: 300, turn: 0 }, { len: 200, turn: 90 }] as never })] })).toContain("<polygon");
  });
});
