import { describe, expect, it } from "vitest";
import {
  constrainAngle,
  emptyDrawing,
  formatLength,
  parseDrawing,
  polygonArea,
  snapCorner,
  wallBounds,
  wallLength,
  wallRadius,
  type Wall,
} from "./drawing";
import { localSeatPositions, readSegments, tableSize, tablePolygon, seatPositions, FIXTURE_DEFAULTS, polygonsOverlap } from "./geometry";
import { classifyWalkway, DEFAULT_SETTINGS, parseSettings } from "./plan-settings";
import { computeService, parseMenu, typedPlatters, type ServiceSeat, type ServiceTable } from "./service";
import { chairDetail, chairMarks, initials, readableText } from "./chairs";
import { colourLegend, guestColour, parseColourBy, serialiseColourBy } from "./colour";
import type { SeatingGuest } from "./model";
import { computeItems, effectiveStyle, itemsCsv, mergeFinal, parseStyleChanges, parseStyleCentre, parseStylePlace, type ItemTable, type TableStyle } from "./items";

const wall = (id: string, a: [number, number], b: [number, number], over: Partial<Wall> = {}): Wall => ({ id, a, b, thick: 20, bulge: 0, ...over });

describe("parseDrawing", () => {
  it("reads nothing as an empty drawing", () => {
    expect(parseDrawing(null)).toEqual({ ok: true, drawing: emptyDrawing() });
    expect(parseDrawing({})).toEqual({ ok: true, drawing: emptyDrawing() });
  });

  it("keeps a valid drawing, rounding and clamping what it should", () => {
    const r = parseDrawing({
      walls: [{ id: "w1", a: [0, 0], b: [500.4, 0], thick: 999, bulge: 40 }],
      openings: [{ id: "d1", kind: "double_door", wall: "w1", at: 2 }],
      markers: [{ id: "m1", kind: "column", x: 100, y: 100, rot: -90 }],
      areas: [{ id: "a1", name: " Terrace ", points: [[0, 0], [100, 0], [100, 100]], tint: "#aabbcc", outdoor: true }],
      labels: [{ id: "l1", text: "Bar", x: 5, y: 5, size: 4 }],
      dimensions: [{ id: "k1", a: [0, 0], b: [100, 0] }],
      extra: "dropped",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drawing.walls[0]).toEqual({ id: "w1", a: [0, 0], b: [500, 0], thick: 100, bulge: 40 });
    expect(r.drawing.openings[0]).toMatchObject({ kind: "double_door", at: 1, width: 180, swing: "in", hinge: "a" });
    expect(r.drawing.markers[0]!.rot).toBe(270);
    expect(r.drawing.areas[0]).toMatchObject({ name: "Terrace", outdoor: true, tint: "#aabbcc" });
    expect(r.drawing.labels[0]!.size).toBe(12);
    expect("extra" in r.drawing).toBe(false);
  });

  it.each([
    ["a non-object", [] as unknown],
    ["walls that aren't a list", { walls: {} }],
    ["a wall with no corners", { walls: [{ id: "w" }] }],
    ["a zero-length wall", { walls: [{ id: "w", a: [1, 1], b: [1, 1] }] }],
    ["a corner out of range", { walls: [{ id: "w", a: [0, 0], b: [9e9, 0] }] }],
    ["a door on a wall that isn't there", { openings: [{ id: "d", kind: "door", wall: "nope" }] }],
    ["an unknown opening kind", { walls: [{ id: "w", a: [0, 0], b: [1, 0] }], openings: [{ id: "d", kind: "portal", wall: "w" }] }],
    ["two items with one id", { walls: [{ id: "x", a: [0, 0], b: [10, 0] }], markers: [{ id: "x", kind: "column", x: 0, y: 0 }] }],
    ["an area with two corners", { areas: [{ id: "a", name: "T", points: [[0, 0], [1, 1]] }] }],
    ["an area with no name", { areas: [{ id: "a", name: " ", points: [[0, 0], [1, 0], [1, 1]] }] }],
    ["a label with no text", { labels: [{ id: "l", text: "", x: 0, y: 0 }] }],
    ["an id with a space", { walls: [{ id: "a b", a: [0, 0], b: [1, 0] }] }],
  ])("refuses %s", (_label, raw) => {
    expect(parseDrawing(raw).ok).toBe(false);
  });

  it("caps the number of walls", () => {
    const walls = Array.from({ length: 401 }, (_, i) => ({ id: `w${i}`, a: [0, 0], b: [1, 0] }));
    expect(parseDrawing({ walls }).ok).toBe(false);
  });
});

describe("wall maths", () => {
  it("measures a straight wall and a bent one", () => {
    expect(wallLength(wall("w", [0, 0], [300, 400]))).toBe(500);
    expect(wallRadius(wall("w", [0, 0], [300, 400]))).toBeNull();
    // a semicircle: chord 200, sagitta 100 → radius 100, length π·100
    const semi = wall("w", [0, 0], [200, 0], { bulge: 100 });
    expect(wallRadius(semi)).toBeCloseTo(100, 5);
    expect(wallLength(semi)).toBeCloseTo(Math.PI * 100, 3);
    // a shallow arc is a little longer than its chord
    expect(wallLength(wall("w", [0, 0], [1000, 0], { bulge: 50 }))).toBeGreaterThan(1000);
  });

  it("boxes the walls, arcs included", () => {
    expect(wallBounds([])).toBeNull();
    expect(wallBounds([wall("a", [0, 0], [100, 0]), wall("b", [100, 0], [100, 50])])).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    const b = wallBounds([wall("a", [0, 0], [200, 0], { bulge: 80 })])!;
    expect(b.maxY).toBeCloseTo(80, 5);
  });

  it("measures an area", () => {
    expect(polygonArea([[0, 0], [100, 0], [100, 50], [0, 50]])).toBe(5000);
  });

  it("snaps to a nearby corner before the grid", () => {
    const walls = [wall("a", [0, 0], [510, 0])];
    expect(snapCorner([505, 8], walls, 25)).toEqual([510, 0]);
    expect(snapCorner([260, 130], walls, 25)).toEqual([250, 125]);
    expect(snapCorner([261, 131], walls, 0)).toEqual([261, 131]);
  });

  it("keeps a line to 45 degree steps", () => {
    expect(constrainAngle([0, 0], [100, 12])).toEqual([101, 0]); // the length is kept
    expect(constrainAngle([0, 0], [80, 90])).toEqual([85, 85]);
    expect(constrainAngle([0, 0], [0, 0])).toEqual([0, 0]);
  });

  it("writes lengths in metres", () => {
    expect(formatLength(85)).toBe("85 cm");
    expect(formatLength(660)).toBe("6.6 m");
    expect(formatLength(2400)).toBe("24 m");
    expect(formatLength(1234)).toBe("12.34 m");
  });
});

describe("new table shapes", () => {
  const base = { ends_seated: false, width_cm: null, length_cm: null, pos_x_cm: 0, pos_y_cm: 0, rotation_deg: 0 };

  it.each(["sweetheart", "oval", "half_moon", "serpentine"] as const)("%s gives one position per chair", (shape) => {
    for (const capacity of [2, 6, 10]) {
      const seats = localSeatPositions({ ...base, shape, capacity });
      expect(seats).toHaveLength(capacity);
      for (const p of seats) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("sizes an oval from its chairs", () => {
    const s = tableSize({ ...base, shape: "oval", capacity: 10 });
    expect(s.width).toBe(110);
    expect(s.length).toBeGreaterThan(200);
    expect(tableSize({ ...base, shape: "oval", capacity: 2 }).length).toBe(160);
  });

  it("seats a half-moon on the curve only, above its flat side", () => {
    const { width } = tableSize({ ...base, shape: "half_moon", capacity: 6 });
    for (const p of localSeatPositions({ ...base, shape: "half_moon", capacity: 6 })) expect(p.y).toBeLessThan(width / 2);
  });

  it("seats a sweetheart table on one side", () => {
    const ys = new Set(localSeatPositions({ ...base, shape: "sweetheart", capacity: 2 }).map((p) => p.y));
    expect(ys.size).toBe(1);
    expect([...ys][0]!).toBeLessThan(0);
  });

  it("lays ceremony rows out front to back with the aisle in the middle", () => {
    const t = { ...base, shape: "rows" as const, capacity: 24, rows_count: 4, aisle_cm: 120 };
    const seats = localSeatPositions(t);
    expect(seats).toHaveLength(24);
    expect(tableSize(t)).toEqual({ length: 6 * 50 + 120, width: 4 * 55 });
    const rowOf = (i: number) => Math.floor(i / 6);
    expect(seats[0]!.y).toBeLessThan(seats[6]!.y);
    expect(rowOf(23)).toBe(3);
    // the middle gap between the left and right block of the first row is the aisle
    const first = seats.slice(0, 6).map((p) => p.x);
    expect(first[3]! - first[2]!).toBe(50 + 120);
  });

  it("fills a last short row of ceremony chairs", () => {
    const seats = localSeatPositions({ ...base, shape: "rows", capacity: 10, rows_count: 3, aisle_cm: 100 });
    expect(seats).toHaveLength(10);
  });

  it("builds a banquet run from straight pieces", () => {
    expect(readSegments([{ len: 300, turn: 0 }, { len: 10, turn: 0 }, "x", { len: 600, turn: 90 }])).toEqual([
      { len: 300, turn: 0 },
      { len: 600, turn: 90 },
    ]);
    expect(readSegments("nope")).toEqual([]);
    const u = { ...base, shape: "banquet" as const, capacity: 24, segments: [{ len: 300, turn: 0 }, { len: 600, turn: 90 }, { len: 300, turn: 90 }] };
    const seats = localSeatPositions(u);
    expect(seats).toHaveLength(24);
    const size = tableSize(u);
    expect(size.length).toBeGreaterThan(300);
    expect(size.width).toBeGreaterThan(600);
    // an empty run is one straight piece sized for its capacity
    expect(localSeatPositions({ ...base, shape: "banquet", capacity: 12, segments: null })).toHaveLength(12);
  });

  it("places and rotates them like any table", () => {
    const t = { ...base, shape: "oval" as const, capacity: 8, pos_x_cm: 500, pos_y_cm: 400, rotation_deg: 90 };
    expect(seatPositions(t)).toHaveLength(8);
    const poly = tablePolygon(t)!;
    expect(poly).toHaveLength(24);
    expect(polygonsOverlap(poly, tablePolygon({ ...t, pos_x_cm: 5000 })!)).toBe(false);
    expect(polygonsOverlap(poly, tablePolygon({ ...t, pos_x_cm: 520 })!)).toBe(true);
  });

  it("has a default size for every décor kind", () => {
    for (const k of ["lounge", "kids_area", "floral_arch", "garland", "aisle_flowers", "candles", "plant", "sign", "lantern", "drape", "marquee", "tree", "path", "pool", "garden_bed", "slope", "custom"]) {
      expect(FIXTURE_DEFAULTS[k]).toBeTruthy();
    }
  });
});

describe("plan settings", () => {
  it("defaults, clamps and ignores junk", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings({ walkway: { comfortable: 100, tight: 150 }, tallCm: 9999, longTableCm: 240, defaultSizes: { plant: { width: 80, depth: 80 }, bad: 3 } });
    expect(s.walkway).toEqual({ comfortable: 100, tight: 100 });
    expect(s.tallCm).toBe(300);
    expect(s.longTableCm).toBe(240);
    expect(s.defaultSizes).toEqual({ plant: { width: 80, depth: 80 } });
  });

  it("classifies a walkway by the plan's thresholds", () => {
    expect(classifyWalkway(120, DEFAULT_SETTINGS)).toBe("comfortable");
    expect(classifyWalkway(100, DEFAULT_SETTINGS)).toBe("tight");
    expect(classifyWalkway(89, DEFAULT_SETTINGS)).toBe("too_tight");
    expect(classifyWalkway(89, { walkway: { comfortable: 80, tight: 60 } })).toBe("comfortable");
  });
});

describe("parseMenu", () => {
  const good = [{ id: "c1", name: "Mains", style: "shared", dishes: [{ id: "d1", name: "Lamb", tags: ["gluten_free", " "], vessel: "board", serves: 6 }] }];

  it("reads a menu", () => {
    const r = parseMenu(good);
    expect(r).toEqual({ ok: true, menu: [{ id: "c1", name: "Mains", style: "shared", dishes: [{ id: "d1", name: "Lamb", tags: ["gluten_free"], vessel: "board", serves: 6 }] }] });
    expect(parseMenu(null)).toEqual({ ok: true, menu: [] });
  });

  it("defaults the vessel, allows no serves yet, and null style means the plan's", () => {
    const r = parseMenu([{ id: "c", name: "Dessert", dishes: [{ id: "d", name: "Pav" }] }]);
    expect(r).toEqual({ ok: true, menu: [{ id: "c", name: "Dessert", style: null, dishes: [{ id: "d", name: "Pav", tags: [], vessel: "platter", serves: null }] }] });
  });

  it.each([
    ["not a list", {}],
    ["a style that isn't one of four", [{ id: "c", name: "A", style: "tapas" }]],
    ["serves of zero", [{ id: "c", name: "A", dishes: [{ id: "d", name: "x", serves: 0 }] }]],
    ["serves that isn't whole", [{ id: "c", name: "A", dishes: [{ id: "d", name: "x", serves: 2.5 }] }]],
    ["a repeated id", [{ id: "c", name: "A", dishes: [{ id: "c", name: "x" }] }]],
    ["a nameless dish", [{ id: "c", name: "A", dishes: [{ id: "d", name: " " }] }]],
  ])("refuses %s", (_l, raw) => {
    expect(parseMenu(raw as unknown).ok).toBe(false);
  });

  it("caps courses and dishes", () => {
    expect(parseMenu(Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, name: "x" }))).ok).toBe(false);
    const dishes = Array.from({ length: 41 }, (_, i) => ({ id: `d${i}`, name: "x" }));
    expect(parseMenu([{ id: "c", name: "x", dishes }]).ok).toBe(false);
  });
});

describe("computeService", () => {
  const table = (id: string, over: Partial<ServiceTable> = {}): ServiceTable => ({
    id, shape: "round", capacity: 10, ends_seated: false, width_cm: null, length_cm: null, ...over,
  });
  const seat = (guestId: string, tableId: string, over: Partial<ServiceSeat> = {}): ServiceSeat => ({
    guestId, tableId, ageBand: "adult", ownPlate: {}, kidsMeal: {}, ...over,
  });
  const menu = [
    { id: "c1", name: "Mains", style: null, dishes: [{ id: "lamb", name: "Lamb", tags: [], vessel: "platter" as const, serves: 6 }, { id: "fish", name: "Fish", tags: [], vessel: "platter" as const, serves: null }] },
    { id: "c2", name: "Dessert", style: "plated" as const, dishes: [{ id: "pav", name: "Pav", tags: [], vessel: "platter" as const, serves: 4 }] },
  ];
  const seats = (n: number, tableId: string, from = 0) => Array.from({ length: n }, (_, i) => seat(`${tableId}-${from + i}`, tableId));
  const run = (over: Partial<Parameters<typeof computeService>[0]> = {}) =>
    computeService({ menu, defaultStyle: "shared", tables: [table("t1"), table("t2")], seats: [...seats(10, "t1"), ...seats(7, "t2")], settings: { longTableCm: null }, ...over });

  it("rounds platters up per dish and table, and totals them", () => {
    const mains = run().courses[0]!;
    const lamb = mains.dishes.find((d) => d.dishId === "lamb")!;
    expect(lamb.tables.map((t) => t.platters)).toEqual([2, 2]);
    expect(lamb.total).toBe(4);
    expect(lamb.needsServes).toBe(false);
  });

  it("holds back a dish that doesn't say how many it serves", () => {
    const fish = run().courses[0]!.dishes.find((d) => d.dishId === "fish")!;
    expect(fish.needsServes).toBe(true);
    expect(fish.total).toBeNull();
    expect(fish.tables.every((t) => t.platters === null)).toBe(true);
  });

  it("lists dishes only for a shared course", () => {
    const r = run();
    expect(r.courses[1]!.style).toBe("plated");
    expect(r.courses[1]!.dishes).toEqual([]);
    expect(run({ defaultStyle: "buffet" }).courses[0]!.dishes).toEqual([]);
  });

  it("leaves out own plates and kids' meals, per course", () => {
    const s = [
      ...seats(6, "t1"),
      seat("own", "t1", { ownPlate: { c1: true } }),
      seat("kid", "t1", { ageBand: "child" }),
      seat("kidShares", "t1", { ageBand: "child", kidsMeal: { c1: false } }),
      seat("ownOtherCourse", "t1", { ownPlate: { c2: true } }),
    ];
    const r = run({ tables: [table("t1")], seats: s });
    const t = r.courses[0]!.dishes[0]!.tables[0]!;
    expect(t.sharing).toBe(8); // 6 + kidShares + ownOtherCourse
    expect(r.courses[0]!.heads[0]).toEqual({ tableId: "t1", guests: 10, kidsMeals: 1, ownPlates: 1 });
    expect(t.platters).toBe(2);
  });

  it("a kids' meal wins over an own plate", () => {
    const r = run({ tables: [table("t1")], seats: [seat("k", "t1", { ageBand: "infant", ownPlate: { c1: true } })] });
    expect(r.courses[0]!.heads[0]).toMatchObject({ kidsMeals: 1, ownPlates: 0 });
  });

  it("puts two of each dish on a long table at or over the set length", () => {
    const long = table("t1", { shape: "long", capacity: 12 });
    const few = [seat("a", "t1"), seat("b", "t1")];
    expect(run({ tables: [long], seats: few, settings: { longTableCm: null } }).courses[0]!.dishes[0]!.tables[0]!.platters).toBe(1);
    expect(run({ tables: [long], seats: few, settings: { longTableCm: 240 } }).courses[0]!.dishes[0]!.tables[0]!.platters).toBe(2);
    expect(run({ tables: [long], seats: few, settings: { longTableCm: 900 } }).courses[0]!.dishes[0]!.tables[0]!.platters).toBe(1);
    // a round table is never "long"
    expect(run({ tables: [table("t1")], seats: few, settings: { longTableCm: 100 } }).courses[0]!.dishes[0]!.tables[0]!.platters).toBe(1);
  });

  it("an empty table needs no platters", () => {
    expect(run({ tables: [table("t1")], seats: [] }).courses[0]!.dishes[0]!.tables[0]!.platters).toBeNull();
  });

  it("keeps a typed count while the table's sharing guests are what they were, and flags it when they aren't", () => {
    const t = table("t1", { platter_counts: { lamb: { n: 5, at: 10 } } });
    const fresh = run({ tables: [t], seats: seats(10, "t1") });
    expect(fresh.courses[0]!.dishes[0]!.tables[0]).toMatchObject({ typed: 5, platters: 5, stale: false });
    expect(fresh.checkTables).toEqual([]);
    const moved = run({ tables: [t], seats: seats(9, "t1") });
    expect(moved.courses[0]!.dishes[0]!.tables[0]).toMatchObject({ typed: null, platters: 2, stale: true });
    expect(moved.checkTables).toEqual(["t1"]);
  });

  it("counts two utensils per platter", () => {
    expect(run().utensils).toBe(8);
  });

  it("stores a typed count with the sharing guests at the time, and clears one", () => {
    const a = typedPlatters(null, "lamb", 3, 10);
    expect(a).toEqual({ lamb: { n: 3, at: 10 } });
    expect(typedPlatters(a, "fish", 1, 10)).toEqual({ lamb: { n: 3, at: 10 }, fish: { n: 1, at: 10 } });
    expect(typedPlatters(a, "lamb", null, 10)).toEqual({});
    expect(typedPlatters({ junk: 1 }, "lamb", 1000, 4)).toEqual({ lamb: { n: 999, at: 4 } });
  });
});

describe("table styles and item totals", () => {
  const garden: TableStyle = {
    id: "s1",
    name: "Garden round",
    place: { charger: { on: true, note: "Gold rim" }, dinner_plate: { on: true }, cutlery: { on: true, count: 3 }, glasses: { on: true }, menu_card: { on: false } },
    centre: { arrangement: { on: true, note: "low garden" }, candles: { on: true, count: 6 }, runner: { on: true }, extras: [{ name: "Bud vases", count: 3 }] },
  };
  const table = (id: string, over: Partial<ItemTable> = {}): ItemTable => ({
    id, shape: "round", capacity: 8, reserved_seats: 0, style_id: "s1", style_changes: null, seated: 6, blocked: 0, ...over,
  });
  const find = (rows: ReturnType<typeof computeItems>, key: string) => rows.find((r) => r.key === key);
  const compute = (tables: ItemTable[], extra: Partial<Parameters<typeof computeItems>[0]> = {}) =>
    computeItems({ tables, styles: [garden], fixtures: [], customNames: {}, utensils: 0, ...extra });

  it("counts places by chairs and by seated guests", () => {
    const rows = compute([table("a"), table("b", { seated: 8 })]);
    expect(find(rows, "place:charger")).toMatchObject({ suggestedChairs: 16, suggestedGuests: 14, notes: ["Gold rim"] });
    expect(find(rows, "place:cutlery")).toMatchObject({ suggestedChairs: 48, suggestedGuests: 42 });
    expect(find(rows, "place:glasses")!.suggestedChairs).toBe(32);
    expect(find(rows, "place:menu_card")).toBeUndefined();
  });

  it("leaves blocked chairs out of the chair count and adds reserved seats to the guest count", () => {
    const rows = compute([table("a", { blocked: 2, reserved_seats: 1 })]);
    expect(find(rows, "place:dinner_plate")).toMatchObject({ suggestedChairs: 6, suggestedGuests: 7 });
  });

  it("counts centre items per table, runners only on long tables, and extras by their own count", () => {
    const rows = compute([table("a"), table("b", { shape: "long" })]);
    expect(find(rows, "centre:arrangement")!.suggestedChairs).toBe(2);
    expect(find(rows, "centre:candles")!.suggestedChairs).toBe(12);
    expect(find(rows, "centre:runner")!.suggestedChairs).toBe(1);
    expect(find(rows, "extra:bud-vases")).toMatchObject({ label: "Bud vases", suggestedChairs: 6 });
  });

  it("lays a table's own changes over its style", () => {
    const changes = { place: { charger: { on: false } }, centre: { arrangement: { on: true, note: "extra tall", tall: true } } };
    const rows = compute([table("a", { style_changes: changes }), table("b")]);
    expect(find(rows, "place:charger")!.suggestedChairs).toBe(8);
    expect(find(rows, "centre:arrangement")!.notes).toEqual(["extra tall", "low garden"]);
    expect(effectiveStyle(garden, changes).place.charger).toEqual({ on: false });
    expect(effectiveStyle(null, null)).toEqual({ place: {}, centre: {} });
  });

  it("a table with no style, or a style that's gone, adds nothing", () => {
    expect(compute([table("a", { style_id: null }), table("b", { style_id: "gone" })])).toEqual([]);
  });

  it("totals the room's décor by quantity, with the couple's own names", () => {
    const rows = compute([], {
      fixtures: [
        { kind: "aisle_flowers", custom_item_id: null, quantity: 12, label: null },
        { kind: "aisle_flowers", custom_item_id: null, quantity: 4, label: null },
        { kind: "floral_arch", custom_item_id: null, quantity: 1, label: null },
        { kind: "dance_floor", custom_item_id: null, quantity: 1, label: null },
        { kind: "custom", custom_item_id: "c1", quantity: 2, label: null },
      ],
      customNames: { c1: "Neon sign" },
    });
    expect(find(rows, "room:aisle_flowers")!.suggestedChairs).toBe(16);
    expect(find(rows, "room:dance_floor")).toBeUndefined();
    expect(find(rows, "room:custom:c1")).toMatchObject({ label: "Neon sign", suggestedChairs: 2 });
  });

  it("adds serving utensils and orders places, centre, room, utensils", () => {
    const rows = compute([table("a")], { utensils: 8, fixtures: [{ kind: "plant", custom_item_id: null, quantity: 3, label: null }] });
    expect(find(rows, "utensil")!.suggestedChairs).toBe(8);
    const groups = rows.map((r) => r.group);
    expect(groups).toEqual([...groups].sort((a, b) => ["place", "centre", "room", "utensil"].indexOf(a) - ["place", "centre", "room", "utensil"].indexOf(b)));
  });

  it("lays the final numbers over the suggestions", () => {
    const rows = compute([table("a")]);
    const lines = mergeFinal(rows, [
      { item_key: "place:charger", final_count: 10, suggested_chairs: 8, suggested_guests: 6, vendor_id: "v1", budget_item_id: "b1" },
      { item_key: "place:glasses", final_count: 20, suggested_chairs: 99, suggested_guests: 6, vendor_id: null, budget_item_id: null },
    ]);
    const get = (k: string) => lines.find((l) => l.key === k)!;
    expect(get("place:charger")).toMatchObject({ final: 10, status: "ok", vendorId: "v1", budgetItemId: "b1" });
    expect(get("place:glasses")).toMatchObject({ final: 20, status: "changed" });
    expect(get("place:dinner_plate")).toMatchObject({ final: null, status: "not_set" });
  });

  it("writes a CSV, quoting what needs it", () => {
    const csv = itemsCsv([{ key: "k", group: "place", label: 'Glasses, "wine"', notes: ["a", "b"], suggestedChairs: 3, suggestedGuests: 2, final: null, status: "not_set", vendorId: null, budgetItemId: null }]);
    expect(csv).toBe('Item,By chairs,By seated guests,Final,Notes\n"Glasses, ""wine""",3,2,,a; b');
  });

  it("reads styles defensively", () => {
    expect(parseStylePlace({ charger: { on: true, count: -1, note: "  x  " }, napkin: "yes", bogus: { on: true } })).toEqual({ charger: { on: true, note: "x" } });
    expect(parseStyleCentre({ arrangement: { on: true, tall: true }, candles: { on: true, tall: true }, extras: [{ name: " Vases ", count: 2 }, { name: " " }, ...Array.from({ length: 9 }, (_, i) => ({ name: `e${i}`, count: 1 }))] })).toMatchObject({
      arrangement: { on: true, tall: true },
      candles: { on: true },
    });
    expect(parseStyleCentre({ extras: Array.from({ length: 9 }, (_, i) => ({ name: `e${i}` })) }).extras).toHaveLength(5);
    expect(parseStyleChanges({})).toBeNull();
    expect(parseStyleChanges({ place: { glasses: { on: false } } })).toEqual({ place: { glasses: { on: false } } });
    expect(parseStyleChanges("x")).toBeNull();
  });
});

describe("what a chair shows", () => {
  const g = (over: Partial<SeatingGuest> = {}): SeatingGuest => ({
    id: "g", householdId: "h", householdName: "H", firstName: "Aroha", lastName: "Ngata", preferredName: null, ageBand: "adult", side: null,
    dietary: null, accessibility: null, plusOneFor: null, tagIds: [], invited: true, excluded: false, rsvp: "yes",
    needsHighchair: false, usesWheelchair: false, arrivedAt: null, ...over,
  });

  it("steps from dots to initials to names as you zoom in", () => {
    expect(chairDetail(0.3)).toBe("dot");
    expect(chairDetail(0.59)).toBe("dot");
    expect(chairDetail(0.6)).toBe("initials");
    expect(chairDetail(1)).toBe("initials");
    expect(chairDetail(1.49)).toBe("initials");
    expect(chairDetail(1.5)).toBe("name");
  });

  it("makes initials from the name the guest goes by", () => {
    expect(initials(g())).toBe("AN");
    expect(initials(g({ preferredName: "Ro" }))).toBe("RN");
    expect(initials(g({ lastName: null }))).toBe("A");
    expect(initials(g({ firstName: "élodie", lastName: "øien" }))).toBe("ÉØ");
    expect(initials(g({ firstName: "", lastName: null }))).toBe("");
  });

  it("marks a dietary note and a guest who can't come", () => {
    expect(chairMarks(g())).toEqual({ dietary: false, declined: false });
    expect(chairMarks(g({ dietary: "  " })).dietary).toBe(false);
    expect(chairMarks(g({ dietary: "Shellfish" })).dietary).toBe(true);
    expect(chairMarks(g({ rsvp: "no" })).declined).toBe(true);
    expect(chairMarks(g({ excluded: true })).declined).toBe(true);
    expect(chairMarks(g({ rsvp: null })).declined).toBe(false);
  });

  it("writes dark on light chairs and light on dark ones", () => {
    expect(readableText("#ffffff")).toBe("#1a1a1a");
    expect(readableText("#c9c4bb")).toBe("#1a1a1a");
    expect(readableText("#2f6f4f")).toBe("#ffffff");
    expect(readableText("#6b6560")).toBe("#ffffff");
    expect(readableText("nonsense")).toBe("#1a1a1a");
  });

  it("colours chairs by dietary needs", () => {
    expect(parseColourBy("dietary")).toEqual({ kind: "dietary" });
    expect(serialiseColourBy({ kind: "dietary" })).toBe("dietary");
    const ctx = { collaborators: [], tags: [], questions: [], answers: {} };
    expect(colourLegend({ kind: "dietary" }, ctx).map((e) => e.label)).toEqual(["Dietary need", "None"]);
    expect(guestColour(g({ dietary: "Nuts" }), { kind: "dietary" }, ctx)!.label).toBe("Dietary need");
    expect(guestColour(g(), { kind: "dietary" }, ctx)!.label).toBe("None");
  });
});
