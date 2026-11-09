import { describe, expect, it } from "vitest";
import {
  GUEST_VIEWS,
  columnsFor,
  eventReplyCounts,
  groupByHousehold,
  householdEventSummary,
  parseGrouped,
  parseGuestView,
  summariseHouseholds,
} from "./guest-table";

describe("parseGuestView", () => {
  it("reads a known view", () => {
    expect(parseGuestView("catering")).toBe("catering");
    expect(parseGuestView(["planning", "rsvp"])).toBe("planning");
  });
  it("falls back to RSVP for anything else", () => {
    expect(parseGuestView(undefined)).toBe("rsvp");
    expect(parseGuestView(null)).toBe("rsvp");
    expect(parseGuestView("")).toBe("rsvp");
    expect(parseGuestView("seating")).toBe("rsvp");
  });
});

describe("views", () => {
  it("every view ends with the household's links", () => {
    for (const view of GUEST_VIEWS) expect(view.columns.at(-1)).toBe("links");
  });
  it("the events only show where replies are the point", () => {
    const withEvents = GUEST_VIEWS.filter((view) => view.columns.includes("events")).map((v) => v.id);
    expect(withEvents).toEqual(["rsvp", "all"]);
  });
  it("Everything keeps every column the old table had", () => {
    expect(columnsFor("all")).toEqual(
      expect.arrayContaining(["tier", "side", "email", "dietary", "tags", "std", "events"]),
    );
  });
});

describe("parseGrouped", () => {
  it("groups unless asked for one row per person", () => {
    expect(parseGrouped(undefined)).toBe(true);
    expect(parseGrouped("households")).toBe(true);
    expect(parseGrouped("people")).toBe(false);
  });
});

describe("groupByHousehold", () => {
  const guest = (id: string, household_id: string, unable = false) => ({
    id,
    household_id,
    unable_to_attend_at: unable ? "2026-10-01T00:00:00Z" : null,
  });

  it("keeps the list's order, a household where its first member was", () => {
    const groups = groupByHousehold([guest("1", "b"), guest("2", "a"), guest("3", "b")]);
    expect(groups.map((g) => g.householdId)).toEqual(["b", "a"]);
    expect(groups[0]!.guests.map((g) => g.id)).toEqual(["1", "3"]);
  });

  it("puts households where nobody can come at the bottom", () => {
    const groups = groupByHousehold([
      guest("1", "gone", true),
      guest("2", "half", true),
      guest("3", "half"),
      guest("4", "here"),
    ]);
    expect(groups.map((g) => g.householdId)).toEqual(["half", "here", "gone"]);
  });

  it("is empty for nobody", () => {
    expect(groupByHousehold([])).toEqual([]);
  });
});

describe("householdEventSummary", () => {
  it("shows the shared state when everyone invited agrees", () => {
    expect(householdEventSummary(["yes", "yes"])).toEqual({ kind: "same", state: "yes" });
    expect(householdEventSummary(["sent", "sent", "sent"])).toEqual({ kind: "same", state: "sent" });
  });

  it("ignores people not invited to the event", () => {
    expect(householdEventSummary(["yes", "yes", "not_invited"])).toEqual({ kind: "same", state: "yes" });
  });

  it("is not invited when nobody is", () => {
    expect(householdEventSummary(["not_invited", "not_invited"])).toEqual({
      kind: "same",
      state: "not_invited",
    });
    expect(householdEventSummary([])).toEqual({ kind: "same", state: "not_invited" });
  });

  it("counts a split household and spells it out", () => {
    expect(householdEventSummary(["yes", "yes", "no", "not_invited"])).toEqual({
      kind: "split",
      yes: 2,
      invited: 3,
      detail: "2 coming, 1 not coming",
    });
    expect(householdEventSummary(["sent", "maybe"])).toEqual({
      kind: "split",
      yes: 0,
      invited: 2,
      detail: "1 maybe, 1 no answer yet",
    });
  });
});

describe("eventReplyCounts", () => {
  const invites = [
    { guest_id: "yes", event_id: "e", invited: true },
    { guest_id: "no", event_id: "e", invited: true },
    { guest_id: "maybe", event_id: "e", invited: true },
    { guest_id: "waiting", event_id: "e", invited: true },
    { guest_id: "unable", event_id: "e", invited: true },
    { guest_id: "unableYesElsewhere", event_id: "e", invited: true },
    { guest_id: "unableSaidNo", event_id: "e", invited: true },
    { guest_id: "removed", event_id: "e", invited: false },
    { guest_id: "yes", event_id: "other", invited: true },
  ];
  const g = (id: string, rsvps: { event_id: string; status: string }[], unable = false) => ({
    id,
    unable_to_attend_at: unable ? "2026-10-01T00:00:00Z" : null,
    rsvps,
  });
  const guests = [
    g("yes", [{ event_id: "e", status: "yes" }]),
    g("no", [{ event_id: "e", status: "no" }]),
    g("maybe", [{ event_id: "e", status: "maybe" }]),
    g("waiting", [{ event_id: "e", status: "pending" }]),
    g("unable", [], true),
    g("unableYesElsewhere", [{ event_id: "other", status: "yes" }], true),
    g("unableSaidNo", [{ event_id: "e", status: "no" }], true),
    // Removed from the event after answering: the answer stops counting.
    g("removed", [{ event_id: "e", status: "yes" }]),
    g("stranger", []),
  ];

  it("counts only people invited, by the filters' rules", () => {
    expect(eventReplyCounts("e", invites, guests)).toEqual({
      invited: 7,
      yes: 1,
      maybe: 1,
      no: 2,
      pending: 2,
      cantCome: 1,
    });
  });

  it("is all zeros for an event nobody is invited to", () => {
    expect(eventReplyCounts("nobody", invites, guests)).toEqual({
      invited: 0,
      yes: 0,
      maybe: 0,
      no: 0,
      pending: 0,
      cantCome: 0,
    });
  });
});

describe("summariseHouseholds", () => {
  const sent = "2026-10-01T00:00:00Z";
  it("summarises the whole household, whoever is shown", () => {
    const guests = [
      { id: "a", household_id: "h", rsvps: [{ event_id: "e", status: "yes" as const }] },
      { id: "b", household_id: "h", rsvps: [{ event_id: "e", status: "pending" as const }] },
      { id: "c", household_id: "solo", rsvps: [] },
    ];
    const invites = [
      { guest_id: "a", event_id: "e", invited: true, sent_at: sent },
      { guest_id: "b", event_id: "e", invited: true, sent_at: sent },
      { guest_id: "c", event_id: "e", invited: false, sent_at: null },
    ];
    expect(summariseHouseholds(guests, ["e"], invites)).toEqual({
      h: { size: 2, events: { e: { kind: "split", yes: 1, invited: 2, detail: "1 coming, 1 no answer yet" } } },
      solo: { size: 1, events: { e: { kind: "same", state: "not_invited" } } },
    });
  });
});
