import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyDrawing, type Drawing } from "@/lib/seating/drawing";
import { VenueLayer, WallPreview } from "./venue-layer";

const drawing = (over: Partial<Drawing> = {}): Drawing => ({ ...emptyDrawing(), ...over });
const draw = (d: Drawing, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement("svg", null, createElement(VenueLayer, { drawing: d, unit: 1, ...extra })));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("VenueLayer", () => {
  const walls: Drawing["walls"] = [
    { id: "w1", a: [0, 0], b: [1000, 0], thick: 20, bulge: 0 },
    { id: "w2", a: [1000, 0], b: [1000, 600], thick: 20, bulge: 150 },
  ];

  it("draws nothing for an empty drawing", () => {
    const html = draw(drawing());
    expect(count(html, "<path")).toBe(0);
    expect(count(html, "<text")).toBe(0);
  });

  it("draws a straight wall as a line and a curved one as an arc, at their thickness", () => {
    const html = draw(drawing({ walls }));
    expect(html).toContain('d="M 0 0 L 1000 0"');
    expect(html).toMatch(/d="M 1000 0 A [0-9.]+ [0-9.]+ 0 0 [01] 1000 600"/);
    expect(count(html, 'stroke-width="20"')).toBe(2);
  });

  it("opens a gap in the wall for a door and shows how it swings", () => {
    const html = draw(drawing({ walls, openings: [{ id: "d1", kind: "door", wall: "w1", at: 0.5, width: 90, swing: "in", hinge: "a" }] }));
    // The gap in the paper's colour, a leaf, and the swing arc.
    expect(html).toContain('stroke="#ffffff" stroke-width="22"');
    expect(html).toMatch(/<path d="M [0-9.]+ [0-9.]+ A 90 90 0 0 [01] /);
  });

  it("draws a window as two lines, a double door as two leaves and an opening as a dashed gap", () => {
    const o = (kind: "window" | "double_door" | "opening") => draw(drawing({ walls, openings: [{ id: "o", kind, wall: "w1", at: 0.5, width: 120, swing: "in", hinge: "a" }] }));
    expect(count(o("double_door"), "A 60 60")).toBe(2);
    expect(o("opening")).toContain("stroke-dasharray");
    expect(count(o("window"), 'stroke-width="1.5"')).toBe(2);
  });

  it("labels an area with its name and size", () => {
    const html = draw(drawing({ areas: [{ id: "a1", name: "Dance floor", points: [[0, 0], [500, 0], [500, 400], [0, 400]], tint: null, outdoor: false }] }));
    expect(html).toContain("Dance floor");
    expect(html).toContain("20.0 m²");
    expect(html).not.toContain("url(#venue-hatch)");
  });

  it("hatches an outdoor area", () => {
    const html = draw(drawing({ areas: [{ id: "a1", name: "Lawn", points: [[0, 0], [500, 0], [500, 400]], tint: null, outdoor: true }] }));
    expect(html).toContain('fill="url(#venue-hatch)"');
  });

  it("writes text, markers and kept dimensions", () => {
    const html = draw(
      drawing({
        labels: [{ id: "l1", text: "Bar here", x: 100, y: 100, size: 16 }],
        markers: [
          { id: "m1", kind: "toilets", x: 50, y: 50, w: 100, d: 100, rot: 0 },
          { id: "m2", kind: "fire_exit", x: 300, y: 50, w: 120, d: 30, rot: 0 },
        ],
        dimensions: [{ id: "k1", a: [0, 0], b: [660, 0] }],
      }),
    );
    expect(html).toContain("Bar here");
    expect(html).toContain(">WC<");
    expect(html).toContain(">EXIT<");
    expect(html).toContain("6.6 m");
  });

  it("can be picked only when asked to be", () => {
    const d = drawing({ walls });
    expect(draw(d)).not.toContain("transparent");
    expect(draw(d, { onPick: () => undefined })).toContain('stroke="transparent"');
  });

  it("marks the selection", () => {
    expect(draw(drawing({ walls }), { selected: { kind: "wall", id: "w1" } })).toContain("#b0532b");
    expect(draw(drawing({ walls }))).not.toContain("#b0532b");
  });

  it("previews a wall with its length and angle", () => {
    const html = renderToStaticMarkup(createElement("svg", null, createElement(WallPreview, { from: [0, 0], to: [300, 0], unit: 1 })));
    expect(html).toContain("3 m · 0°");
  });
});
