import { describe, expect, it } from "vitest";
import { fundProgress, safeContributeUrl } from "./gift-funds";

describe("fundProgress", () => {
  it("is the plain proportion in the ordinary case", () => {
    expect(fundProgress(74_000, 120_000)).toBeCloseTo(0.6167, 4);
    expect(fundProgress(0, 120_000)).toBe(0);
  });

  it("clamps a fund that beat its target rather than overflowing the rule", () => {
    // The figures underneath still read $1,400 / $1,200. The bar is just full.
    expect(fundProgress(140_000, 120_000)).toBe(1);
  });

  it("draws no rule for a fund with no target", () => {
    expect(fundProgress(50_000, null)).toBeNull();
    // A zero target would divide by nothing and draw a full bar over an empty
    // fund, which is the opposite of the truth.
    expect(fundProgress(0, 0)).toBeNull();
  });
});

describe("safeContributeUrl", () => {
  it("passes http and https through untouched", () => {
    expect(safeContributeUrl("https://wise.com/pay/abc")).toBe("https://wise.com/pay/abc");
    expect(safeContributeUrl("  http://example.test/give  ")).toBe("http://example.test/give");
  });

  it("refuses anything that is not a web address", () => {
    // The value ends up in an href in front of every guest.
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative", "wise.com", "", null]) {
      expect(safeContributeUrl(bad), String(bad)).toBeNull();
    }
  });
});
