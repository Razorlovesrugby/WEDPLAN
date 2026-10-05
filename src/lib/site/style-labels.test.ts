import { describe, expect, it } from "vitest";
import { BLOCK_ALIGNS, BLOCK_BACKGROUNDS, BLOCK_WIDTHS, IMAGE_SHAPES } from "./blocks";
import {
  ALIGN_LABEL,
  BACKGROUND_LABEL,
  SHAPE_LABEL,
  STYLE_CHOICES,
  WIDTH_LABEL,
  repeatHeading,
} from "./style-labels";

describe("style labels", () => {
  it("has a label for every value of every style, and nothing extra", () => {
    expect(Object.keys(WIDTH_LABEL).sort()).toEqual([...BLOCK_WIDTHS].sort());
    expect(Object.keys(BACKGROUND_LABEL).sort()).toEqual([...BLOCK_BACKGROUNDS].sort());
    expect(Object.keys(ALIGN_LABEL).sort()).toEqual([...BLOCK_ALIGNS].sort());
    expect(Object.keys(SHAPE_LABEL).sort()).toEqual([...IMAGE_SHAPES].sort());
  });

  it("never shows the planner a stored value as its label", () => {
    // The point of the map is that `paper` and `contained` are schema, not copy.
    for (const choices of Object.values(STYLE_CHOICES)) {
      for (const choice of choices) expect(choice.label).not.toBe(choice.value);
    }
  });

  it("offers the choices in the order the enums declare them", () => {
    expect(STYLE_CHOICES.width.map((c) => c.value)).toEqual([...BLOCK_WIDTHS]);
    expect(STYLE_CHOICES.shape.map((c) => c.value)).toEqual([...IMAGE_SHAPES]);
  });
});

describe("repeatHeading", () => {
  it("pluralises and capitalises the noun", () => {
    expect(repeatHeading("question")).toBe("Questions");
    expect(repeatHeading("milestone")).toBe("Milestones");
    expect(repeatHeading("suggestion")).toBe("Suggestions");
  });

  it("knows the irregular ones the forms use", () => {
    expect(repeatHeading("person")).toBe("People");
  });

  it("copes with whitespace and nothing", () => {
    expect(repeatHeading("  question ")).toBe("Questions");
    expect(repeatHeading("")).toBe("");
  });
});
