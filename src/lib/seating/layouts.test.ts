import { describe, expect, it } from "vitest";
import { chooseLayout, DELETED_DRAFT_DAYS, orderLayouts, recentlyDeleted, suggestDraftName, swapReport, type LayoutSummary } from "./layouts";
import type { SeatingGuest } from "./model";

const layout = (id: string, name: string, over: Partial<LayoutSummary> = {}): LayoutSummary => ({
  id,
  name,
  isLive: false,
  lockedAt: null,
  lockedBy: null,
  deletedAt: null,
  tables: 0,
  seated: 0,
  ...over,
});

const guest = (id: string, over: Partial<SeatingGuest> = {}): SeatingGuest => ({
  id,
  householdId: "h",
  householdName: "H",
  firstName: id,
  lastName: null,
  preferredName: null,
  ageBand: "adult",
  side: null,
  dietary: null,
  accessibility: null,
  plusOneFor: null,
  tagIds: [],
  invited: true,
  excluded: false,
  rsvp: "yes",
  needsHighchair: false,
  usesWheelchair: false,
  dietaryNeeds: [],
  replyChangedAt: null,
  arrivedAt: null,
  ...over,
});

describe("chooseLayout", () => {
  const all = [layout("d1", "Draft 1"), layout("live", "Main", { isLive: true }), layout("gone", "Old", { deletedAt: "2026-11-01T00:00:00Z" })];
  it("shows the one asked for", () => expect(chooseLayout(all, "d1")?.id).toBe("d1"));
  it("falls back to the live one", () => expect(chooseLayout(all, undefined)?.id).toBe("live"));
  it("never shows a deleted draft, even when asked for by id", () => expect(chooseLayout(all, "gone")?.id).toBe("live"));
  it("an unknown id is the live layout", () => expect(chooseLayout(all, "nope")?.id).toBe("live"));
  it("an event with no layouts has none to show", () => expect(chooseLayout([], null)).toBeNull());
  it("with no live layout, the first open one", () => expect(chooseLayout([layout("a", "A"), layout("b", "B")])?.id).toBe("a"));
});

describe("orderLayouts", () => {
  it("puts live first, then drafts in natural name order, and drops deleted ones", () => {
    const out = orderLayouts([
      layout("c", "Draft 10"),
      layout("a", "Draft 2"),
      layout("live", "Main", { isLive: true }),
      layout("x", "Gone", { deletedAt: "2026-11-01T00:00:00Z" }),
    ]);
    expect(out.map((l) => l.id)).toEqual(["live", "a", "c"]);
  });
});

describe("recentlyDeleted", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const day = 86_400_000;
  it("lists drafts deleted inside the window, newest first", () => {
    const out = recentlyDeleted(
      [
        layout("old", "Old", { deletedAt: new Date(now.getTime() - (DELETED_DRAFT_DAYS + 1) * day).toISOString() }),
        layout("a", "A", { deletedAt: new Date(now.getTime() - 3 * day).toISOString() }),
        layout("b", "B", { deletedAt: new Date(now.getTime() - 1 * day).toISOString() }),
        layout("open", "Open"),
      ],
      now,
    );
    expect(out.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("suggestDraftName", () => {
  it("is one past the highest Draft N", () => expect(suggestDraftName(["Main", "Draft 1", "draft 3", "Long tables"])).toBe("Draft 4"));
  it("starts at 1", () => expect(suggestDraftName(["Main"])).toBe("Draft 1"));
});

describe("swapReport", () => {
  const guests = [
    guest("seated"),
    guest("new"), // joined since the draft was copied
    guest("declined", { rsvp: "no" }),
    guest("uninvited", { invited: false }),
    guest("unable", { excluded: true }),
    guest("pending", { rsvp: null }),
  ];
  const seats = [
    { guestId: "seated", tableId: "t", seatIndex: null },
    { guestId: "declined", tableId: "t", seatIndex: null },
    { guestId: "unable", tableId: "t", seatIndex: 2 },
  ];
  it("names the coming guests the draft doesn't seat", () => {
    expect(swapReport(guests, seats).unseatedComing.map((g) => g.id).sort()).toEqual(["new", "pending"]);
  });
  it("names the guests it seats who are no longer coming", () => {
    expect(swapReport(guests, seats).seatedNotComing.map((g) => g.id).sort()).toEqual(["declined", "unable"]);
  });
  it("is empty when everyone coming is seated", () => {
    const r = swapReport([guest("a")], [{ guestId: "a", tableId: "t", seatIndex: null }]);
    expect(r.unseatedComing).toEqual([]);
    expect(r.seatedNotComing).toEqual([]);
  });
});
