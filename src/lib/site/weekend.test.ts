import { describe, expect, it } from "vitest";
import {
  previewWeekendPath,
  weekendIcsEvents,
  weekendIcsPath,
  weekendSummary,
  type WeekendEvent,
} from "./weekend";

const event = (over: Partial<WeekendEvent> = {}): WeekendEvent => ({
  id: "e1",
  name: "Ceremony",
  starts_at: "2027-06-12T02:00:00Z",
  ends_at: null,
  venue: "St Mary's",
  address: "Church Lane, Wells",
  guest_note: null,
  ...over,
});

describe("weekendSummary", () => {
  it("names the day, in the wedding's timezone", () => {
    // 02:00 UTC on the 12th is 14:00 on the 12th in Auckland (UTC+12 in June).
    expect(weekendSummary([event()], "Pacific/Auckland")).toBe("1 event · Saturday 12 June");
  });

  it("files a small-hours event under the day the guests are in", () => {
    // 13:00 UTC on Saturday the 12th is 01:00 on SUNDAY the 13th in Auckland,
    // and a server in UTC would say Saturday.
    expect(weekendSummary([event({ starts_at: "2027-06-12T13:00:00Z" })], "Pacific/Auckland")).toBe(
      "1 event · Sunday 13 June",
    );
    expect(weekendSummary([event({ starts_at: "2027-06-12T13:00:00Z" })], "UTC")).toBe(
      "1 event · Saturday 12 June",
    );
  });

  it("counts events and lists each day once, in order", () => {
    const summary = weekendSummary(
      [
        event({ id: "b", starts_at: "2027-06-13T22:00:00Z" }), // Mon 14th NZ? no: 10:00 Mon
        event({ id: "a", starts_at: "2027-06-12T02:00:00Z" }),
        event({ id: "c", starts_at: "2027-06-12T05:00:00Z" }),
      ],
      "Pacific/Auckland",
    );
    expect(summary).toBe("3 events · Saturday 12 June and Monday 14 June");
  });

  it("reads three days the way a person would", () => {
    const summary = weekendSummary(
      [
        event({ id: "1", starts_at: "2027-06-11T02:00:00Z" }),
        event({ id: "2", starts_at: "2027-06-12T02:00:00Z" }),
        event({ id: "3", starts_at: "2027-06-13T02:00:00Z" }),
      ],
      "Pacific/Auckland",
    );
    expect(summary).toBe("3 events · Friday 11 June, Saturday 12 June and Sunday 13 June");
  });

  it("is null when nothing has a time", () => {
    expect(weekendSummary([], "UTC")).toBeNull();
    expect(weekendSummary([event({ starts_at: null }), event({ starts_at: "nonsense" })], "UTC")).toBeNull();
  });
});

describe("weekendIcsEvents", () => {
  it("keeps events with a start, and nothing else", () => {
    const out = weekendIcsEvents([event(), event({ id: "x", starts_at: null })], "Ray & Olivia");
    expect(out.map((e) => e.id)).toEqual(["e1"]);
  });

  it("joins venue and address, and tolerates either missing", () => {
    expect(weekendIcsEvents([event()], "W")[0]?.location).toBe("St Mary's, Church Lane, Wells");
    expect(weekendIcsEvents([event({ address: null })], "W")[0]?.location).toBe("St Mary's");
    expect(weekendIcsEvents([event({ venue: null, address: null })], "W")[0]?.location).toBeNull();
  });

  it("puts the guest note first and the wedding after it", () => {
    const [out] = weekendIcsEvents([event({ guest_note: "Park round the back." })], "Ray & Olivia");
    expect(out?.description).toBe("Park round the back.\n\nRay & Olivia");
    expect(weekendIcsEvents([event()], "Ray & Olivia")[0]?.description).toBe("Ray & Olivia");
  });
});

describe("weekendIcsPath", () => {
  it("is the household's own address, under the public API", () => {
    expect(weekendIcsPath("ray-and-olivia", "okonkwo-4f7ak")).toBe(
      "/api/public/weekend/ray-and-olivia/okonkwo-4f7ak",
    );
  });
});

describe("previewWeekendPath", () => {
  it("is keyed by the household's id behind the planner's sign-in, never by its address", () => {
    const path = previewWeekendPath("3f9c1a52-0000-4000-8000-000000000001");
    expect(path).toBe("/site/preview/weekend.ics?as=3f9c1a52-0000-4000-8000-000000000001");
    // The live route's credential must not leak into a planner-only URL.
    expect(path).not.toContain("/api/public");
  });
});
