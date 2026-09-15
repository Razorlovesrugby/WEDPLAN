import { describe, expect, it } from "vitest";
import { convertAmount, resolveFxRate } from "./fx";

describe("resolveFxRate", () => {
  it("prefers today's cache over everything else", () => {
    expect(resolveFxRate({ cachedToday: 1.25, liveRate: 1.3, cachedStale: 1.1 })).toEqual({
      status: "cache_hit",
      rate: 1.25,
    });
  });

  it("falls through to a live call on a cache miss", () => {
    expect(resolveFxRate({ cachedToday: null, liveRate: 1.3, cachedStale: 1.1 })).toEqual({
      status: "live",
      rate: 1.3,
    });
  });

  it("falls through to the most recent stale cache when the live call fails", () => {
    expect(resolveFxRate({ cachedToday: null, liveRate: null, cachedStale: 1.1 })).toEqual({
      status: "stale_fallback",
      rate: 1.1,
    });
  });

  it("falls through to manual entry when nothing is available — never a blocked save", () => {
    expect(resolveFxRate({ cachedToday: null, liveRate: null, cachedStale: null })).toEqual({
      status: "manual_required",
    });
  });
});

describe("convertAmount", () => {
  it("multiplies by the snapshotted rate", () => {
    expect(convertAmount(10000, 1.25)).toBe(12500);
  });

  it("treats a null rate as 1 — the row's currency already matches base_currency", () => {
    expect(convertAmount(10000, null)).toBe(10000);
  });

  it("rounds to the nearest minor unit", () => {
    expect(convertAmount(333, 1.111)).toBe(370); // 369.963 -> 370
  });
});
