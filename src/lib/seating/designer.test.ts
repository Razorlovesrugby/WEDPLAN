import { describe, expect, it } from "vitest";
import {
  bulgeFromPoint,
  constrainAngle,
  drawingIds,
  emptyDrawing,
  formatLength,
  newDrawingId,
  nearestOnWall,
  openingEnds,
  parseDrawing,
  polygonArea,
  removeWall,
  snapCorner,
  splitWall,
  wallBounds,
  wallLength,
  wallPath,
  wallPoint,
  wallRadius,
  type Drawing,
  type Wall,
} from "./drawing";
import { declinedSeats, isKept } from "./declined";
import { roomChanged } from "./lock";
import { buildKitchen, mealQuestion, sharedFlags } from "./kitchen";
import { isPdf, pdfScale } from "./pdf-plan";
import { LIBRARY, carriesQuantity, fixtureGroup, searchLibrary, tileDrawSize } from "./library";
import { banquetPieces, banquetPreset, rowBlocks, localSeatPositions, readSegments, tableSize, tablePolygon, seatPositions, FIXTURE_DEFAULTS, polygonsOverlap } from "./geometry";
import { classifyWalkway, DEFAULT_SETTINGS, parseSettings } from "./plan-settings";
import { computeService, parseMenu, typedPlatters, type ServiceSeat, type ServiceTable } from "./service";
import { chairDetail, chairMarks, initials, readableText } from "./chairs";
import { colourLegend, guestColour, parseColourBy, serialiseColourBy } from "./colour";
import type { SeatingGuest } from "./model";
import { changesFrom, computeItems, effectiveStyle, itemsCsv, kidsStarterStyle, shouldOfferKidsStyle, mergeFinal, parseStyleChanges, parseStyleCentre, parseStylePlace, type ItemTable, type TableStyle } from "./items";

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
    needsHighchair: false, usesWheelchair: false, arrivedAt: null, dietaryNeeds: [], replyChangedAt: null, ...over,
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
    expect(chairMarks(g())).toEqual({ dietary: false, dietaryDot: null, declined: false });
    expect(chairMarks(g({ dietary: "  " })).dietary).toBe(false);
    expect(chairMarks(g({ dietary: "Shellfish" })).dietary).toBe(true);
    expect(chairMarks(g({ dietary: "Shellfish" })).dietaryDot).toBe("note");
    expect(chairMarks(g({ dietaryNeeds: [{ tag: "vegan", isAllergy: false, otherText: null }] })).dietaryDot).toBe("preference");
    expect(chairMarks(g({ dietaryNeeds: [{ tag: "nut", isAllergy: true, otherText: null }], dietary: "x" })).dietaryDot).toBe("allergy");
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

describe("FIXTURE_DEFAULTS", () => {
  it("every default fits what the database accepts (20 to 5000 cm a side)", () => {
    for (const [kind, size] of Object.entries(FIXTURE_DEFAULTS)) {
      expect(size.width, `${kind} width`).toBeGreaterThanOrEqual(20);
      expect(size.width, `${kind} width`).toBeLessThanOrEqual(5000);
      expect(size.depth, `${kind} depth`).toBeGreaterThanOrEqual(20);
      expect(size.depth, `${kind} depth`).toBeLessThanOrEqual(5000);
    }
  });
});

describe("wall geometry (spec 57 Part B)", () => {
  const straight: Wall = { id: "w1", a: [0, 0], b: [400, 0], thick: 20, bulge: 0 };
  // A half circle of radius 200 through (0,0) and (400,0): bulge 200 off the chord.
  const half: Wall = { id: "w2", a: [0, 0], b: [400, 0], thick: 20, bulge: 200 };

  it("walks along a straight wall", () => {
    expect(wallPoint(straight, 0.25)).toMatchObject({ x: 100, y: 0, angle: 0 });
    expect(wallPoint(straight, 2)).toMatchObject({ x: 400, y: 0 });
  });
  it("walks along an arc: the middle is the bulge, the ends are the ends", () => {
    const mid = wallPoint(half, 0.5);
    expect(mid.x).toBeCloseTo(200, 3);
    expect(mid.y).toBeCloseTo(200, 3);
    const end = wallPoint(half, 1);
    expect(end.x).toBeCloseTo(400, 3);
    expect(end.y).toBeCloseTo(0, 3);
    // Bulging the other way puts the middle on the other side.
    expect(wallPoint({ ...half, bulge: -200 }, 0.5).y).toBeCloseTo(-200, 3);
  });
  it("draws a straight wall as a line and an arc as an arc", () => {
    expect(wallPath(straight)).toBe("M 0 0 L 400 0");
    expect(wallPath(half)).toMatch(/^M 0 0 A 200\.0 200\.0 0 0 0 400 0$/);
    // Past a half circle the large-arc flag is set.
    expect(wallPath({ ...half, bulge: 300 })).toMatch(/ 0 1 0 400 0$/);
    expect(wallPath({ ...half, bulge: -200 })).toMatch(/ 0 0 1 400 0$/);
  });
  it("sets a bulge from where the pointer is", () => {
    expect(bulgeFromPoint([0, 0], [400, 0], [200, 120])).toBe(120);
    expect(bulgeFromPoint([0, 0], [400, 0], [200, -80])).toBe(-80);
    expect(bulgeFromPoint([0, 0], [400, 0], [200, 0.3])).toBe(0);
    expect(bulgeFromPoint([0, 0], [0, 0], [5, 5])).toBe(0);
  });
  it("finds the nearest wall and how far along it", () => {
    const hit = nearestOnWall([straight, { id: "far", a: [0, 500], b: [400, 500], thick: 20, bulge: 0 }], [100, 30], 50)!;
    expect(hit.wall.id).toBe("w1");
    expect(hit.t).toBeCloseTo(0.25, 5);
    expect(hit.dist).toBeCloseTo(30, 5);
    expect(nearestOnWall([straight], [100, 80], 50)).toBeNull();
    const onArc = nearestOnWall([half], [200, 230], 50)!;
    expect(onArc.t).toBeCloseTo(0.5, 3);
    expect(onArc.dist).toBeCloseTo(30, 3);
  });
  it("splits a straight wall in two and shares out its doors", () => {
    const d: Drawing = {
      ...emptyDrawing(),
      walls: [straight],
      openings: [
        { id: "d1", kind: "door", wall: "w1", at: 0.25, width: 90, swing: "in", hinge: "a" },
        { id: "d2", kind: "window", wall: "w1", at: 0.75, width: 120, swing: "in", hinge: "a" },
      ],
    };
    const out = splitWall(d, "w1", "w1b");
    expect(out.walls.map((w) => [w.id, w.a, w.b])).toEqual([
      ["w1", [0, 0], [200, 0]],
      ["w1b", [200, 0], [400, 0]],
    ]);
    expect(out.openings.find((o) => o.id === "d1")).toMatchObject({ wall: "w1", at: 0.5 });
    expect(out.openings.find((o) => o.id === "d2")).toMatchObject({ wall: "w1b", at: 0.5 });
    expect(parseDrawing(out).ok).toBe(true);
    expect(splitWall(d, "nope", "x")).toBe(d);
    expect(splitWall(d, "w1", "w1")).toBe(d);
  });
  it("splits an arc into two arcs of the same circle", () => {
    const out = splitWall({ ...emptyDrawing(), walls: [half] }, "w2", "w2b");
    const [first, second] = out.walls;
    // A quarter circle of radius 200 has its middle 200·(1−cos 45°) ≈ 59 cm off its chord.
    expect(first!.bulge).toBe(59);
    expect(second!.bulge).toBe(59);
    // Whole centimetres: the radius is the same circle to within the rounding.
    expect(Math.abs(wallRadius(first!)! - 200)).toBeLessThan(2);
    expect(first!.b).toEqual([200, 200]);
  });
  it("removes a wall with its openings", () => {
    const d: Drawing = { ...emptyDrawing(), walls: [straight, half], openings: [{ id: "d1", kind: "door", wall: "w1", at: 0.5, width: 90, swing: "in", hinge: "a" }] };
    const out = removeWall(d, "w1");
    expect(out.walls.map((w) => w.id)).toEqual(["w2"]);
    expect(out.openings).toEqual([]);
  });
  it("gives a door's gap its ends", () => {
    const e = openingEnds(straight, { at: 0.5, width: 100 });
    expect(e.from).toEqual([150, 0]);
    expect(e.to).toEqual([250, 0]);
    expect(e.centre).toEqual([200, 0]);
  });
  it("makes ids that are free and valid", () => {
    const taken = new Set(["w000000"]);
    const id = newDrawingId("w", taken, () => 0);
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    expect(taken.has(id)).toBe(false);
  });
  it("lists the ids in use", () => {
    expect(drawingIds({ ...emptyDrawing(), walls: [straight], labels: [{ id: "l1", text: "x", x: 0, y: 0, size: 16 }] })).toEqual(new Set(["w1", "l1"]));
  });
});

describe("library (spec 57 A.3)", () => {
  it("has the tables the spec lists and every fixture kind has a default size", () => {
    const tables = LIBRARY.filter((t) => t.group === "tables").map((t) => t.label);
    expect(tables).toEqual(["Round", "Long", "Square", "Oval", "Half-moon", "Serpentine", "Banquet run", "Sweetheart", "Ceremony rows", "Cocktail"]);
    for (const t of LIBRARY.filter((x) => x.item.type === "fixture")) {
      expect(FIXTURE_DEFAULTS[(t.item as { kind: string }).kind], t.label).toBeTruthy();
    }
  });
  it("tile ids are unique, and rows and banquet runs ask for setup", () => {
    expect(new Set(LIBRARY.map((t) => t.id)).size).toBe(LIBRARY.length);
    expect(LIBRARY.filter((t) => t.needsSetup).map((t) => t.id)).toEqual(["banquet", "rows"]);
  });
  it("groups fixtures for the Show layers", () => {
    expect(fixtureGroup("dance_floor")).toBe("room");
    expect(fixtureGroup("floral_arch")).toBe("decor");
    expect(fixtureGroup("custom")).toBe("decor");
    expect(fixtureGroup("marquee")).toBe("outdoors");
  });
  it("searches every group by name or group", () => {
    expect(searchLibrary(LIBRARY, "arch").map((t) => t.id)).toEqual(["floral_arch"]);
    expect(searchLibrary(LIBRARY, "outdoor").length).toBe(6);
    expect(searchLibrary(LIBRARY, "  ").length).toBe(LIBRARY.length);
    expect(searchLibrary(LIBRARY, "zzz")).toEqual([]);
  });
  it("lets décor carry a quantity but not a dance floor", () => {
    expect(carriesQuantity("aisle_flowers")).toBe(true);
    expect(carriesQuantity("dance_floor")).toBe(false);
  });
  it("draws tiles to scale", () => {
    expect(tileDrawSize({ w: 300, d: 75 }, 60)).toEqual({ w: 60, h: 15 });
    expect(tileDrawSize({ w: 100, d: 100 }, 60)).toEqual({ w: 60, h: 60 });
  });
});

describe("banquet pieces and ceremony blocks", () => {
  it("draws a straight banquet run as its joined pieces, centred", () => {
    const pieces = banquetPieces([{ len: 300, turn: 0 }, { len: 300, turn: 0 }], 20);
    expect(pieces).toHaveLength(2);
    const xs = pieces.flat().map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-300, 3);
    expect(Math.max(...xs)).toBeCloseTo(300, 3);
    const ys = pieces.flat().map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(75, 3);
  });
  it("an unreadable run is one straight piece", () => {
    expect(banquetPieces(null, 10)).toHaveLength(1);
  });
  it("offers a straight run, an L and a U that read back as valid runs", () => {
    expect(banquetPreset("straight", 300, 3)).toHaveLength(3);
    expect(readSegments(banquetPreset("u"))).toHaveLength(3);
    expect(readSegments(banquetPreset("l"))).toHaveLength(2);
    // A U turns twice, a right angle each time.
    expect(banquetPreset("u").map((s) => s.turn)).toEqual([0, 90, 90]);
  });
  it("lays rows out either side of the aisle", () => {
    const blocks = rowBlocks({ capacity: 40, rows_count: 4, aisle_cm: 120 });
    expect(blocks).toHaveLength(8);
    const row0 = blocks.filter((b) => b.y === blocks[0]!.y);
    expect(row0).toHaveLength(2);
    // The gap between the two halves is the aisle.
    expect(row0[1]!.x - (row0[0]!.x + row0[0]!.w)).toBe(120);
    expect(rowBlocks({ capacity: 9, rows_count: 1, aisle_cm: 100 })).toHaveLength(2);
    expect(rowBlocks({ capacity: 1, rows_count: 1, aisle_cm: 100 })).toHaveLength(1);
  });
});

describe("declined, still in a seat (spec 57 A.2)", () => {
  const g = (over: Partial<SeatingGuest> = {}): SeatingGuest => ({
    id: "g", householdId: "h", householdName: "H", firstName: "G", lastName: null, preferredName: null, ageBand: "adult", side: null,
    dietary: null, dietaryNeeds: [], accessibility: null, plusOneFor: null, tagIds: [], invited: true, excluded: false, rsvp: "yes",
    needsHighchair: false, usesWheelchair: false, arrivedAt: null, replyChangedAt: null, ...over,
  });
  const seat = (guestId: string, declineKeptAt: string | null = null) => ({ guestId, tableId: "t1", seatIndex: 2, declineKeptAt });
  it("lists a seated guest who is no longer coming, and nobody who is", () => {
    const out = declinedSeats([g({ id: "a", rsvp: "no" }), g({ id: "b", rsvp: "yes" }), g({ id: "c", excluded: true }), g({ id: "d", rsvp: null })], [seat("a"), seat("b"), seat("c"), seat("d")]);
    expect(out.map((x) => x.guest.id)).toEqual(["a", "c"]);
  });
  it("never lists an unseated guest", () => {
    expect(declinedSeats([g({ id: "a", rsvp: "no" })], [])).toEqual([]);
  });
  it("Keep for now hides the card until the reply changes again", () => {
    const guest = (changed: string | null) => g({ id: "a", rsvp: "no", replyChangedAt: changed });
    expect(declinedSeats([guest("2026-11-01T00:00:00Z")], [seat("a", "2026-11-02T00:00:00Z")])).toEqual([]);
    // They answered again after it was kept: the card is back.
    expect(declinedSeats([guest("2026-11-03T00:00:00Z")], [seat("a", "2026-11-02T00:00:00Z")])).toHaveLength(1);
    expect(declinedSeats([guest(null)], [seat("a", "2026-11-02T00:00:00Z")])).toEqual([]);
    expect(isKept(null, "2026-11-01T00:00:00Z")).toBe(false);
  });
});

describe("PDF plans (spec 57 B.2)", () => {
  it("draws a page at 150 dpi", () => {
    // A4 portrait is 595 × 842 pt: 150 dpi is 2.083…× scale, 1754 px on the long side.
    expect(pdfScale(595, 842)).toBeCloseTo(150 / 72, 6);
  });
  it("never lets the longest side pass 6000 px", () => {
    // An A0 sheet is 2384 × 3370 pt: 150 dpi would be 7021 px.
    const s = pdfScale(2384, 3370);
    expect(3370 * s).toBeCloseTo(6000, 3);
    expect(2384 * s).toBeLessThan(6000);
  });
  it("copes with a degenerate page", () => {
    expect(pdfScale(0, 0)).toBeGreaterThan(0);
  });
  it("tells a PDF by type or by name", () => {
    expect(isPdf({ type: "application/pdf", name: "x" })).toBe(true);
    expect(isPdf({ type: "", name: "Plan.PDF" })).toBe(true);
    expect(isPdf({ type: "image/png", name: "plan.png" })).toBe(false);
  });
});

describe("locking the room (spec 57 Part D)", () => {
  const state = (over: Record<string, unknown> = {}) => ({
    spaces: [{ id: "s", name: "Hall", room_width_cm: 2000, drawing: { walls: [] } }],
    tables: [{ id: "t1", space_id: "s", shape: "round", capacity: 8, pos_x_cm: 100, pos_y_cm: 100, label: "Table 1", style_id: null, reserved_seats: 0 }],
    fixtures: [{ id: "f1", space_id: "s", kind: "bar", pos_x_cm: 5, pos_y_cm: 5, width_cm: 300, depth_cm: 80 }],
    assignments: [],
    ...over,
  });
  it("sees no change when only the seating moved", () => {
    expect(roomChanged(state(), state({ assignments: [{ guest_id: "g", table_id: "t1", seat_index: 1 }] }))).toBe(false);
  });
  it("lets a table's label, style and reserved seats change under a lock", () => {
    const t = state().tables[0]!;
    expect(roomChanged(state(), state({ tables: [{ ...t, label: "Head table", style_id: "x", reserved_seats: 2 }] }))).toBe(false);
  });
  it("sees a table moved or resized, added or deleted", () => {
    const t = state().tables[0]!;
    expect(roomChanged(state(), state({ tables: [{ ...t, pos_x_cm: 300 }] }))).toBe(true);
    expect(roomChanged(state(), state({ tables: [{ ...t, capacity: 10 }] }))).toBe(true);
    expect(roomChanged(state(), state({ tables: [] }))).toBe(true);
    expect(roomChanged(state(), state({ tables: [t, { ...t, id: "t2" }] }))).toBe(true);
  });
  it("sees a fixture or the drawing change", () => {
    expect(roomChanged(state(), state({ fixtures: [] }))).toBe(true);
    expect(roomChanged(state(), state({ spaces: [{ id: "s", name: "Hall", room_width_cm: 2000, drawing: { walls: [{ id: "w" }] } }] }))).toBe(true);
  });
  it("doesn't care about list order", () => {
    const a = { id: "a", space_id: "s", shape: "round", capacity: 4 };
    const b = { id: "b", space_id: "s", shape: "round", capacity: 4 };
    expect(roomChanged({ tables: [a, b] }, { tables: [b, a] })).toBe(false);
  });
  it("copes with nothing", () => {
    expect(roomChanged(null, undefined)).toBe(false);
  });
});

describe("kitchen summary (spec 57 E.1.2)", () => {
  const guest = (id: string, over: Partial<SeatingGuest> = {}): SeatingGuest => ({
    id, householdId: "h", householdName: "H", firstName: id, lastName: "Ngata", preferredName: null, ageBand: "adult", side: null,
    dietary: null, dietaryNeeds: [], accessibility: null, plusOneFor: null, tagIds: [], invited: true, excluded: false, rsvp: "yes",
    needsHighchair: false, usesWheelchair: false, arrivedAt: null, replyChangedAt: null, ...over,
  });
  const tables = [
    { id: "t1", label: "Table 1", shape: "round" as const, capacity: 8, ends_seated: false, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null },
    { id: "t2", label: "Table 2", shape: "round" as const, capacity: 8, ends_seated: false, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null },
  ];
  const guests = [
    guest("a", { dietaryNeeds: [{ tag: "peanut", isAllergy: true, otherText: null }] }),
    guest("b", { dietary: "no onions" }),
    guest("c"),
    guest("kid", { ageBand: "child" }),
  ];
  const seats = [
    { guestId: "a", tableId: "t1", seatIndex: 0 },
    { guestId: "b", tableId: "t1", seatIndex: 1, ownPlate: { main: true } },
    { guestId: "c", tableId: "t1", seatIndex: null },
    { guestId: "kid", tableId: "t2", seatIndex: 3 },
  ];
  const menu = [
    { id: "main", name: "Mains", style: "shared" as const, dishes: [{ id: "lamb", name: "Lamb", tags: [], vessel: "platter" as const, serves: 4 }] },
    { id: "starter", name: "Starters", style: "plated" as const, dishes: [] },
    { id: "canapes", name: "Canapés", style: "roaming" as const, dishes: [] },
  ];
  const meal = { id: "q", label: "Meal", options: ["Beef", "Fish"], answers: { a: "Beef", b: "Fish", c: "Beef" } };
  const out = buildKitchen({ menu, defaultStyle: "plated", tables, seats, guests, settings: { longTableCm: null }, meal });

  it("counts plated courses per answer, with a line for nobody's answer", () => {
    expect(out.courses.find((c) => c.courseId === "starter")!.plated).toEqual([
      { answer: "Beef", count: 2 },
      { answer: "Fish", count: 1 },
      { answer: "No answer", count: 1 },
    ]);
  });
  it("works out platters per table for a shared course, leaving out own plates and kids' meals", () => {
    const main = out.courses.find((c) => c.courseId === "main")!;
    // Table 1: three seated, one on their own plate → two sharing; 2 ÷ 4 serves = 1 platter. Table 2: the child has a kids' meal → nobody shares.
    expect(main.heads.map((h) => h.sharing)).toEqual([2, 0]);
    expect(main.shared[0]!.tables.map((t) => t.platters)).toEqual([1, null]);
    expect(main.shared[0]!.total).toBe(1);
    expect(out.utensils).toBe(2);
  });
  it("lists own plates and kids' meals with their table and seat", () => {
    const main = out.courses.find((c) => c.courseId === "main")!;
    expect(main.ownPlates).toEqual([{ table: "Table 1", seat: 2, name: "b Ngata", dietary: "no onions" }]);
    expect(main.kidsMeals.map((k) => k.name)).toEqual(["kid Ngata"]);
  });
  it("counts a roaming course by head", () => {
    expect(out.courses.find((c) => c.courseId === "canapes")!.totalGuests).toBe(4);
  });
  it("lists every dietary need with where they sit, allergies marked", () => {
    expect(out.dietary).toEqual([
      { table: "Table 1", seat: 1, name: "a Ngata", dietary: "Allergy: Peanuts", allergy: true },
      { table: "Table 1", seat: 2, name: "b Ngata", dietary: "no onions", allergy: false },
    ]);
  });
  it("finds the meal question by the plan's choice, else by name, else none", () => {
    const qs = [{ id: "q1", label: "Song request", options: [] }, { id: "q2", label: "Dinner choice", options: ["Beef"] }];
    expect(mealQuestion(qs, { q2: { a: "Beef" } }, null)?.id).toBe("q2");
    expect(mealQuestion(qs, {}, "q1")?.id).toBe("q1");
    expect(mealQuestion([qs[0]!], {}, null)).toBeNull();
  });
});

describe("shared-dish flags (spec 57 F.4)", () => {
  const settings = { tightForShared: { longWidthCm: 80, roundCm: 150 } };
  const base = { capacity: 8, ends_seated: false, width_cm: null, length_cm: null, rows_count: null, aisle_cm: null, segments: null };
  it("flags a long table narrower than the limit and a small round one", () => {
    // A long table is 75 cm deep: under the 80 cm limit.
    expect(sharedFlags({ ...base, shape: "long" }, {}, settings)).toEqual(["Tight for shared dishes"]);
    expect(sharedFlags({ ...base, shape: "round", capacity: 6 }, {}, settings)).toEqual(["Tight for shared dishes"]);
    expect(sharedFlags({ ...base, shape: "round", capacity: 10 }, {}, settings)).toEqual([]);
  });
  it("follows the plan's own limits", () => {
    expect(sharedFlags({ ...base, shape: "long" }, {}, { tightForShared: { longWidthCm: 70, roundCm: 150 } })).toEqual([]);
  });
  it("flags a ticked tall centre, only while it is on", () => {
    expect(sharedFlags({ ...base, shape: "round", capacity: 12 }, { candles: { on: true, tall: true } }, settings)).toEqual(["Tall centrepieces get in the way of passing dishes"]);
    expect(sharedFlags({ ...base, shape: "round", capacity: 12 }, { candles: { on: false, tall: true } }, settings)).toEqual([]);
  });
});

describe("per-table changes (spec 57 C.1)", () => {
  const style = { place: { charger: { on: true }, glasses: { on: true, count: 2 } }, centre: { candles: { on: true, count: 4 }, extras: [{ name: "Bud vases", count: 3 }] } };
  it("is nothing when the table is just its style", () => {
    expect(changesFrom(style, effectiveStyle(style, null))).toBeNull();
  });
  it("keeps only what differs", () => {
    const wanted = effectiveStyle(style, null);
    wanted.place = { ...wanted.place, glasses: { on: true, count: 3 }, napkin: { on: true } };
    wanted.centre = { ...wanted.centre, candles: { on: false } };
    expect(changesFrom(style, wanted)).toEqual({ place: { glasses: { on: true, count: 3 }, napkin: { on: true } }, centre: { candles: { on: false } } });
  });
  it("turns an item the style has off, and replaces the extras whole", () => {
    const wanted = { place: { glasses: style.place.glasses }, centre: { candles: style.centre.candles, extras: [{ name: "Bud vases", count: 5 }] } };
    expect(changesFrom(style, wanted)).toEqual({ place: { charger: { on: false } }, centre: { extras: [{ name: "Bud vases", count: 5 }] } });
  });
  it("round trips through effectiveStyle", () => {
    const wanted = { place: { charger: { on: true }, napkin: { on: true, note: "linen" } }, centre: { runner: { on: true } } };
    const changes = changesFrom(style, wanted);
    const back = effectiveStyle(style, changes);
    expect(back.place.napkin).toEqual({ on: true, note: "linen" });
    expect(back.place.glasses?.on).toBe(false);
    expect(back.centre.runner?.on).toBe(true);
    expect(back.centre.candles?.on).toBe(false);
  });
  it("with no style, everything wanted is a change", () => {
    expect(changesFrom(null, { place: { charger: { on: true } }, centre: {} })).toEqual({ place: { charger: { on: true } } });
  });
});

describe("the Kids starter style (spec 57 C.1)", () => {
  it("is plastic cups, no charger and an activity pack, and parses as a style", () => {
    const k = kidsStarterStyle();
    expect(k.name).toBe("Kids");
    expect(k.place.charger?.on).toBe(false);
    expect(k.place.glasses?.note).toBe("plastic cups");
    expect(k.centre.extras).toEqual([{ name: "Activity pack", count: 1 }]);
    expect(parseStylePlace(k.place)).toEqual(k.place);
    expect(parseStyleCentre(k.centre)).toEqual(k.centre);
  });
  it("is offered once a child is seated and not before, and not if the couple already has one", () => {
    expect(shouldOfferKidsStyle(0, [])).toBe(false);
    expect(shouldOfferKidsStyle(2, [])).toBe(true);
    expect(shouldOfferKidsStyle(2, [{ name: "Garden round" }])).toBe(true);
    expect(shouldOfferKidsStyle(2, [{ name: " kids " }])).toBe(false);
  });
});
