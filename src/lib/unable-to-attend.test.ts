import { describe, expect, it } from "vitest";
import {
  declinedConfirmation,
  isExcludedFromCounts,
  hasUnable,
  householdGuestIds,
  isAllUnable,
  isPartlyUnable,
  joinNames,
  leftOutNote,
  saveTheDateUnsent,
  sendAnywayMessage,
  unableChip,
} from "./unable-to-attend";

describe("joinNames", () => {
  it("reads like a sentence, with no Oxford comma", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Ana"])).toBe("Ana");
    expect(joinNames(["Ana", "Ben"])).toBe("Ana and Ben");
    expect(joinNames(["Ana", "Ben", "Cy"])).toBe("Ana, Ben and Cy");
  });
});

describe("isAllUnable / isPartlyUnable", () => {
  it("is all only when every guest is flagged", () => {
    expect(isAllUnable(2, 2)).toBe(true);
    expect(isAllUnable(2, 1)).toBe(false);
    expect(isAllUnable(1, 1)).toBe(true);
  });

  it("never treats an empty household as all-unable", () => {
    // Vacuous truth would drop a household with no guests yet from every bulk
    // action, and nothing would say why.
    expect(isAllUnable(0, 0)).toBe(false);
    expect(isAllUnable(null, null)).toBe(false);
    expect(isAllUnable(0, 3)).toBe(false);
  });

  it("is partly when some but not all are flagged — still invited", () => {
    expect(isPartlyUnable(3, 1)).toBe(true);
    expect(isPartlyUnable(3, 3)).toBe(false);
    expect(isPartlyUnable(3, 0)).toBe(false);
    expect(isPartlyUnable(null, null)).toBe(false);
  });
});

describe("unableChip", () => {
  it("names who can't come", () => {
    expect(unableChip(3, ["Ana", "Ben"])).toEqual({ label: "Can't attend: Ana and Ben", all: false });
  });

  it("says so once, when it is everyone", () => {
    expect(unableChip(2, ["Ana", "Ben"])).toEqual({ label: "All can't attend", all: true });
    expect(unableChip(1, ["Ana"])).toEqual({ label: "All can't attend", all: true });
  });

  it("renders nothing for a household where nobody has", () => {
    expect(unableChip(3, [])).toBeNull();
  });
});

describe("sendAnywayMessage", () => {
  it("is pronoun-neutral and names them", () => {
    expect(sendAnywayMessage(["Ana"])).toBe("Ana told us they can't come. Send the invitation anyway?");
    expect(sendAnywayMessage(["Ana", "Ben"], "create the invitation")).toBe(
      "Ana and Ben told us they can't come. Create the invitation anyway?",
    );
    expect(sendAnywayMessage(["Ana"])).not.toMatch(/\b(she|he|her|his)\b/i);
  });
});

describe("householdGuestIds — a browser's ids are not trusted", () => {
  const household = ["g1", "g2", "g3"];

  it("keeps the household's own", () => {
    expect(householdGuestIds(["g1", "g3"], household)).toEqual({ ids: ["g1", "g3"], ignored: 0 });
  });

  it("drops an id from another household or wedding without a trace", () => {
    expect(householdGuestIds(["g1", "someone-elses"], household)).toEqual({
      ids: ["g1"],
      ignored: 1,
    });
  });

  it("returns nothing when every id is foreign", () => {
    expect(householdGuestIds(["x", "y"], household)).toEqual({ ids: [], ignored: 2 });
  });

  it("collapses duplicates", () => {
    expect(householdGuestIds(["g1", "g1", "g1"], household)).toEqual({ ids: ["g1"], ignored: 0 });
  });

  it("handles an empty request", () => {
    expect(householdGuestIds([], household)).toEqual({ ids: [], ignored: 0 });
  });
});

describe("declinedConfirmation", () => {
  it("never mentions an RSVP, a reply or attendance to confirm", () => {
    const text = declinedConfirmation(["Ana", "Ben"]);
    expect(text).toContain("Ana and Ben won’t be sent a formal invitation");
    expect(text).not.toMatch(/rsvp|reply|confirm|required/i);
  });

  it("speaks to a household of one directly rather than naming them to themselves", () => {
    const text = declinedConfirmation(["Ana"], true, true);
    expect(text).toBe(
      "Thank you for letting us know — we’ll miss you. You won’t be sent a formal invitation.",
    );
    expect(text).not.toContain("Ana");
  });

  it("promises nothing about the invitation when only some of the household have said so", () => {
    const text = declinedConfirmation(["Ana"], false);
    expect(text).toBe("Thank you for letting us know — we’ll miss Ana. We’ve noted that.");
    expect(text).not.toMatch(/invitation/i);
  });

  it("still thanks them if the names are missing", () => {
    expect(declinedConfirmation([])).toBe("Thank you for letting us know — we’ll miss you.");
  });
});

describe("filters", () => {
  it("std_unsent is anything not ticked, including a household with no summary", () => {
    expect(saveTheDateUnsent({ std_sent_at: null })).toBe(true);
    expect(saveTheDateUnsent(null)).toBe(true);
    expect(saveTheDateUnsent({ std_sent_at: "2026-10-09T00:00:00Z" })).toBe(false);
  });

  it("unable is any flagged guest", () => {
    expect(hasUnable({ unable_count: 1 })).toBe(true);
    expect(hasUnable({ unable_count: 0 })).toBe(false);
    expect(hasUnable(null)).toBe(false);
  });
});

describe("isExcludedFromCounts — the TypeScript copy of guest_excluded_from_counts()", () => {
  const flagged = "2026-10-09T00:00:00Z";

  it("excludes a flagged guest who has answered nothing", () => {
    expect(isExcludedFromCounts({ unable_to_attend_at: flagged, rsvps: [] })).toBe(true);
    expect(
      isExcludedFromCounts({ unable_to_attend_at: flagged, rsvps: [{ status: "pending" }] }),
    ).toBe(true);
  });

  it("counts them again once they answer Yes to anything — the answer outranks the flag", () => {
    expect(
      isExcludedFromCounts({
        unable_to_attend_at: flagged,
        rsvps: [{ status: "no" }, { status: "yes" }],
      }),
    ).toBe(false);
  });

  it("stays excluded after a No or a Maybe", () => {
    expect(isExcludedFromCounts({ unable_to_attend_at: flagged, rsvps: [{ status: "no" }] })).toBe(true);
    expect(isExcludedFromCounts({ unable_to_attend_at: flagged, rsvps: [{ status: "maybe" }] })).toBe(true);
  });

  it("never excludes a guest who is not flagged", () => {
    expect(isExcludedFromCounts({ unable_to_attend_at: null, rsvps: [] })).toBe(false);
    expect(isExcludedFromCounts({ unable_to_attend_at: null, rsvps: [{ status: "no" }] })).toBe(false);
  });
});

describe("leftOutNote", () => {
  it("says nothing when nobody is left out", () => {
    expect(leftOutNote(0)).toBeNull();
  });

  it("agrees with the number", () => {
    expect(leftOutNote(1)).toBe("Leaves out 1 guest who can't come.");
    expect(leftOutNote(3)).toBe("Leaves out 3 guests who can't come.");
  });
});
