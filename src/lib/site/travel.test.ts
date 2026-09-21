import { describe, expect, it } from "vitest";
import {
  arrivalHeading,
  formatCostRange,
  formatDuration,
  groupByArrival,
  type ArrivalPoint,
  type TransportLeg,
} from "./travel";

const point = (over: Partial<ArrivalPoint> = {}): ArrivalPoint => ({
  id: "p1",
  code: "BRS",
  name: "Bristol Airport",
  region: "England",
  minutes_to_venue: 55,
  sort_order: 10,
  ...over,
});

const leg = (over: Partial<TransportLeg> = {}): TransportLeg => ({
  id: "l1",
  arrival_point_id: "p1",
  kind: "taxi",
  name: "Taxi to Bath",
  detail: null,
  url: null,
  duration_minutes: 55,
  cost_low: 6500,
  cost_high: 8500,
  sort_order: 10,
  ...over,
});

describe("formatDuration", () => {
  it("formats hours and minutes the way a guest reads them", () => {
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(150)).toBe("2 hours 30");
    expect(formatDuration(180)).toBe("3 hours");
    expect(formatDuration(1)).toBe("1 minute");
  });

  it("returns null rather than a placeholder, so the line is omitted", () => {
    // 0017 refused these columns because a wedding down the road would show
    // empty ones. Null out is how that promise is kept.
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-30)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});

describe("formatCostRange", () => {
  it("prints a range from integer minor units, in NZD", () => {
    expect(formatCostRange(4500, 12000)).toBe("$45.00–$120.00");
  });

  it("collapses a range whose ends match", () => {
    expect(formatCostRange(4500, 4500)).toBe("$45.00");
  });

  it("says from or up to when only one end is known", () => {
    expect(formatCostRange(4500, null)).toBe("from $45.00");
    expect(formatCostRange(null, 12000)).toBe("up to $120.00");
  });

  it("is null when neither end is set", () => {
    expect(formatCostRange(null, null)).toBeNull();
    expect(formatCostRange(undefined, undefined)).toBeNull();
  });

  it("treats zero as a real figure, because free is a price", () => {
    // Deliberately unlike spec 19's budget ladder, where a typed 0 means
    // "unset" — here somebody writing 0 means the bus is free.
    expect(formatCostRange(0, 0)).toBe("$0.00");
  });
});

describe("groupByArrival", () => {
  it("hangs legs under their arrival point, in sort order", () => {
    const { grouped, loose } = groupByArrival(
      [point(), point({ id: "p2", code: "LHR", name: "Heathrow", sort_order: 20 })],
      [
        leg({ id: "l2", sort_order: 20 }),
        leg({ id: "l1", sort_order: 10 }),
        leg({ id: "l3", arrival_point_id: "p2" }),
      ],
    );
    expect(grouped).toHaveLength(2);
    expect(grouped[0]!.legs.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(grouped[1]!.legs.map((l) => l.id)).toEqual(["l3"]);
    expect(loose).toEqual([]);
  });

  it("keeps a leg belonging to no point — parking is not a flight", () => {
    const { grouped, loose } = groupByArrival(
      [point()],
      [leg(), leg({ id: "l9", arrival_point_id: null, kind: "parking", name: "At the venue" })],
    );
    expect(grouped[0]!.legs).toHaveLength(1);
    expect(loose.map((l) => l.name)).toEqual(["At the venue"]);
  });

  it("does not lose a leg pointing at an arrival point that has gone", () => {
    const { loose } = groupByArrival([point()], [leg({ arrival_point_id: "vanished" })]);
    expect(loose).toHaveLength(1);
  });

  it("drops an arrival point with nothing under it", () => {
    // A heading with no content is worse than no heading.
    const { grouped } = groupByArrival([point(), point({ id: "p2", sort_order: 20 })], [leg()]);
    expect(grouped).toHaveLength(1);
  });

  it("renders nothing at all for a wedding that set none of this up", () => {
    const { grouped, loose } = groupByArrival([], []);
    expect(grouped).toEqual([]);
    expect(loose).toEqual([]);
  });
});

describe("arrivalHeading", () => {
  it("splits the code from the rest", () => {
    expect(arrivalHeading(point())).toEqual({ code: "BRS", rest: "Bristol Airport · England" });
  });

  it("drops what is not set — not every arrival point is an airport", () => {
    expect(arrivalHeading(point({ code: null, region: null }))).toEqual({
      code: null,
      rest: "Bristol Airport",
    });
    expect(arrivalHeading(point({ code: "  " }))).toEqual({
      code: null,
      rest: "Bristol Airport · England",
    });
  });
});
