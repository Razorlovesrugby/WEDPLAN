import { describe, expect, it } from "vitest";
import { countNeeds, dietaryDot, dietaryText, dietarySummary, diffNeeds, hasAnyDietary, needLabel, parseDietaryNeeds, type DietaryNeed } from "./dietary";

const need = (tag: DietaryNeed["tag"], isAllergy = false, otherText: string | null = null): DietaryNeed => ({ tag, isAllergy, otherText });

describe("parseDietaryNeeds", () => {
  it("keeps known tags, once each, the later one winning", () => {
    expect(
      parseDietaryNeeds([
        { tag: "nut", isAllergy: false },
        { tag: "nut", isAllergy: true },
        { tag: "vegan" },
      ]),
    ).toEqual([need("nut", true), need("vegan")]);
  });
  it("drops unknown tags, junk and non-lists", () => {
    expect(parseDietaryNeeds([{ tag: "chocolate" }, null, 3, "nut", { tag: 4 }])).toEqual([]);
    expect(parseDietaryNeeds("nut")).toEqual([]);
    expect(parseDietaryNeeds(undefined)).toEqual([]);
  });
  it("needs text for Other, trims it and keeps it short", () => {
    expect(parseDietaryNeeds([{ tag: "other" }])).toEqual([]);
    expect(parseDietaryNeeds([{ tag: "other", otherText: "   " }])).toEqual([]);
    expect(parseDietaryNeeds([{ tag: "other", otherText: "  no   mushrooms " }])).toEqual([need("other", false, "no mushrooms")]);
    expect(parseDietaryNeeds([{ tag: "other", otherText: "x".repeat(200) }])[0]!.otherText).toHaveLength(60);
  });
  it("ignores text on any tag but Other", () => {
    expect(parseDietaryNeeds([{ tag: "vegan", otherText: "strict" }])).toEqual([need("vegan")]);
  });
  it("lists allergies first", () => {
    expect(parseDietaryNeeds([{ tag: "vegan" }, { tag: "sesame", isAllergy: true }]).map((n) => n.tag)).toEqual(["sesame", "vegan"]);
  });
  it("only an explicit true is an allergy", () => {
    expect(parseDietaryNeeds([{ tag: "egg", isAllergy: "true" }])).toEqual([need("egg", false)]);
  });
});

describe("labels and summary", () => {
  it("labels the tags and uses the couple's words for Other", () => {
    expect(needLabel(need("gluten_free"))).toBe("Gluten free");
    expect(needLabel(need("other", false, "no mushrooms"))).toBe("no mushrooms");
  });
  it("puts allergies before preferences", () => {
    expect(dietarySummary([need("peanut", true), need("sesame", true), need("vegetarian")])).toBe("Allergy: Peanuts, Sesame. Vegetarian");
    expect(dietarySummary([need("halal")])).toBe("Halal");
    expect(dietarySummary([need("egg", true)])).toBe("Allergy: Egg");
    expect(dietarySummary([])).toBe("");
  });
});

describe("dietaryDot", () => {
  it("is red for an allergy, amber for a preference, grey for a note only, none for nothing", () => {
    expect(dietaryDot([need("nut", true), need("vegan")], "x")).toBe("allergy");
    expect(dietaryDot([need("vegan")], "x")).toBe("preference");
    expect(dietaryDot([], "no onions")).toBe("note");
    expect(dietaryDot([], "  ")).toBeNull();
    expect(dietaryDot([], null)).toBeNull();
  });
  it("counts a tag or a note as a dietary need", () => {
    expect(hasAnyDietary([need("vegan")], null)).toBe(true);
    expect(hasAnyDietary([], "no onions")).toBe(true);
    expect(hasAnyDietary([], "")).toBe(false);
  });
});

describe("diffNeeds", () => {
  it("writes only what changed", () => {
    const d = diffNeeds([need("nut"), need("vegan"), need("egg", true)], [need("nut", true), need("vegan"), need("soy")]);
    expect(d.upsert.map((n) => n.tag).sort()).toEqual(["nut", "soy"]);
    expect(d.remove).toEqual(["egg"]);
  });
  it("writes nothing for an untouched list", () => {
    expect(diffNeeds([need("nut", true)], [need("nut", true)])).toEqual({ upsert: [], remove: [] });
  });
  it("a changed Other text is a write", () => {
    expect(diffNeeds([need("other", false, "a")], [need("other", false, "b")]).upsert).toHaveLength(1);
  });
});

describe("countNeeds", () => {
  it("counts allergies and preferences apart, most common first", () => {
    const rows = countNeeds([[need("vegan"), need("nut", true)], [need("vegan")], [need("nut"), need("other", false, "No Mushrooms")], [need("other", true, "no mushrooms")]]);
    // Three tags tie on two guests each; ties go by name.
    expect(rows.map((r) => r.label)).toEqual(["No Mushrooms", "Tree nuts", "Vegan"]);
    expect(rows.find((r) => r.label === "Vegan")).toMatchObject({ allergy: 0, preference: 2 });
    expect(rows.find((r) => r.label === "Tree nuts")).toMatchObject({ allergy: 1, preference: 1 });
    expect(rows.filter((r) => r.label.toLowerCase().includes("mushrooms"))).toHaveLength(1);
  });
});

describe("dietaryText", () => {
  it("joins the tags and the note", () => {
    expect(dietaryText([need("peanut", true), need("vegetarian")], "no mushrooms")).toBe("Allergy: Peanuts. Vegetarian — no mushrooms");
    expect(dietaryText([], "  no onions ")).toBe("no onions");
    expect(dietaryText([need("vegan")], null)).toBe("Vegan");
    expect(dietaryText([], null)).toBe("");
  });
});
