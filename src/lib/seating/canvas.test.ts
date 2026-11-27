import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCKS,
  alignBodies,
  boundsOf,
  boxFrom,
  boxHits,
  clampDelta,
  clampViewWidth,
  distributeBodies,
  fixtureBody,
  fitBox,
  gestureFactor,
  gridBodies,
  itemKey,
  panView,
  parseKey,
  parseLocks,
  parseNavMode,
  selectSimilar,
  snapGuides,
  tableBody,
  viewAtPercent,
  wheelAction,
  zoomFactorFor,
  zoomPercent,
  zoomViewAbout,
  type Body,
  type Box,
  type View,
  type WheelLike,
} from "./canvas";
import type { SeatingFixture, SeatingTable } from "./model";

const wheel = (over: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...over });

const table = (id: string, x: number, y: number, over: Partial<SeatingTable> = {}): SeatingTable =>
  ({
    id,
    label: id,
    shape: "round",
    capacity: 8,
    ends_seated: false,
    width_cm: null,
    length_cm: null,
    pos_x_cm: x,
    pos_y_cm: y,
    rotation_deg: 0,
    rows_count: null,
    aisle_cm: null,
    segments: null,
    ...over,
  }) as unknown as SeatingTable;

const fixture = (id: string, x: number, y: number, over: Partial<SeatingFixture> = {}): SeatingFixture =>
  ({ id, kind: "candles", pos_x_cm: x, pos_y_cm: y, width_cm: 60, depth_cm: 20, rotation_deg: 0, custom_item_id: null, marquee_id: null, ...over }) as unknown as SeatingFixture;

/** A plain square body of side `s` centred on x, y: easy to reason about. */
const square = (key: string, x: number, y: number, s = 100, over: Partial<Body> = {}): Body => {
  const poly = [
    { x: x - s / 2, y: y - s / 2 },
    { x: x + s / 2, y: y - s / 2 },
    { x: x + s / 2, y: y + s / 2 },
    { x: x - s / 2, y: y + s / 2 },
  ];
  return { key, kind: "fixture", id: key, x, y, rotation: 0, poly, hit: poly, layer: "furniture", sig: "s", locked: false, ...over };
};

describe("zoom", () => {
  it("100% is one pixel to the centimetre", () => {
    expect(zoomPercent(2000, 2000)).toBe(100);
    expect(zoomPercent(4000, 2000)).toBe(50);
    expect(zoomPercent(1000, 2000)).toBe(200);
  });

  it("is held between 10% and 800%", () => {
    // 1000 px wide: 10% shows 10 000 cm, 800% shows 125 cm.
    expect(clampViewWidth(1e9, 1000)).toBeCloseTo(10_000);
    expect(clampViewWidth(1, 1000)).toBeCloseTo(125);
    expect(clampViewWidth(2000, 1000)).toBe(2000);
    const zoomedIn = zoomViewAbout({ x: 0, y: 0, w: 2000, h: 1000 }, { x: 0, y: 0 }, 1e6, 1000);
    expect(zoomPercent(zoomedIn.w, 1000)).toBeCloseTo(800);
    const zoomedOut = zoomViewAbout({ x: 0, y: 0, w: 2000, h: 1000 }, { x: 0, y: 0 }, 1e-6, 1000);
    expect(zoomPercent(zoomedOut.w, 1000)).toBeCloseTo(10);
  });

  it("keeps the point under the cursor where it was", () => {
    const v: View = { x: 100, y: 200, w: 2000, h: 1000 };
    const p = { x: 700, y: 450 };
    const next = zoomViewAbout(v, p, 2, 1000);
    expect(next.w).toBe(1000);
    // The cursor sat at (p - origin) / size of the view before; it must after too.
    expect((p.x - v.x) / v.w).toBeCloseTo((p.x - next.x) / next.w);
    expect((p.y - v.y) / v.h).toBeCloseTo((p.y - next.y) / next.h);
  });

  it("ignores a nonsense factor", () => {
    const v: View = { x: 0, y: 0, w: 2000, h: 1000 };
    expect(zoomViewAbout(v, { x: 0, y: 0 }, 0, 1000)).toBe(v);
    expect(zoomViewAbout(v, { x: 0, y: 0 }, NaN, 1000)).toBe(v);
  });

  it("goes to an exact percentage", () => {
    const v: View = { x: 0, y: 0, w: 2000, h: 1000 };
    const at = viewAtPercent(v, 200, 1000);
    expect(zoomPercent(at.w, 1000)).toBeCloseTo(200);
    // The centre stays put.
    expect(at.x + at.w / 2).toBeCloseTo(1000);
    expect(zoomPercent(viewAtPercent(v, 5000, 1000).w, 1000)).toBeCloseTo(800);
  });

  it("fits a box with a margin, in the window's shape", () => {
    const v = fitBox({ x0: 0, y0: 0, x1: 2000, y1: 1000 }, 2);
    expect(v.w / v.h).toBeCloseTo(2);
    expect(v.x).toBeLessThan(0);
    expect(v.x + v.w).toBeGreaterThan(2000);
    // A tall box in a wide window gains width, not height.
    const tall = fitBox({ x0: 0, y0: 0, x1: 100, y1: 1000 }, 2);
    expect(tall.w / tall.h).toBeCloseTo(2);
    expect(tall.h).toBeGreaterThanOrEqual(1000);
  });
});

describe("wheel and pinch", () => {
  it("zooms about 10% for a mouse notch, either way", () => {
    expect(zoomFactorFor(-100)).toBeCloseTo(1.1, 3);
    expect(zoomFactorFor(100)).toBeCloseTo(1 / 1.1, 3);
  });

  it("zooms in proportion to a trackpad pinch, so it never races", () => {
    expect(zoomFactorFor(-2)).toBeCloseTo(Math.exp(0.02), 5);
    expect(zoomFactorFor(-2)).toBeLessThan(1.03);
    // Ten small events are not ten notches.
    expect(Math.pow(zoomFactorFor(-2), 10)).toBeLessThan(1.25);
    expect(zoomFactorFor(0)).toBe(1);
  });

  it("caps one huge event", () => {
    expect(zoomFactorFor(-100000)).toBeLessThan(1.6);
    expect(zoomFactorFor(100000)).toBeGreaterThan(0.6);
  });

  it("trackpad mode: scrolling pans, Shift pans sideways, pinch and Ctrl/⌘ zoom", () => {
    expect(wheelAction(wheel({ deltaX: 3, deltaY: 7 }), "trackpad")).toEqual({ kind: "pan", dx: 3, dy: 7 });
    expect(wheelAction(wheel({ deltaY: 30, shiftKey: true }), "trackpad")).toEqual({ kind: "pan", dx: 30, dy: 0 });
    // A browser that already turned Shift+scroll sideways: keep its delta.
    expect(wheelAction(wheel({ deltaX: 30, shiftKey: true }), "trackpad")).toEqual({ kind: "pan", dx: 30, dy: 0 });
    const pinch = wheelAction(wheel({ deltaY: -4, ctrlKey: true }), "trackpad");
    expect(pinch.kind).toBe("zoom");
    expect(pinch.kind === "zoom" && pinch.factor).toBeGreaterThan(1);
    expect(wheelAction(wheel({ deltaY: 4, metaKey: true }), "trackpad").kind).toBe("zoom");
  });

  it("mouse mode: the wheel zooms, Shift pans sideways, Ctrl/⌘ pans up and down", () => {
    const zoom = wheelAction(wheel({ deltaY: -100 }), "mouse");
    expect(zoom.kind === "zoom" && zoom.factor).toBeCloseTo(1.1, 3);
    expect(wheelAction(wheel({ deltaY: 100, shiftKey: true }), "mouse")).toEqual({ kind: "pan", dx: 100, dy: 0 });
    expect(wheelAction(wheel({ deltaX: 40, shiftKey: true }), "mouse")).toEqual({ kind: "pan", dx: 40, dy: 0 });
    expect(wheelAction(wheel({ deltaY: 100, ctrlKey: true }), "mouse")).toEqual({ kind: "pan", dx: 0, dy: 100 });
    expect(wheelAction(wheel({ deltaY: -100, metaKey: true }), "mouse")).toEqual({ kind: "pan", dx: 0, dy: -100 });
  });

  it("reads lines and pages as pixels", () => {
    // Firefox reports a mouse notch as 3 lines.
    const z = wheelAction(wheel({ deltaY: -3, deltaMode: 1 }), "mouse");
    expect(z.kind === "zoom" && z.factor).toBeCloseTo(1.1, 1);
    const p = wheelAction(wheel({ deltaY: 3, deltaMode: 1 }), "trackpad");
    expect(p).toEqual({ kind: "pan", dx: 0, dy: 120 });
  });

  it("turns Safari's gesture scale into a factor since the last event", () => {
    expect(gestureFactor(1.2, 1)).toBeCloseTo(1.2);
    expect(gestureFactor(1.5, 1.2)).toBeCloseTo(1.25);
    expect(gestureFactor(0, 1)).toBe(1);
  });

  it("pans by screen pixels at the current zoom", () => {
    const v: View = { x: 0, y: 0, w: 2000, h: 1000 };
    // 1000 px across 2000 cm: 2 cm a pixel.
    expect(panView(v, 10, -5, 1000)).toEqual({ x: 20, y: -10, w: 2000, h: 1000 });
  });

  it("reads the stored modes defensively", () => {
    expect(parseNavMode("mouse")).toBe("mouse");
    expect(parseNavMode("trackpad")).toBe("trackpad");
    expect(parseNavMode(null)).toBe("trackpad");
    expect(parseNavMode("nonsense")).toBe("trackpad");
  });

  it("starts with only the venue locked, and reads stored locks defensively", () => {
    expect(DEFAULT_LOCKS).toEqual({ venue: true, tables: false, furniture: false, decor: false, notes: false });
    expect(parseLocks({ venue: false, tables: true, decor: "yes" })).toEqual({ venue: false, tables: true, furniture: false, decor: false, notes: false });
    expect(parseLocks(null)).toEqual(DEFAULT_LOCKS);
    expect(parseLocks("x")).toEqual(DEFAULT_LOCKS);
  });
});

describe("bodies", () => {
  it("keys round-trip", () => {
    expect(parseKey(itemKey("table", "abc"))).toEqual({ kind: "table", id: "abc" });
    expect(parseKey(itemKey("fixture", "x:y"))).toEqual({ kind: "fixture", id: "x:y" });
    expect(parseKey("nope")).toBeNull();
  });

  it("a table has a footprint, a hit area with its chairs, and the Tables layer", () => {
    const b = tableBody(table("a", 500, 500))!;
    const foot = boundsOf(b.poly);
    const hit = boundsOf(b.hit);
    expect(hit.x1 - hit.x0).toBeGreaterThan(foot.x1 - foot.x0);
    expect(b.layer).toBe("tables");
    expect((foot.x0 + foot.x1) / 2).toBeCloseTo(500);
  });

  it("a table with no place in the room is not a body", () => {
    expect(tableBody(table("a", 0, 0, { pos_x_cm: null, pos_y_cm: null } as Partial<SeatingTable>))).toBeNull();
  });

  it("décor is on the décor layer, furniture on the furniture layer", () => {
    expect(fixtureBody(fixture("c", 0, 0)).layer).toBe("decor");
    expect(fixtureBody(fixture("d", 0, 0, { kind: "dance_floor" })).layer).toBe("furniture");
    expect(fixtureBody(fixture("t", 0, 0, { kind: "tree" })).layer).toBe("furniture");
  });

  it("a turned fixture's bounds are its rotated outline", () => {
    const b = fixtureBody(fixture("d", 100, 100, { kind: "dance_floor", width_cm: 200, depth_cm: 100, rotation_deg: 90 }));
    const box = boundsOf(b.poly);
    expect(box.x1 - box.x0).toBeCloseTo(100);
    expect(box.y1 - box.y0).toBeCloseTo(200);
  });
});

describe("selection box", () => {
  const bodies = [square("a", 100, 100), square("b", 300, 100), square("c", 100, 400)];

  it("takes everything it touches", () => {
    expect(boxHits(bodies, boxFrom({ x: 0, y: 0 }, { x: 320, y: 120 }), "touch")).toEqual(["a", "b"]);
    // Only grazing b's edge still counts.
    expect(boxHits(bodies, boxFrom({ x: 0, y: 0 }, { x: 260, y: 60 }), "touch")).toEqual(["a", "b"]);
  });

  it("with Alt, only what it fully holds", () => {
    expect(boxHits(bodies, boxFrom({ x: 0, y: 0 }, { x: 260, y: 160 }), "contain")).toEqual(["a"]);
    expect(boxHits(bodies, boxFrom({ x: 0, y: 0 }, { x: 360, y: 160 }), "contain")).toEqual(["a", "b"]);
  });

  it("works whichever way the box was dragged", () => {
    expect(boxHits(bodies, boxFrom({ x: 320, y: 120 }, { x: 0, y: 0 }), "touch")).toEqual(["a", "b"]);
  });

  it("a box inside a big item still picks it", () => {
    const floor = [square("floor", 500, 500, 1000)];
    expect(boxHits(floor, boxFrom({ x: 480, y: 480 }, { x: 520, y: 520 }), "touch")).toEqual(["floor"]);
  });

  it("skips what is held still", () => {
    const held = [square("a", 100, 100, 100, { locked: true }), square("b", 300, 100)];
    expect(boxHits(held, boxFrom({ x: 0, y: 0 }, { x: 400, y: 200 }), "touch")).toEqual(["b"]);
  });

  it("a table is picked by its chairs too", () => {
    const t = tableBody(table("t", 500, 500))!;
    const footprint = boundsOf(t.poly);
    // Just outside the table's top, where its chairs are.
    const above = boxFrom({ x: 480, y: footprint.y0 - 40 }, { x: 520, y: footprint.y0 - 30 });
    expect(boxHits([t], above, "touch")).toEqual([t.key]);
  });

  it("selects every item of the same kind and size", () => {
    const rounds = [tableBody(table("a", 0, 0))!, tableBody(table("b", 400, 0))!, tableBody(table("c", 800, 0, { capacity: 10 }))!];
    const candles = [fixtureBody(fixture("k1", 0, 0)), fixtureBody(fixture("k2", 50, 0)), fixtureBody(fixture("k3", 90, 0, { width_cm: 80 }))];
    const all = [...rounds, ...candles];
    expect(selectSimilar(all, ["t:a"])).toEqual(["t:a", "t:b"]);
    expect(selectSimilar(all, ["f:k1"])).toEqual(["f:k1", "f:k2"]);
    expect(selectSimilar(all, ["t:a", "f:k1"])).toEqual(["t:a", "t:b", "f:k1", "f:k2"]);
    expect(selectSimilar(all, [])).toEqual([]);
  });
});

describe("align, space, grid", () => {
  const set = [square("a", 100, 100, 100), square("b", 400, 300, 200), square("c", 800, 150, 100)];

  it("aligns to the selection's outline", () => {
    // a is x 50–150, y 50–150; b is x 300–500, y 200–400; c is x 750–850, y 100–200.
    // So the outline is x 50–850, y 50–400.
    expect(alignBodies(set, "left").get("b")).toEqual({ dx: -250, dy: 0 });
    expect(alignBodies(set, "right").get("a")).toEqual({ dx: 700, dy: 0 });
    expect(alignBodies(set, "top").get("b")).toEqual({ dx: 0, dy: -150 });
    expect(alignBodies(set, "bottom").get("a")).toEqual({ dx: 0, dy: 250 });
    // The outline's centre is x 450, y 225.
    expect(alignBodies(set, "centre").get("a")).toEqual({ dx: 350, dy: 0 });
    expect(alignBodies(set, "middle").get("c")).toEqual({ dx: 0, dy: 75 });
  });

  it("does nothing for one", () => {
    expect(alignBodies([set[0]!], "left").size).toBe(0);
    expect(distributeBodies(set.slice(0, 2), "x").size).toBe(0);
    expect(gridBodies([set[0]!], 20).size).toBe(0);
  });

  it("spaces evenly across, keeping the outermost where they are", () => {
    const d = distributeBodies(set, "x");
    // x extents 50–150, 300–500, 750–850: sizes 400, outline 800, so two gaps of 200.
    expect(d.get("a")).toEqual({ dx: 0, dy: 0 });
    expect(d.get("b")).toEqual({ dx: 50 + 0, dy: 0 }); // 150 + 200 = 350, from 300
    expect(d.get("c")).toEqual({ dx: 0, dy: 0 }); // 550 + ... = 750
    const moved = set.map((b) => {
      const m = d.get(b.key)!;
      return boundsOf(b.poly.map((p) => ({ x: p.x + m.dx, y: p.y + m.dy })));
    });
    expect(moved[1]!.x0 - moved[0]!.x1).toBeCloseTo(moved[2]!.x0 - moved[1]!.x1);
  });

  it("spaces evenly down", () => {
    const col = [square("a", 100, 100), square("b", 100, 150), square("c", 100, 600)];
    const d = distributeBodies(col, "y");
    const moved = col.map((b) => boundsOf(b.poly.map((p) => ({ x: p.x, y: p.y + d.get(b.key)!.dy }))));
    expect(moved[1]!.y0 - moved[0]!.y1).toBeCloseTo(moved[2]!.y0 - moved[1]!.y1);
    expect(d.get("a")).toEqual({ dx: 0, dy: 0 });
  });

  it("arranges in a grid, reading order, with the gap asked for", () => {
    const four = [square("a", 0, 0), square("b", 500, 20), square("c", 30, 500), square("d", 520, 480)];
    const g = gridBodies(four, 50, 2);
    const placed = new Map(four.map((b) => [b.key, { x: b.x + g.get(b.key)!.dx, y: b.y + g.get(b.key)!.dy }]));
    // Cells are 100 + 50 apart, starting at the outline's top-left (-50, -50).
    expect(placed.get("a")).toEqual({ x: 0, y: 0 });
    expect(placed.get("b")).toEqual({ x: 150, y: 0 });
    expect(placed.get("c")).toEqual({ x: 0, y: 150 });
    expect(placed.get("d")).toEqual({ x: 150, y: 150 });
  });

  it("makes the squarest grid when no columns are given", () => {
    const nine = Array.from({ length: 9 }, (_, i) => square(`s${i}`, i * 700, (i % 3) * 13));
    const g = gridBodies(nine, 0);
    const xs = new Set(nine.map((b) => b.x + g.get(b.key)!.dx));
    expect(xs.size).toBe(3);
  });

  it("keeps a group inside the room by its centres", () => {
    const b = [{ x: 100, y: 100 }, { x: 500, y: 300 }];
    expect(clampDelta(b, { dx: -300, dy: 0 }, 2000, 1500)).toEqual({ dx: -100, dy: 0 });
    expect(clampDelta(b, { dx: 5000, dy: 5000 }, 2000, 1500)).toEqual({ dx: 1500, dy: 1200 });
    expect(clampDelta(b, { dx: 10, dy: -10 }, 2000, 1500)).toEqual({ dx: 10, dy: -10 });
    expect(clampDelta([], { dx: 7, dy: 8 }, 2000, 1500)).toEqual({ dx: 7, dy: 8 });
  });
});

describe("snap guides", () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

  it("snaps to a neighbour's edge and says what it lined up with", () => {
    const r = snapGuides(box(203, 500, 303, 600), [box(0, 0, 100, 100), box(200, 200, 300, 300)], 8);
    expect(r.dx).toBe(-3);
    expect(r.dy).toBe(0);
    expect(r.guides.some((g) => g.axis === "x" && g.at === 200 && g.kind === "edge")).toBe(true);
    // The line runs the length between the two boxes.
    const g = r.guides.find((x) => x.axis === "x")!;
    expect(g.from).toBe(200);
    expect(g.to).toBe(600);
  });

  it("snaps centre to centre", () => {
    const r = snapGuides(box(40, 500, 160, 560), [box(0, 0, 200, 100)], 8);
    // Centres: 100 and 100 already; nothing to move, but it is a centre guide.
    expect(r.dx).toBe(0);
    expect(r.guides.some((g) => g.axis === "x" && g.at === 100 && g.kind === "centre")).toBe(true);
    const off = snapGuides(box(44, 500, 164, 560), [box(0, 0, 200, 100)], 8);
    expect(off.dx).toBe(-4);
  });

  it("snaps both axes at once", () => {
    const r = snapGuides(box(204, 305, 304, 405), [box(200, 300, 300, 400)], 8);
    expect(r.dx).toBe(-4);
    expect(r.dy).toBe(-5);
    expect(r.guides.length).toBeGreaterThanOrEqual(2);
  });

  it("lets two tables abut: one's right edge meets the other's left", () => {
    const r = snapGuides(box(306, 0, 406, 100), [box(100, 0, 300, 100)], 8);
    expect(r.dx).toBe(-6);
  });

  it("does nothing when nothing is close", () => {
    const r = snapGuides(box(500, 500, 600, 600), [box(0, 0, 100, 100)], 8);
    expect(r).toEqual({ dx: 0, dy: 0, x: false, y: false, guides: [] });
    expect(snapGuides(box(0, 0, 10, 10), [], 8)).toEqual({ dx: 0, dy: 0, x: false, y: false, guides: [] });
  });

  it("says which axes matched, so the other can fall back to the grid", () => {
    // Close to a neighbour's edge in x only.
    const r = snapGuides(box(203, 900, 303, 1000), [box(200, 0, 300, 100)], 8);
    expect(r.x).toBe(true);
    expect(r.y).toBe(false);
    expect(r.dy).toBe(0);
    // Already exactly lined up is still a match, with nothing to move.
    const exact = snapGuides(box(200, 900, 300, 1000), [box(200, 0, 300, 100)], 8);
    expect(exact.x).toBe(true);
    expect(exact.dx).toBe(0);
  });

  it("takes the closest match, not the first", () => {
    const r = snapGuides(box(205, 500, 305, 600), [box(210, 0, 290, 100), box(203, 100, 400, 200)], 8);
    // x0 = 205: another's edge at 203 is 2 away; 210 is 5 away.
    expect(r.dx).toBe(-2);
  });

  it("keeps the gap two others already have: a third in the same row", () => {
    // Two 100-wide tables 50 apart; a third coming in past the second snaps to 50 away.
    const row = [box(0, 0, 100, 100), box(150, 0, 250, 100)];
    const r = snapGuides(box(297, 10, 397, 110), row, 6);
    expect(r.dx).toBe(3);
    const gaps = r.guides.filter((g) => g.kind === "spacing");
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.gap === 50)).toBe(true);
    // They run across the gaps they measure.
    expect(gaps.map((g) => [g.from, g.to]).sort()).toEqual([
      [100, 150],
      [250, 300],
    ]);
  });

  it("centres between two with equal gaps either side", () => {
    // 100 and 500 are 400 apart; a 100-wide box between them has gaps of 150.
    const r = snapGuides(box(252, 10, 352, 110), [box(0, 0, 100, 100), box(500, 0, 600, 100)], 6);
    expect(r.dx).toBe(-2);
    expect(r.guides.filter((g) => g.kind === "spacing").map((g) => g.gap)).toEqual([150, 150]);
  });

  it("works down a column the same way", () => {
    const col = [box(0, 0, 100, 100), box(0, 150, 100, 250)];
    const r = snapGuides(box(10, 297, 110, 397), col, 6);
    expect(r.dy).toBe(3);
    expect(r.dx).toBe(0);
    // A gap between boxes stacked vertically is measured by a vertical line, so its axis is x.
    const gaps = r.guides.filter((g) => g.kind === "spacing");
    expect(gaps).toHaveLength(2);
    expect(gaps.every((g) => g.axis === "x" && g.gap === 50)).toBe(true);
    expect(gaps.map((g) => [g.from, g.to]).sort()).toEqual([
      [100, 150],
      [250, 300],
    ]);
  });

  it("prefers an edge over a spacing match when both are as close", () => {
    const r = snapGuides(box(103, 0, 203, 100), [box(0, 0, 100, 100), box(300, 0, 400, 100)], 6);
    // Abutting the first (dx -3) and the equal-gap spot (centre between: gap 100 → x0 = 100) are the same place.
    expect(r.dx).toBe(-3);
    expect(r.guides.length).toBeGreaterThan(0);
  });

  it("stays quick with a 20-table selection in a room of 40", () => {
    const others = Array.from({ length: 20 }, (_, i) => box((i % 5) * 400, Math.floor(i / 5) * 400, (i % 5) * 400 + 180, Math.floor(i / 5) * 400 + 180));
    const moving = box(2100, 100, 5000, 1700);
    const start = performance.now();
    for (let i = 0; i < 200; i++) snapGuides(moving, others, 8);
    // 200 drag frames in well under a second: a frame is a few milliseconds at worst.
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
