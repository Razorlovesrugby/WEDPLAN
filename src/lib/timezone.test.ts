import { describe, expect, it } from "vitest";
import { utcToZonedInput, zonedInputToUtc } from "./timezone";

describe("zonedInputToUtc", () => {
  it("reads a summer time as the venue's clock, not the browser's", () => {
    // June in London is BST, one hour ahead of UTC.
    expect(zonedInputToUtc("2027-06-12T13:00", "Europe/London")).toBe("2027-06-12T12:00:00.000Z");
  });

  it("reads a winter time correctly, when the same zone has no offset", () => {
    expect(zonedInputToUtc("2027-01-12T13:00", "Europe/London")).toBe("2027-01-12T13:00:00.000Z");
  });

  it("handles the morning of a clock change", () => {
    // BST starts 2027-03-28 at 01:00 UTC. A 13:00 ceremony that day is BST.
    expect(zonedInputToUtc("2027-03-28T13:00", "Europe/London")).toBe("2027-03-28T12:00:00.000Z");
    // The day before, still GMT.
    expect(zonedInputToUtc("2027-03-27T13:00", "Europe/London")).toBe("2027-03-27T13:00:00.000Z");
  });

  it("works for a zone behind UTC", () => {
    expect(zonedInputToUtc("2027-06-12T13:00", "America/New_York")).toBe("2027-06-12T17:00:00.000Z");
  });

  it("returns null for junk rather than an invalid date", () => {
    expect(zonedInputToUtc("", "Europe/London")).toBeNull();
    expect(zonedInputToUtc("not-a-date", "Europe/London")).toBeNull();
  });
});

describe("utcToZonedInput", () => {
  it("round-trips through the form input", () => {
    const original = "2027-06-12T13:00";
    const stored = zonedInputToUtc(original, "Europe/London")!;
    expect(utcToZonedInput(stored, "Europe/London")).toBe(original);
  });

  it("round-trips across a zone behind UTC", () => {
    const original = "2027-11-04T09:30";
    const stored = zonedInputToUtc(original, "America/New_York")!;
    expect(utcToZonedInput(stored, "America/New_York")).toBe(original);
  });

  it("is empty for a missing time", () => {
    expect(utcToZonedInput(null, "Europe/London")).toBe("");
  });
});
