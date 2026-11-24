import { describe, expect, it } from "vitest";
import { buildTemplate, planRenumber, tableNumber, type TemplateInput } from "./template";
import { computeFit, fitCounts } from "./fit";

const base: TemplateInput = {
  people: 120,
  tables: "round10",
  couple: "top",
  elements: ["dance_floor", "band", "bar"],
  room: { widthCm: 2600, depthCm: 2000 },
};

describe("buildTemplate", () => {
  it("gives every person a seat and states the numbers", () => {
    const r = buildTemplate(base);
    expect(r.seats).toBeGreaterThanOrEqual(120);
    expect(r.spare).toBe(r.seats - 120);
    expect(r.summary).toContain(`${r.tables.length} tables`);
    expect(r.summary).toContain("seats for 120 people");
  });
  it("seats the couple at a top table of 8 and numbers the rest from the top", () => {
    const r = buildTemplate(base);
    expect(r.tables[0]).toMatchObject({ label: "Top table", capacity: 8, shape: "head" });
    expect(r.tables.slice(1).map((t) => t.label).slice(0, 3)).toEqual(["Table 1", "Table 2", "Table 3"]);
    const ys = r.tables.slice(1).map((t) => t.pos_y_cm);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });
  it("uses a sweetheart table of 2, or none", () => {
    expect(buildTemplate({ ...base, couple: "sweetheart" }).tables[0]).toMatchObject({ label: "Sweetheart table", capacity: 2 });
    expect(buildTemplate({ ...base, couple: "guests" }).tables.every((t) => t.label.startsWith("Table"))).toBe(true);
  });
  it("makes a mix of rounds and longs", () => {
    const shapes = new Set(buildTemplate({ ...base, tables: "mixed" }).tables.map((t) => t.shape));
    expect(shapes.has("round") && shapes.has("long")).toBe(true);
  });
  it("places the elements asked for, and no others", () => {
    const r = buildTemplate(base);
    expect(r.fixtures.map((f) => f.kind).sort()).toEqual(["band", "bar", "dance_floor"]);
    expect(buildTemplate({ ...base, elements: [] }).fixtures).toEqual([]);
  });
  it("reports when the room is too small", () => {
    expect(buildTemplate({ ...base, room: { widthCm: 600, depthCm: 500 } }).fits).toBe(false);
  });
  it("handles nobody", () => {
    const r = buildTemplate({ ...base, people: 0, couple: "guests" });
    expect(r.tables).toEqual([]);
    expect(r.spare).toBe(0);
  });
});

describe("renumbering", () => {
  const tables = [
    { id: "a", label: "Table 1" },
    { id: "b", label: "Table 2" },
    { id: "c", label: "Top table" },
  ];
  it("reads a number from a label", () => {
    expect(tableNumber("Table 12")).toBe(12);
    expect(tableNumber("7")).toBe(7);
    expect(tableNumber("Top table")).toBeNull();
  });
  it("swaps two labels when the number is already used", () => {
    expect(planRenumber(tables, "a", "2")).toEqual([
      { id: "a", label: "2" },
      { id: "b", label: "Table 1" },
    ]);
  });
  it("just renames when the label is free or isn't a number", () => {
    expect(planRenumber(tables, "a", "9")).toEqual([{ id: "a", label: "9" }]);
    expect(planRenumber(tables, "c", "Head table")).toEqual([{ id: "c", label: "Head table" }]);
  });
});

describe("computeFit", () => {
  const guests = [
    { id: "a", householdId: "h1", tagIds: ["uni"] },
    { id: "b", householdId: "h1", tagIds: [] },
    { id: "c", householdId: "h2", tagIds: ["uni"] },
    { id: "d", householdId: "h3", tagIds: [] },
    { id: "e", householdId: "h4", tagIds: [] },
    { id: "f", householdId: "h5", tagIds: [] },
  ];
  const seats = new Map([["a", "t1"], ["b", "t1"], ["c", "t2"], ["d", "t2"], ["e", "t3"], ["f", "t3"]]);
  it("is green for a household member, amber for nobody known", () => {
    const fit = computeFit({ guests, seats, rules: [], warned: new Set() });
    expect(fit.get("a")).toBe("green");
    expect(fit.get("c")).toBe("amber");
    expect(fit.get("d")).toBe("amber");
  });
  it("counts a shared tag and a keep-together rule", () => {
    const withTag = computeFit({ guests, seats: new Map([["a", "t1"], ["c", "t1"]]), rules: [], warned: new Set() });
    expect(withTag.get("a")).toBe("green");
    const withRule = computeFit({ guests, seats, rules: [{ kind: "together", guest_a: "e", guest_b: "f" }], warned: new Set() });
    expect(withRule.get("e")).toBe("green");
  });
  it("is red when part of a warning, whatever else is true", () => {
    expect(computeFit({ guests, seats, rules: [], warned: new Set(["a"]) }).get("a")).toBe("red");
  });
  it("counts each", () => {
    const fit = computeFit({ guests, seats, rules: [], warned: new Set(["d"]) });
    expect(fitCounts(fit)).toEqual({ green: 2, amber: 3, red: 1 });
  });
});
