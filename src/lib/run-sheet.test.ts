import { describe, expect, it } from "vitest";
import { computeConflicts, resolveRunSheetTimes, type RunSheetItemInput } from "./run-sheet";

const EVENT = "event-1";

function item(overrides: Partial<RunSheetItemInput> & { id: string }): RunSheetItemInput {
  return {
    eventId: EVENT,
    pinned: false,
    pinnedAt: null,
    durationMinutes: 30,
    predecessorId: null,
    offsetMinutes: 0,
    ...overrides,
  };
}

describe("resolveRunSheetTimes", () => {
  it("uses pinned_at directly for a pinned item", () => {
    const ceremony = item({ id: "ceremony", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z", durationMinutes: 30 });
    const times = resolveRunSheetTimes([ceremony]);
    expect(times.get("ceremony")).toEqual({
      startsAt: "2027-06-12T13:00:00.000Z",
      endsAt: "2027-06-12T13:30:00.000Z",
    });
  });

  it("chains an unpinned item off its predecessor's end, plus the offset", () => {
    const ceremony = item({ id: "ceremony", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z", durationMinutes: 30 });
    const photos = item({ id: "photos", predecessorId: "ceremony", offsetMinutes: 10, durationMinutes: 45 });
    const times = resolveRunSheetTimes([ceremony, photos]);
    expect(times.get("photos")).toEqual({
      startsAt: "2027-06-12T13:40:00.000Z", // 13:30 + 10 min gap
      endsAt: "2027-06-12T14:25:00.000Z", // + 45 min duration
    });
  });

  it("resolves a multi-item chain regardless of input order", () => {
    const speeches = item({ id: "speeches", predecessorId: "mains", durationMinutes: 20 });
    const mains = item({ id: "mains", predecessorId: "reception", durationMinutes: 60 });
    const reception = item({ id: "reception", pinned: true, pinnedAt: "2027-06-12T17:00:00.000Z", durationMinutes: 30 });
    const times = resolveRunSheetTimes([speeches, mains, reception]);
    expect(times.get("mains")).toEqual({
      startsAt: "2027-06-12T17:30:00.000Z",
      endsAt: "2027-06-12T18:30:00.000Z",
    });
    expect(times.get("speeches")).toEqual({
      startsAt: "2027-06-12T18:30:00.000Z",
      endsAt: "2027-06-12T18:50:00.000Z",
    });
  });

  it("leaves an unpinned item with no predecessor as time TBD", () => {
    const evening = item({ id: "evening" });
    const times = resolveRunSheetTimes([evening]);
    expect(times.get("evening")).toEqual({ startsAt: null, endsAt: null });
  });

  it("propagates TBD forward through a chain hanging off an undated item", () => {
    const tbd = item({ id: "tbd" });
    const after = item({ id: "after", predecessorId: "tbd", durationMinutes: 15 });
    const times = resolveRunSheetTimes([tbd, after]);
    expect(times.get("after")).toEqual({ startsAt: null, endsAt: null });
  });

  it("resolves a cycle to TBD for every item in it, instead of recursing forever", () => {
    const a = item({ id: "a", predecessorId: "b" });
    const b = item({ id: "b", predecessorId: "a" });
    const times = resolveRunSheetTimes([a, b]);
    expect(times.get("a")).toEqual({ startsAt: null, endsAt: null });
    expect(times.get("b")).toEqual({ startsAt: null, endsAt: null });
  });

  it("keeps chains in different events independent", () => {
    const ceremony = item({ id: "ceremony", eventId: "e1", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z" });
    const rehearsal = item({ id: "rehearsal", eventId: "e2", pinned: true, pinnedAt: "2027-06-11T18:00:00.000Z" });
    const times = resolveRunSheetTimes([ceremony, rehearsal]);
    expect(times.get("ceremony")?.startsAt).toBe("2027-06-12T13:00:00.000Z");
    expect(times.get("rehearsal")?.startsAt).toBe("2027-06-11T18:00:00.000Z");
  });
});

describe("computeConflicts", () => {
  it("flags an item whose computed end runs past the next pinned anchor", () => {
    const ceremony = item({ id: "ceremony", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z", durationMinutes: 30 });
    // Photos run long enough to bump into the reception's fixed start.
    const photos = item({ id: "photos", predecessorId: "ceremony", durationMinutes: 90 });
    const reception = item({ id: "reception", pinned: true, pinnedAt: "2027-06-12T14:30:00.000Z", durationMinutes: 60 });
    const items = [ceremony, photos, reception];
    const times = resolveRunSheetTimes(items);
    const conflicts = computeConflicts(items, times);
    expect(conflicts.has("photos")).toBe(true);
    expect(conflicts.has("ceremony")).toBe(false);
    expect(conflicts.has("reception")).toBe(false);
  });

  it("does not flag an item that fits comfortably before the next pin", () => {
    const ceremony = item({ id: "ceremony", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z", durationMinutes: 30 });
    const photos = item({ id: "photos", predecessorId: "ceremony", durationMinutes: 20 });
    const reception = item({ id: "reception", pinned: true, pinnedAt: "2027-06-12T14:30:00.000Z", durationMinutes: 60 });
    const items = [ceremony, photos, reception];
    const times = resolveRunSheetTimes(items);
    expect(computeConflicts(items, times).size).toBe(0);
  });

  it("never flags a time-TBD item", () => {
    const tbd = item({ id: "tbd" });
    const items = [tbd];
    const times = resolveRunSheetTimes(items);
    expect(computeConflicts(items, times).size).toBe(0);
  });

  it("only compares against pinned anchors in the same event", () => {
    const ceremony = item({ id: "ceremony", eventId: "e1", pinned: true, pinnedAt: "2027-06-12T13:00:00.000Z", durationMinutes: 30 });
    const photos = item({ id: "photos", eventId: "e1", predecessorId: "ceremony", durationMinutes: 90 });
    // A pin in a different event, at a time that would otherwise conflict.
    const other = item({ id: "other", eventId: "e2", pinned: true, pinnedAt: "2027-06-12T14:00:00.000Z", durationMinutes: 30 });
    const items = [ceremony, photos, other];
    const times = resolveRunSheetTimes(items);
    expect(computeConflicts(items, times).has("photos")).toBe(false);
  });
});
