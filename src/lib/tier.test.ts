import { describe, expect, it } from "vitest";
import { tierFor } from "./tier";

/**
 * These cases mirror supabase/tests/02_derived.sql one for one. The seed puts
 * ten households at a1–a9 and b1, with cut_rank 'a6' and tier_b_rank 'a8'.
 */
describe("tierFor matches v_households", () => {
  const cut = "a6";
  const tierB = "a8";

  it("places households above the cut in tier A", () => {
    expect(tierFor("a1", cut, tierB)).toBe("A");
    expect(tierFor("a6", cut, tierB)).toBe("A"); // on the line is above it
  });

  it("places the waitlist in tier B", () => {
    expect(tierFor("a7", cut, tierB)).toBe("B");
    expect(tierFor("a8", cut, tierB)).toBe("B");
  });

  it("places everything below the second line in tier C", () => {
    expect(tierFor("a9", cut, tierB)).toBe("C");
    expect(tierFor("b1", cut, tierB)).toBe("C");
  });

  it("re-tiers when the cut line moves, with no change to the households", () => {
    // The SQL suite moves the lines to 'a3'/'a5' and asserts the same shifts.
    expect(tierFor("a3", "a3", "a5")).toBe("A");
    expect(tierFor("a4", "a3", "a5")).toBe("B");
    expect(tierFor("a6", "a3", "a5")).toBe("C");
  });

  it("treats an unset cut line as everybody being in", () => {
    expect(tierFor("z9", null, null)).toBe("A");
  });

  it("treats a single cut line as one undivided waitlist", () => {
    expect(tierFor("a7", "a6", null)).toBe("B");
    expect(tierFor("z9", "a6", null)).toBe("B");
  });

  it("orders by bytes, as C collation does", () => {
    // 'B' < 'a' in C collation and in JavaScript, but not in en_US.UTF-8.
    expect(tierFor("B", "a", null)).toBe("A");
  });
});
