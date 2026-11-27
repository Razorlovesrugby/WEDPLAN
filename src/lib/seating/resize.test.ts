import { describe, expect, it } from "vitest";
import { FIXTURE_LIMITS, TABLE_LIMITS, allInRoom, handleCursor, handlePoints, handlesVisible, resizeBody, turnAbout, type Resizable } from "./resize";

const box = (over: Partial<Resizable> = {}): Resizable => ({ x: 500, y: 500, rotation: 0, w: 200, d: 100, limits: FIXTURE_LIMITS, ...over });

describe("resizeBody (spec 60 C.1)", () => {
  it("drags the east edge: the west edge stays put and the centre follows", () => {
    // West edge at x = 400. Pointer at 700 makes it 300 wide; the centre is 550.
    expect(resizeBody(box(), "e", { x: 700, y: 500 })).toEqual({ x: 550, y: 500, w: 300, d: 100 });
  });

  it("drags the west edge the other way", () => {
    // East edge at 600. Pointer at 300 makes it 300 wide; the centre is 450.
    expect(resizeBody(box(), "w", { x: 300, y: 500 })).toEqual({ x: 450, y: 500, w: 300, d: 100 });
  });

  it("drags a corner: both sizes change and the opposite corner stays", () => {
    // Opposite corner (nw) at 400,450. Pointer at 700,650: 300 × 200, centre 550,550.
    expect(resizeBody(box(), "se", { x: 700, y: 650 })).toEqual({ x: 550, y: 550, w: 300, d: 200 });
  });

  it("snaps sizes to 5 cm", () => {
    const r = resizeBody(box(), "e", { x: 703, y: 500 });
    expect(r.w % 5).toBe(0);
    expect(r.w).toBe(305);
    expect(resizeBody(box(), "e", { x: 703, y: 500 }, { step: 0 }).w).toBe(303);
  });

  it("Alt resizes about the centre", () => {
    expect(resizeBody(box(), "e", { x: 700, y: 500 }, { alt: true })).toEqual({ x: 500, y: 500, w: 400, d: 100 });
    expect(resizeBody(box(), "w", { x: 300, y: 500 }, { alt: true })).toEqual({ x: 500, y: 500, w: 400, d: 100 });
  });

  it("Shift on a corner keeps the proportions", () => {
    const r = resizeBody(box(), "se", { x: 700, y: 520 }, { shift: true });
    expect(r.w / r.d).toBeCloseTo(2, 1);
    expect(r.w).toBe(300);
    expect(r.d).toBe(150);
  });

  it("Shift on an edge scales the other side about its centre", () => {
    // East edge to 700 → 300 wide, so 150 deep; the depth grows evenly each side, the centre's y is unchanged.
    expect(resizeBody(box(), "e", { x: 700, y: 500 }, { shift: true })).toEqual({ x: 550, y: 500, w: 300, d: 150 });
  });

  it("keeps sizes inside the limits (fixtures 20 to 5000, tables 40 to 2000)", () => {
    expect(resizeBody(box(), "e", { x: 410, y: 500 }).w).toBe(20);
    expect(resizeBody(box(), "e", { x: 90_000, y: 500 }).w).toBe(5000);
    const t = box({ limits: TABLE_LIMITS, w: 150, d: 150 });
    expect(resizeBody(t, "se", { x: 400, y: 400 }).w).toBe(40);
    expect(resizeBody(t, "se", { x: 90_000, y: 90_000 }).w).toBe(2000);
  });

  it("the opposite edge stays put when a limit stops the size", () => {
    const r = resizeBody(box(), "e", { x: 90_000, y: 500 });
    expect(r.x - r.w / 2).toBe(400);
  });

  it("works in the body's own frame when it is turned", () => {
    // Turned 90°: its own x axis points down the plan. Dragging the "e" handle (now at the bottom) lengthens it downwards.
    const r = resizeBody(box({ rotation: 90 }), "e", { x: 500, y: 700 });
    expect(r.w).toBe(300);
    // The "far" (top) edge stays at y = 400; the centre moved down by half the growth.
    expect(r.y).toBe(550);
    expect(r.x).toBe(500);
  });

  it("a round or square table has one handle for its diameter and keeps its centre", () => {
    const t = box({ w: 150, d: 150, limits: TABLE_LIMITS, single: "round" });
    expect(handlePoints(t)).toHaveLength(1);
    expect(resizeBody(t, "se", { x: 700, y: 500 })).toEqual({ x: 500, y: 500, w: 400, d: 400 });
    expect(resizeBody(t, "se", { x: 400, y: 440 })).toEqual({ x: 500, y: 500, w: 200, d: 200 });
  });

  it("snaps the moving edge to a neighbour's line when one is close, and says nothing for the grid then", () => {
    // East edge pulled to 733; a neighbour's edge is at 730 (within 8): the width is 330, not the grid's 335.
    const r = resizeBody(box(), "e", { x: 733, y: 500 }, { targets: { xs: [730], ys: [] }, threshold: 8 });
    expect(r.w).toBe(330);
    // Out of range: the grid.
    expect(resizeBody(box(), "e", { x: 733, y: 500 }, { targets: { xs: [760], ys: [] }, threshold: 8 }).w).toBe(335);
  });

  it("only snaps to neighbours when the body is square to the room", () => {
    const r = resizeBody(box({ rotation: 30 }), "e", { x: 733, y: 500 }, { targets: { xs: [730], ys: [] }, threshold: 8 });
    expect(r.w % 5).toBe(0);
  });

  it("snaps a turned-90° body's moving edge to a y line", () => {
    const r = resizeBody(box({ rotation: 90 }), "e", { x: 500, y: 733 }, { targets: { xs: [], ys: [730] }, threshold: 8 });
    expect(r.w).toBe(330);
  });
});

describe("handles", () => {
  it("eight handles round the outline, at the corners and the middles of the edges", () => {
    const hs = handlePoints(box());
    expect(hs).toHaveLength(8);
    const at = (id: string) => hs.find((h) => h.id === id)!.at;
    expect(at("nw")).toEqual({ x: 400, y: 450 });
    expect(at("e")).toEqual({ x: 600, y: 500 });
    expect(at("s").y).toBe(550);
  });

  it("go with the body when it is turned", () => {
    const e = handlePoints(box({ rotation: 90 })).find((h) => h.id === "e")!.at;
    expect(Math.round(e.x)).toBe(500);
    expect(Math.round(e.y)).toBe(600);
  });

  it("are shown only when the item is big enough on screen", () => {
    // 30 cm lantern at fit zoom: 2 cm per pixel → 15 px: no handles. At 0.5 cm/px it is 60 px: handles.
    expect(handlesVisible({ w: 30, d: 30 }, 2)).toBe(false);
    expect(handlesVisible({ w: 30, d: 30 }, 0.5)).toBe(true);
    expect(handlesVisible({ w: 400, d: 30 }, 2)).toBe(false);
    expect(handlesVisible({ w: 150, d: 150, single: "round" }, 2)).toBe(true);
    expect(handlesVisible({ w: 150, d: 150 }, 0)).toBe(false);
  });

  it("show the cursor that matches the way they pull", () => {
    expect(handleCursor("e", 0)).toBe("ew-resize");
    expect(handleCursor("n", 0)).toBe("ns-resize");
    expect(handleCursor("se", 0)).toBe("nwse-resize");
    expect(handleCursor("ne", 0)).toBe("nesw-resize");
    expect(handleCursor("e", 90)).toBe("ns-resize");
    expect(handleCursor("se", 90)).toBe("nesw-resize");
  });
});

describe("turnAbout (spec 60 C.2)", () => {
  const items = [
    { key: "t:a", x: 600, y: 500, rotation: 0 },
    { key: "t:b", x: 400, y: 500, rotation: 0 },
  ];
  it("moves positions round the centre and turns each by the same angle", () => {
    const [a, b] = turnAbout(items, { x: 500, y: 500 }, 90);
    expect(a).toEqual({ key: "t:a", x: 500, y: 600, rotation: 90 });
    expect(b).toEqual({ key: "t:b", x: 500, y: 400, rotation: 90 });
  });

  it("keeps the formation's shape: distances between things don't change", () => {
    const moved = turnAbout(items, { x: 480, y: 510 }, 37);
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(moved[0]!, moved[1]!)).toBeCloseTo(d(items[0]!, items[1]!), -0.5);
  });

  it("a full turn comes back to the start, and rotations stay in range", () => {
    const back = turnAbout(turnAbout(items, { x: 500, y: 500 }, 180), { x: 500, y: 500 }, 180);
    expect(back.map((m) => [m.x, m.y, m.rotation])).toEqual([[600, 500, 0], [400, 500, 0]]);
    expect(turnAbout([{ key: "x", x: 1, y: 1, rotation: 350 }], { x: 1, y: 1 }, 30)[0]!.rotation).toBe(20);
    expect(turnAbout([{ key: "x", x: 1, y: 1, rotation: 10 }], { x: 1, y: 1 }, -30)[0]!.rotation).toBe(340);
  });

  it("can tell when the turn would put something outside the room", () => {
    expect(allInRoom([{ x: 10, y: 10 }, { x: 1990, y: 1490 }], 2000, 1500)).toBe(true);
    expect(allInRoom([{ x: -1, y: 10 }], 2000, 1500)).toBe(false);
    expect(allInRoom([{ x: 10, y: 1501 }], 2000, 1500)).toBe(false);
  });
});
