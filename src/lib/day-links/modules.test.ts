import { describe, expect, it } from "vitest";
import { activeModules, defaultModuleKeys, offeredModules, tabBar, type DayModule } from "./modules";

const shot: DayModule = {
  key: "shot_list",
  label: "Shot list",
  offeredTo: (a) => a.type === "vendor" || a.type === "guest" || a.type === "person",
  onByDefaultFor: (a, c) => (a.type === "vendor" && /photo|video/i.test(a.categoryName ?? "")) || c.linkedItemOpensModule,
  tabs: [{ key: "shots", label: "Shots" }],
};
const seating: DayModule = {
  key: "seating",
  label: "Seating",
  offeredTo: () => true,
  onByDefaultFor: (a) => a.type === "vendor" && /venue|cater/i.test(a.categoryName ?? ""),
  tabs: [{ key: "seats", label: "Seats" }],
};
const registry = [shot, seating];

describe("modules", () => {
  it("is empty by default, so a link has no tab bar", () => {
    expect(tabBar([])).toEqual([]);
  });
  it("switches the shot list on for photographers and anyone linked to it", () => {
    expect(defaultModuleKeys({ type: "vendor", categoryName: "Photography" }, { linkedItemOpensModule: false }, registry)).toEqual(["shot_list"]);
    expect(defaultModuleKeys({ type: "guest" }, { linkedItemOpensModule: true }, registry)).toEqual(["shot_list"]);
    expect(defaultModuleKeys({ type: "guest" }, { linkedItemOpensModule: false }, registry)).toEqual([]);
  });
  it("switches seating on for venue and catering vendors", () => {
    expect(defaultModuleKeys({ type: "vendor", categoryName: "Catering" }, { linkedItemOpensModule: false }, registry)).toEqual(["seating"]);
  });
  it("offers what the rule allows", () => {
    expect(offeredModules({ type: "person" }, registry).map((m) => m.key)).toEqual(["shot_list", "seating"]);
  });
  it("ignores stored keys the registry doesn't know, or that aren't keys", () => {
    expect(activeModules(["shot_list", "mystery", "Bad Key!"], registry).map((m) => m.key)).toEqual(["shot_list"]);
  });
  it("builds a tab bar with My day first, capped at four", () => {
    const wide: DayModule = { ...shot, key: "wide", tabs: ["a", "b", "c", "d"].map((k) => ({ key: k, label: k })) };
    expect(tabBar([shot]).map((t) => t.key)).toEqual(["my_day", "shots"]);
    expect(tabBar([wide])).toHaveLength(4);
  });
});
