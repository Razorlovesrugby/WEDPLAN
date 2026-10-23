import { describe, expect, it } from "vitest";
import { awaitingArrival, buyerMayRelease, isClaimStatus, needsThanks, nextStatus, statusColumn } from "./status";

describe("claim status", () => {
  it("moves claimed → bought → arrived → thanked and stops", () => {
    expect(nextStatus("claimed")).toBe("bought");
    expect(nextStatus("bought")).toBe("arrived");
    expect(nextStatus("arrived")).toBe("thanked");
    expect(nextStatus("thanked")).toBeNull();
  });
  it("knows which timestamp each stage writes", () => {
    expect(statusColumn("claimed")).toBeNull();
    expect(statusColumn("arrived")).toBe("arrived_at");
  });
  it("validates unknown strings", () => {
    expect(isClaimStatus("bought")).toBe(true);
    expect(isClaimStatus("banana")).toBe(false);
  });
  it("lets a buyer undo only before the gift exists — matching the SQL function", () => {
    expect(buyerMayRelease("claimed", null)).toBe(true);
    expect(buyerMayRelease("bought", null)).toBe(true);
    expect(buyerMayRelease("arrived", null)).toBe(false);
    expect(buyerMayRelease("claimed", "2026-01-01")).toBe(false);
  });
  it("names the thank-you list and the waiting list", () => {
    expect(needsThanks({ status: "arrived", released_at: null })).toBe(true);
    expect(needsThanks({ status: "thanked", released_at: null })).toBe(false);
    expect(needsThanks({ status: "arrived", released_at: "x" })).toBe(false);
    expect(awaitingArrival({ status: "bought", released_at: null })).toBe(true);
    expect(awaitingArrival({ status: "arrived", released_at: null })).toBe(false);
  });
});
