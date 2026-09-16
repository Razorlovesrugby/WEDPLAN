import { describe, expect, it } from "vitest";
import { tierFor, type CutLine } from "./tier";

/**
 * These cases mirror supabase/tests/02_derived.sql one for one. The seed puts
 * ten households at a1–a9 and b1, with cut lines A ending 'a6' and B ending
 * 'a8', a trailing C with no boundary.
 */
describe("tierFor matches v_households", () => {
  const twoLines: CutLine[] = [
    { label: "A", position: 0, boundaryRank: "a6" },
    { label: "B", position: 1, boundaryRank: "a8" },
    { label: "C", position: 2, boundaryRank: null },
  ];

  it("places households above the cut in tier A", () => {
    expect(tierFor("a1", twoLines)).toEqual({ label: "A", position: 0 });
    expect(tierFor("a6", twoLines)).toEqual({ label: "A", position: 0 }); // on the line is above it
  });

  it("places the waitlist in tier B", () => {
    expect(tierFor("a7", twoLines)).toEqual({ label: "B", position: 1 });
    expect(tierFor("a8", twoLines)).toEqual({ label: "B", position: 1 });
  });

  it("places everything below the second line in tier C", () => {
    expect(tierFor("a9", twoLines)).toEqual({ label: "C", position: 2 });
    expect(tierFor("b1", twoLines)).toEqual({ label: "C", position: 2 });
  });

  it("re-tiers when a line moves, with no change to the households", () => {
    // The SQL suite moves the lines to 'a3'/'a5' and asserts the same shifts.
    const moved: CutLine[] = [
      { label: "A", position: 0, boundaryRank: "a3" },
      { label: "B", position: 1, boundaryRank: "a5" },
      { label: "C", position: 2, boundaryRank: null },
    ];
    expect(tierFor("a3", moved)).toEqual({ label: "A", position: 0 });
    expect(tierFor("a4", moved)).toEqual({ label: "B", position: 1 });
    expect(tierFor("a6", moved)).toEqual({ label: "C", position: 2 });
  });

  it("treats a single unset line as everybody being in", () => {
    const single: CutLine[] = [{ label: "A", position: 0, boundaryRank: null }];
    expect(tierFor("z9", single)).toEqual({ label: "A", position: 0 });
  });

  it("treats a two-line, one-unset-boundary config as one undivided waitlist", () => {
    const oneWaitlist: CutLine[] = [
      { label: "A", position: 0, boundaryRank: "a6" },
      { label: "B", position: 1, boundaryRank: null },
    ];
    expect(tierFor("a7", oneWaitlist)).toEqual({ label: "B", position: 1 });
    expect(tierFor("z9", oneWaitlist)).toEqual({ label: "B", position: 1 });
  });

  it("orders by bytes, as C collation does", () => {
    // 'B' < 'a' in C collation and in JavaScript, but not in en_US.UTF-8.
    const single: CutLine[] = [{ label: "A", position: 0, boundaryRank: "a" }];
    expect(tierFor("B", single)).toEqual({ label: "A", position: 0 });
  });

  it("handles 3+ lines, unordered input", () => {
    const four: CutLine[] = [
      { label: "Long shot", position: 3, boundaryRank: null },
      { label: "Definitely", position: 0, boundaryRank: "a2" },
      { label: "Would love to", position: 1, boundaryRank: "a5" },
      { label: "If the venue frees up", position: 2, boundaryRank: "a8" },
    ];
    expect(tierFor("a1", four)).toEqual({ label: "Definitely", position: 0 });
    expect(tierFor("a4", four)).toEqual({ label: "Would love to", position: 1 });
    expect(tierFor("a7", four)).toEqual({ label: "If the venue frees up", position: 2 });
    expect(tierFor("z9", four)).toEqual({ label: "Long shot", position: 3 });
  });

  it("deleting a middle line merges its households into the one below, with no change elsewhere", () => {
    const before: CutLine[] = [
      { label: "A", position: 0, boundaryRank: "a3" },
      { label: "Maybe", position: 1, boundaryRank: "a6" },
      { label: "C", position: 2, boundaryRank: null },
    ];
    expect(tierFor("a5", before)).toEqual({ label: "Maybe", position: 1 });

    // "Maybe" removed; positions of the survivors are untouched.
    const after: CutLine[] = [
      { label: "A", position: 0, boundaryRank: "a3" },
      { label: "C", position: 2, boundaryRank: null },
    ];
    expect(tierFor("a5", after)).toEqual({ label: "C", position: 2 });
    expect(tierFor("a2", after)).toEqual({ label: "A", position: 0 });
  });

  it("allows two adjacent lines to share a boundary (a zero-width tier)", () => {
    const zeroWidth: CutLine[] = [
      { label: "A", position: 0, boundaryRank: "a6" },
      { label: "Empty for now", position: 1, boundaryRank: "a6" },
      { label: "C", position: 2, boundaryRank: null },
    ];
    // Nobody can ever land in "Empty for now" — the line above already
    // claims everything up to and including the shared boundary.
    expect(tierFor("a6", zeroWidth)).toEqual({ label: "A", position: 0 });
    expect(tierFor("a7", zeroWidth)).toEqual({ label: "C", position: 2 });
  });
});
