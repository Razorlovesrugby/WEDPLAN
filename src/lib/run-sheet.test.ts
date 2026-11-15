import { describe, expect, it } from "vitest";
import {
  addMinutesIso,
  assigneeKey,
  axisRange,
  conflictingItems,
  dayKeyOf,
  dayWindow,
  daysWithItems,
  defaultDay,
  followerStart,
  followersOf,
  latestEnd,
  overlaps,
  packLanes,
  spanMinutes,
  timesProblem,
  wouldLoop,
} from "./run-sheet";

const LONDON = "Europe/London";
const AUCKLAND = "Pacific/Auckland";

/** A UTC instant on 2027-06-12, by HH:MM. */
function t(hhmm: string, day = 12): string {
  return `2027-06-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
}

function item(id: string, start: string, end: string) {
  return { id, startsAt: t(start), endsAt: t(end) };
}

describe("overlaps", () => {
  it("is true when each starts before the other ends", () => {
    expect(overlaps(item("a", "13:00", "14:00"), item("b", "13:30", "14:30"))).toBe(true);
  });

  it("is false for items that only touch", () => {
    expect(overlaps(item("a", "13:00", "14:00"), item("b", "14:00", "15:00"))).toBe(false);
  });

  it("is true for one item entirely inside another", () => {
    expect(overlaps(item("a", "13:00", "17:00"), item("b", "14:00", "14:30"))).toBe(true);
  });
});

describe("conflictingItems", () => {
  const photos = { ...item("photos", "15:00", "16:00"), assignees: [assigneeKey("vendor", "photog")] };
  const family = { ...item("family", "15:30", "16:30"), assignees: [assigneeKey("vendor", "photog"), assigneeKey("guest", "nan")] };
  const band = { ...item("band", "15:30", "16:30"), assignees: [assigneeKey("person", "dj")] };
  const later = { ...item("later", "16:00", "17:00"), assignees: [assigneeKey("vendor", "photog")] };

  it("finds an overlapping item that shares an assignee", () => {
    expect(conflictingItems(photos, [family, band, later]).map((i) => i.id)).toEqual(["family"]);
  });

  it("ignores an overlap with nobody in common", () => {
    expect(conflictingItems(band, [photos, family])).toEqual([]);
  });

  it("ignores items that touch", () => {
    expect(conflictingItems(photos, [later])).toEqual([]);
  });

  it("never reports an unassigned item, or the item itself", () => {
    expect(conflictingItems({ ...photos, assignees: [] }, [family])).toEqual([]);
    expect(conflictingItems(photos, [photos])).toEqual([]);
  });
});

describe("packLanes", () => {
  it("gives an item with no neighbours the full width", () => {
    const placed = packLanes([item("a", "13:00", "14:00")]);
    expect(placed.get("a")).toEqual({ lane: 0, lanes: 1, span: 1 });
  });

  it("puts two overlapping items side by side", () => {
    const placed = packLanes([item("a", "13:00", "14:00"), item("b", "13:30", "14:30")]);
    expect(placed.get("a")).toEqual({ lane: 0, lanes: 2, span: 1 });
    expect(placed.get("b")).toEqual({ lane: 1, lanes: 2, span: 1 });
  });

  it("reuses a lane once its item has ended", () => {
    const placed = packLanes([
      item("a", "13:00", "14:00"),
      item("b", "13:30", "15:00"),
      item("c", "14:00", "14:30"),
    ]);
    expect(placed.get("c")!.lane).toBe(0);
    expect(placed.get("c")!.lanes).toBe(2);
  });

  it("keeps items that merely touch in the same lane and the same width", () => {
    const placed = packLanes([item("a", "13:00", "14:00"), item("b", "14:00", "15:00")]);
    expect(placed.get("a")).toEqual({ lane: 0, lanes: 1, span: 1 });
    expect(placed.get("b")).toEqual({ lane: 0, lanes: 1, span: 1 });
  });

  it("chains overlap through a middle item into one cluster", () => {
    const placed = packLanes([
      item("a", "13:00", "14:00"),
      item("b", "13:30", "15:00"),
      item("c", "14:30", "16:00"),
    ]);
    expect(placed.get("a")!.lanes).toBe(2);
    expect(placed.get("c")!.lanes).toBe(2);
  });

  it("starts a new cluster when nothing overlaps the previous one", () => {
    const placed = packLanes([
      item("a", "13:00", "14:00"),
      item("b", "13:30", "14:30"),
      item("c", "18:00", "19:00"),
    ]);
    expect(placed.get("c")).toEqual({ lane: 0, lanes: 1, span: 1 });
  });

  it("lets one long item sit beside several short ones, which share the other column", () => {
    const placed = packLanes([
      item("long", "13:00", "17:00"),
      item("s1", "13:00", "14:00"),
      item("s2", "14:00", "15:00"),
      item("s3", "15:00", "16:00"),
    ]);
    expect(placed.get("long")!.lanes).toBe(2);
    expect(placed.get("s1")!.lane).toBe(1);
    expect(placed.get("s2")!.lane).toBe(1);
    expect(placed.get("s3")!.lane).toBe(1);
  });

  it("widens an item into lanes that are free while it runs", () => {
    const placed = packLanes([
      item("x", "13:00", "17:00"),
      item("y", "13:00", "14:00"),
      item("z", "13:00", "14:00"),
      item("w", "14:00", "15:00"),
    ]);
    expect(placed.get("x")).toEqual({ lane: 0, lanes: 3, span: 1 });
    // y and z share 13:00 to 14:00, so neither may widen into the other's lane.
    expect(placed.get("y")!.span).toBe(1);
    expect(placed.get("z")!.span).toBe(1);
    // w starts when z has ended, so it takes z's lane as well as its own.
    expect(placed.get("w")).toEqual({ lane: 1, lanes: 3, span: 2 });
  });

  it("gives a milestone room: a zero-length item does not sit on top of a neighbour", () => {
    const placed = packLanes([
      { id: "cake", startsAt: t("20:00"), endsAt: t("20:00") },
      item("band", "20:00", "21:00"),
    ]);
    expect(placed.get("cake")!.lanes).toBe(2);
  });

  it("is stable for identical times", () => {
    const placed = packLanes([item("a", "13:00", "14:00"), item("b", "13:00", "14:00")]);
    expect(placed.get("a")!.lane).not.toBe(placed.get("b")!.lane);
  });
});

describe("days run from 06:00 to 06:00 in the wedding's timezone", () => {
  it("puts a 00:30 item on the evening before", () => {
    // 2027-06-13 00:30 in London (BST) is 2027-06-12 23:30 UTC.
    expect(dayKeyOf("2027-06-12T23:30:00.000Z", LONDON)).toBe("2027-06-12");
  });

  it("puts a 06:00 item on its own day", () => {
    // 2027-06-13 06:00 London = 05:00 UTC.
    expect(dayKeyOf("2027-06-13T05:00:00.000Z", LONDON)).toBe("2027-06-13");
  });

  it("uses the wedding's timezone, not UTC", () => {
    // 2027-06-12 20:00 UTC is 2027-06-13 08:00 in Auckland (NZST, +12).
    expect(dayKeyOf("2027-06-12T20:00:00.000Z", AUCKLAND)).toBe("2027-06-13");
    expect(dayKeyOf("2027-06-12T20:00:00.000Z", LONDON)).toBe("2027-06-12");
  });

  it("works when the viewer is in London and the wedding is in Auckland in February (NZDT, +13)", () => {
    // 2027-02-13 00:30 Auckland = 2027-02-12 11:30 UTC.
    expect(dayKeyOf("2027-02-12T11:30:00.000Z", AUCKLAND)).toBe("2027-02-12");
    // 2027-02-13 06:00 Auckland = 2027-02-12 17:00 UTC.
    expect(dayKeyOf("2027-02-12T17:00:00.000Z", AUCKLAND)).toBe("2027-02-13");
  });

  it("builds a window from 06:00 to the next 06:00", () => {
    const w = dayWindow("2027-06-12", LONDON);
    expect(new Date(w.startMs).toISOString()).toBe("2027-06-12T05:00:00.000Z");
    expect(new Date(w.endMs).toISOString()).toBe("2027-06-13T05:00:00.000Z");
  });

  it("makes a day 25 hours long when the clocks go back, and 23 when they go forward", () => {
    // London: clocks go back Sunday 2027-10-31, forward Sunday 2027-03-28.
    const back = dayWindow("2027-10-30", LONDON);
    expect((back.endMs - back.startMs) / 3_600_000).toBe(25);
    const forward = dayWindow("2027-03-27", LONDON);
    expect((forward.endMs - forward.startMs) / 3_600_000).toBe(23);
  });

  it("lets an item end as late as 06:00 the next morning", () => {
    expect(latestEnd("2027-06-12T18:00:00.000Z", LONDON)).toBe("2027-06-13T05:00:00.000Z");
  });

  it("measures the limit from the item's own day, so a 01:00 item may run to 06:00 that morning", () => {
    // 2027-06-13 01:00 London = 2027-06-13 00:00 UTC, still the 12th's day.
    expect(latestEnd("2027-06-13T00:00:00.000Z", LONDON)).toBe("2027-06-13T05:00:00.000Z");
  });
});

describe("timesProblem", () => {
  it("accepts a normal item", () => {
    expect(timesProblem(t("13:00"), t("14:00"), LONDON)).toBeNull();
  });

  it("accepts a zero-length item", () => {
    expect(timesProblem(t("13:00"), t("13:00"), LONDON)).toBeNull();
  });

  it("refuses an end before the start", () => {
    expect(timesProblem(t("14:00"), t("13:00"), LONDON)).toMatch(/before the start/);
  });

  it("refuses an end after 06:00 the next morning", () => {
    expect(timesProblem(t("18:00"), t("06:00", 13), LONDON)).toMatch(/06:00/);
  });

  it("accepts an end just before 06:00 the next morning", () => {
    expect(timesProblem(t("20:00"), t("04:30", 13), LONDON)).toBeNull();
  });

  it("refuses garbage", () => {
    expect(timesProblem("nope", t("13:00"), LONDON)).not.toBeNull();
  });
});

describe("days with items", () => {
  const items = [
    item("a", "13:00", "14:00"),
    { id: "b", startsAt: "2027-06-11T17:00:00.000Z", endsAt: "2027-06-11T19:00:00.000Z" },
    { id: "c", startsAt: "2027-06-12T23:30:00.000Z", endsAt: "2027-06-13T01:00:00.000Z" },
  ];

  it("lists each day once, in order, with the late-night item on the evening before", () => {
    expect(daysWithItems(items, LONDON)).toEqual(["2027-06-11", "2027-06-12"]);
  });

  it("opens on the wedding date when it has items", () => {
    expect(defaultDay(["2027-06-11", "2027-06-12"], "2027-06-12")).toBe("2027-06-12");
  });

  it("opens on the earliest day when the wedding date has none", () => {
    expect(defaultDay(["2027-06-11", "2027-06-13"], "2027-06-12")).toBe("2027-06-11");
    expect(defaultDay(["2027-06-11"], null)).toBe("2027-06-11");
  });

  it("has no day without items", () => {
    expect(defaultDay([], "2027-06-12")).toBeNull();
  });
});

describe("axisRange", () => {
  it("pads by 30 minutes and rounds out to whole hours", () => {
    const range = axisRange([item("a", "13:15", "14:20"), item("b", "14:00", "16:10")])!;
    expect(new Date(range.startMs).toISOString()).toBe("2027-06-12T12:00:00.000Z");
    expect(new Date(range.endMs).toISOString()).toBe("2027-06-12T17:00:00.000Z");
  });

  it("is null with no items", () => {
    expect(axisRange([])).toBeNull();
  });
});

describe("starts after", () => {
  it("starts an item the gap after its predecessor ends", () => {
    expect(followerStart(t("15:00"), 15)).toBe(t("15:15"));
    expect(followerStart(t("15:00"), 0)).toBe(t("15:00"));
  });

  it("measures a span in minutes", () => {
    expect(spanMinutes(t("13:00"), t("14:30"))).toBe(90);
    expect(addMinutesIso(t("13:00"), 45)).toBe(t("13:45"));
  });

  const chain = [
    { id: "cer", predecessorId: null },
    { id: "photos", predecessorId: "cer" },
    { id: "drinks", predecessorId: "cer" },
    { id: "recep", predecessorId: "photos" },
    { id: "speeches", predecessorId: "recep" },
    { id: "alone", predecessorId: null },
  ];

  it("finds followers through several levels, and two followers of one item", () => {
    expect([...followersOf(chain, "cer")].sort()).toEqual(["drinks", "photos", "recep", "speeches"]);
    expect([...followersOf(chain, "photos")].sort()).toEqual(["recep", "speeches"]);
    expect([...followersOf(chain, "alone")]).toEqual([]);
  });

  it("refuses a loop, directly or through others", () => {
    expect(wouldLoop(chain, "cer", "cer")).toBe(true);
    expect(wouldLoop(chain, "cer", "speeches")).toBe(true);
    expect(wouldLoop(chain, "photos", "recep")).toBe(true);
  });

  it("allows a link that is not a loop", () => {
    expect(wouldLoop(chain, "drinks", "photos")).toBe(false);
    expect(wouldLoop(chain, "alone", "speeches")).toBe(false);
  });

  it("terminates on data that already loops", () => {
    const loop = [
      { id: "a", predecessorId: "b" },
      { id: "b", predecessorId: "a" },
    ];
    expect([...followersOf(loop, "a")].sort()).toEqual(["a", "b"]);
  });
});
