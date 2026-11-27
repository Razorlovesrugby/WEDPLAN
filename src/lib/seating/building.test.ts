import { describe, expect, it } from "vitest";
import { buildingGuides, buildingLines, wallGaps } from "./building";
import { emptyDrawing, type Drawing } from "./drawing";

const drawing = (over: Partial<Drawing> = {}): Drawing => ({ ...emptyDrawing(), ...over });
const wall = (id: string, a: [number, number], b: [number, number], thick = 20, bulge = 0) => ({ id, a, b, thick, bulge });
const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe("buildingLines (spec 60 C.3)", () => {
  it("a straight vertical wall gives both faces, and its ends give lines", () => {
    const lines = buildingLines(drawing({ walls: [wall("w1", [1000, 0], [1000, 500])] }));
    expect(lines.filter((l) => l.axis === "x").map((l) => l.at).sort((a, b) => a - b)).toEqual([990, 1000, 1000, 1010]);
    expect(lines.some((l) => l.axis === "y" && l.at === 0)).toBe(true);
    expect(lines.some((l) => l.axis === "y" && l.at === 500)).toBe(true);
  });

  it("a curved wall gives only its ends", () => {
    const lines = buildingLines(drawing({ walls: [wall("w1", [0, 0], [400, 0], 20, 80)] }));
    expect(lines.map((l) => `${l.axis}${l.at}`).sort()).toEqual(["x0", "x400", "y0", "y0"]);
  });

  it("a door gives its centre and ends; a marker its edges and centre; an area its edges", () => {
    const d = drawing({
      walls: [wall("w1", [0, 0], [1000, 0])],
      openings: [{ id: "o1", kind: "door", wall: "w1", at: 0.5, width: 100, swing: "in", hinge: "a" }],
      markers: [{ id: "m1", kind: "column", x: 300, y: 300, w: 40, d: 40, rot: 0 }],
      areas: [{ id: "a1", name: "Bar", points: [[100, 100], [300, 100], [300, 250], [100, 250]], tint: null, outdoor: false }],
    });
    const lines = buildingLines(d);
    expect(lines.some((l) => l.axis === "x" && l.at === 500)).toBe(true); // door centre
    expect(lines.some((l) => l.axis === "x" && l.at === 450)).toBe(true); // door end
    expect(lines.some((l) => l.axis === "x" && l.at === 280)).toBe(true); // column edge
    expect(lines.some((l) => l.axis === "y" && l.at === 250)).toBe(true); // area edge
  });

  it("an opening whose wall is gone is ignored", () => {
    expect(() => buildingLines(drawing({ openings: [{ id: "o1", kind: "door", wall: "zzz", at: 0.5, width: 100, swing: "in", hinge: "a" }] }))).not.toThrow();
  });
});

describe("buildingGuides", () => {
  const lines = buildingLines(drawing({ walls: [wall("w1", [1000, 0], [1000, 800])] }));

  it("pulls an item's edge onto the wall face when it is close", () => {
    // The wall's west face is at 990. An item ending at 985 is 5 cm short.
    const r = buildingGuides(box(800, 100, 985, 200), lines, 8);
    expect(r.x).toBe(true);
    expect(r.dx).toBe(5);
    expect(r.guides[0]).toMatchObject({ axis: "x", at: 990, kind: "edge", source: "building" });
  });

  it("does nothing when nothing is within the threshold", () => {
    const r = buildingGuides(box(100, 100, 200, 200), lines, 8);
    expect(r).toMatchObject({ dx: 0, dy: 0, x: false, y: false, guides: [] });
  });

  it("lines the centre up with a door's centre", () => {
    const d = drawing({ walls: [wall("w1", [0, 0], [1000, 0])], openings: [{ id: "o1", kind: "door", wall: "w1", at: 0.5, width: 100, swing: "in", hinge: "a" }] });
    // Centre at 502, 2 cm off the door's centre line; the edges (462 and 542) are further from the door's ends (450, 550).
    const r = buildingGuides(box(462, 100, 542, 200), buildingLines(d), 8);
    expect(r.x).toBe(true);
    expect(r.guides[0]).toMatchObject({ at: 500, kind: "centre" });
    expect(r.dx).toBe(-2);
  });

  it("skips an axis the furniture already snapped on", () => {
    const r = buildingGuides(box(800, 100, 985, 200), lines, 8, { x: true });
    expect(r.x).toBe(false);
    expect(r.dx).toBe(0);
  });

  it("takes the closest line", () => {
    const r = buildingGuides(box(800, 100, 988, 200), lines, 12);
    expect(r.dx).toBe(2); // the 990 face, not the 1000 centre line
  });
});

describe("wallGaps", () => {
  const d = drawing({ walls: [wall("east", [1000, 0], [1000, 800]), wall("north", [0, 0], [1000, 0])] });

  it("shows the distance to the nearest wall face on each side it faces", () => {
    const gaps = wallGaps(box(700, 300, 800, 400), d);
    const east = gaps.find((g) => g.axis === "y")!;
    // East wall's west face is at 990: 190 cm from the item's east edge (800).
    expect(east).toMatchObject({ kind: "spacing", gap: 190, from: 800, to: 990, source: "building" });
    // North wall's south face is at 10: 290 cm above the item's top (300).
    const north = gaps.find((g) => g.axis === "x")!;
    expect(north).toMatchObject({ gap: 290, from: 10, to: 300 });
  });

  it("leaves out walls beyond reach and walls it does not face", () => {
    expect(wallGaps(box(100, 300, 200, 400), d, 300).find((g) => g.axis === "y")).toBeUndefined();
    // Beside the east wall's end (y beyond 800): no gap to it.
    expect(wallGaps(box(700, 900, 800, 1000), d).find((g) => g.axis === "y")).toBeUndefined();
  });

  it("is empty with no walls", () => {
    expect(wallGaps(box(0, 0, 10, 10), drawing())).toEqual([]);
  });
});
