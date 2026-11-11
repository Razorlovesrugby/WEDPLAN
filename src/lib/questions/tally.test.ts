import { describe, expect, it } from "vitest";
import { BLANK, OTHER, answerKeys, tallyQuestion, type TallyAnswer } from "./tally";

const guest = (id: string, value: TallyAnswer["value"]): TallyAnswer => ({ guest_id: id, household_id: null, value });
const household = (id: string, value: TallyAnswer["value"]): TallyAnswer => ({
  guest_id: null,
  household_id: id,
  value,
});

describe("tallyQuestion", () => {
  const yesNo = { type: "boolean" as const, scope: "guest" as const, options: [] };

  it("counts yes, no, blank and not replied", () => {
    const tally = tallyQuestion(
      yesNo,
      [guest("a", "yes"), guest("b", "yes"), guest("c", "no"), guest("d", null)],
      new Set(["a", "b", "c", "d", "e", "f"]),
    );
    expect(tally.buckets).toEqual([
      { key: "yes", label: "Yes", count: 2 },
      { key: "no", label: "No", count: 1 },
    ]);
    expect(tally.answered).toBe(3);
    expect(tally.blank).toBe(1);
    expect(tally.notReplied).toBe(2);
  });

  it("ignores answers from anyone out of scope (deleted, or invited to nothing)", () => {
    const tally = tallyQuestion(yesNo, [guest("a", "yes"), guest("gone", "yes")], new Set(["a"]));
    expect(tally.buckets[0]!.count).toBe(1);
    expect(tally.notReplied).toBe(0);
  });

  it("counts a household answer once, by household", () => {
    const q = { type: "boolean" as const, scope: "household" as const, options: [] };
    const tally = tallyQuestion(q, [household("h1", "yes"), guest("a", "no")], new Set(["h1", "h2"]));
    expect(tally.buckets).toEqual([
      { key: "yes", label: "Yes", count: 1 },
      { key: "no", label: "No", count: 0 },
    ]);
    expect(tally.notReplied).toBe(1);
  });

  it("counts each choice of a multi-select, and options removed since as Other", () => {
    const q = { type: "multi_select" as const, scope: "guest" as const, options: ["Bus", "Car"] };
    const tally = tallyQuestion(
      q,
      [guest("a", ["Bus", "Car"]), guest("b", ["Bus"]), guest("c", ["Boat"]), guest("d", [])],
      new Set(["a", "b", "c", "d"]),
    );
    expect(tally.buckets).toEqual([
      { key: "Bus", label: "Bus", count: 2 },
      { key: "Car", label: "Car", count: 1 },
      { key: OTHER, label: "Other", count: 1 },
    ]);
    expect(tally.answered).toBe(3);
    expect(tally.blank).toBe(1);
  });

  it("sums number answers", () => {
    const q = { type: "number" as const, scope: "household" as const, options: [] };
    const tally = tallyQuestion(q, [household("h1", "2"), household("h2", "5")], new Set(["h1", "h2"]));
    expect(tally.numbers).toEqual({ total: 7, min: 2, max: 5 });
    expect(tally.buckets).toEqual([]);
  });

  it("has no numbers when nobody answered", () => {
    const q = { type: "number" as const, scope: "guest" as const, options: [] };
    expect(tallyQuestion(q, [], new Set(["a"])).numbers).toBeNull();
  });
});

describe("answerKeys", () => {
  it("files a blank text answer as blank and a real one under no option", () => {
    const q = { type: "short_text" as const, scope: "guest" as const, options: [] };
    expect(answerKeys(q, "  ")).toEqual([BLANK]);
    expect(answerKeys(q, "Arriving Friday")).toEqual([]);
  });

  it("files a single choice under its option", () => {
    const q = { type: "single_select" as const, scope: "guest" as const, options: ["Fish", "Beef"] };
    expect(answerKeys(q, "Beef")).toEqual(["Beef"]);
    expect(answerKeys(q, "Lamb")).toEqual([OTHER]);
  });
});
