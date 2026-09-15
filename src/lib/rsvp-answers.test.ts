import { describe, expect, it } from "vitest";
import { coerceAnswer } from "./rsvp-answers";

const MEAL = { type: "single_select", options: ["Beef", "Salmon", "Mushroom wellington"] };
const EXTRAS = { type: "multi_select", options: ["Coach", "High chair", "Parking"] };
const TEXT = { type: "short_text", options: [] };

describe("coerceAnswer", () => {
  it("keeps a valid choice", () => {
    expect(coerceAnswer(MEAL, "Salmon")).toBe("Salmon");
  });

  it("drops a choice that is not on the question", () => {
    // The form renders radios, but the endpoint is public and takes whatever
    // is posted to it.
    expect(coerceAnswer(MEAL, "Lobster thermidor")).toBeUndefined();
  });

  it("is not fooled by case or padding, which are not the same option", () => {
    expect(coerceAnswer(MEAL, "salmon")).toBeUndefined();
    expect(coerceAnswer(MEAL, "  Salmon  ")).toBe("Salmon");
  });

  it("keeps valid multi-select options and drops the rest", () => {
    expect(coerceAnswer(EXTRAS, ["Coach", "Helicopter", "Parking"])).toEqual(["Coach", "Parking"]);
  });

  it("orders multi-select by the question, not by what arrived", () => {
    // Two guests picking the same two things store the same value.
    expect(coerceAnswer(EXTRAS, ["Parking", "Coach"])).toEqual(["Coach", "Parking"]);
  });

  it("deduplicates a repeated option", () => {
    expect(coerceAnswer(EXTRAS, ["Coach", "Coach"])).toEqual(["Coach"]);
  });

  it("treats an empty multi-select as no answer", () => {
    expect(coerceAnswer(EXTRAS, [])).toBeUndefined();
    expect(coerceAnswer(EXTRAS, ["Nothing valid"])).toBeUndefined();
  });

  it("accepts a single string for a multi-select", () => {
    expect(coerceAnswer(EXTRAS, "Coach")).toEqual(["Coach"]);
  });

  it("takes only the first entry when an array arrives for a single question", () => {
    expect(coerceAnswer(MEAL, ["Beef", "Salmon"])).toBe("Beef");
  });

  it("treats a blank answer as no answer", () => {
    expect(coerceAnswer(TEXT, "")).toBeUndefined();
    expect(coerceAnswer(TEXT, "   ")).toBeUndefined();
  });

  it("keeps free text as typed", () => {
    expect(coerceAnswer(TEXT, "  No nuts please  ")).toBe("  No nuts please  ");
  });

  it("only accepts yes or no for a boolean", () => {
    const question = { type: "boolean", options: [] };
    expect(coerceAnswer(question, "yes")).toBe("yes");
    expect(coerceAnswer(question, "no")).toBe("no");
    expect(coerceAnswer(question, "maybe")).toBeUndefined();
  });

  it("only accepts numbers for a number question", () => {
    const question = { type: "number", options: [] };
    expect(coerceAnswer(question, "3")).toBe("3");
    expect(coerceAnswer(question, "-2.5")).toBe("-2.5");
    expect(coerceAnswer(question, "two")).toBeUndefined();
    expect(coerceAnswer(question, "3; drop table")).toBeUndefined();
  });

  it("falls back to text when a choice question has no options", () => {
    // A half-built question should still collect an answer rather than
    // silently discarding every reply to it.
    expect(coerceAnswer({ type: "single_select", options: [] }, "Anything")).toBeUndefined();
    expect(coerceAnswer({ type: "short_text", options: [] }, "Anything")).toBe("Anything");
  });
});
