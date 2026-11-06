import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, formatMoneyShort, sideLabel, timeLeft, timeLeftLabel } from "./format";

describe("sideLabel", () => {
  const owner = { role: "owner" as const, display_name: "Ray" };
  const partner = { role: "partner" as const, display_name: "Olivia" };

  it("labels partner_a with the owner collaborator's name", () => {
    expect(sideLabel("partner_a", [owner, partner])).toBe("Ray");
  });

  it("labels partner_b with the non-owner collaborator's name", () => {
    expect(sideLabel("partner_b", [owner, partner])).toBe("Olivia");
  });

  it("falls back to Partner A / Partner B when a name isn't set", () => {
    const unnamedOwner = { role: "owner" as const, display_name: null };
    const unnamedPartner = { role: "partner" as const, display_name: null };
    expect(sideLabel("partner_a", [unnamedOwner, unnamedPartner])).toBe("Partner A");
    expect(sideLabel("partner_b", [unnamedOwner, unnamedPartner])).toBe("Partner B");
  });

  it("falls back to Partner A / Partner B when the matching collaborator doesn't exist yet", () => {
    expect(sideLabel("partner_a", [])).toBe("Partner A");
    expect(sideLabel("partner_b", [])).toBe("Partner B");
  });

  it("labels both and other generically, and blank as an em dash", () => {
    expect(sideLabel("both", [owner, partner])).toBe("Both");
    expect(sideLabel("other", [owner, partner])).toBe("Other");
    expect(sideLabel(null, [owner, partner])).toBe("—");
    expect(sideLabel(undefined, [owner, partner])).toBe("—");
  });
});

describe("timeLeft", () => {
  const now = Date.parse("2027-06-12T09:00:00Z");

  it("counts days while there is more than one left", () => {
    expect(timeLeft("2027-06-15T09:00:00Z", now)).toEqual({ value: 3, unit: "days" });
  });

  it("drops to hours inside the last day", () => {
    expect(timeLeft("2027-06-12T14:00:00Z", now)).toEqual({ value: 5, unit: "hours" });
  });

  it("says the day has arrived inside the last hour", () => {
    // The case `daysUntil` answers with "0 days to go", which is the one day
    // the counter most needs to say something else.
    expect(timeLeft("2027-06-12T09:30:00Z", now)).toEqual({ value: 0, unit: "now" });
  });

  it("is null once it has passed, and for rubbish", () => {
    expect(timeLeft("2027-06-11T09:00:00Z", now)).toBeNull();
    expect(timeLeft("not a date", now)).toBeNull();
    expect(timeLeft(null, now)).toBeNull();
  });

  it("prints singulars without an s", () => {
    expect(timeLeftLabel({ value: 1, unit: "days" })).toBe("1 day to go");
    expect(timeLeftLabel({ value: 1, unit: "hours" })).toBe("1 hour to go");
    expect(timeLeftLabel({ value: 12, unit: "days" })).toBe("12 days to go");
    expect(timeLeftLabel({ value: 0, unit: "now" })).toBe("Today");
    expect(timeLeftLabel(null)).toBeNull();
  });
});

describe("formatMoneyShort", () => {
  it("drops the cents when there are none", () => {
    expect(formatMoneyShort(120_000, "NZD")).toBe("$1,200");
    expect(formatMoneyShort(0, "NZD")).toBe("$0");
  });

  it("keeps them when the figure actually has them", () => {
    expect(formatMoneyShort(120_050, "NZD")).toBe("$1,200.50");
  });

  it("has an answer for nothing at all", () => {
    expect(formatMoneyShort(null, "NZD")).toBe("—");
    expect(formatMoneyShort(undefined, "NZD")).toBe("—");
  });
});

describe("formatMoney with a currency (spec 40)", () => {
  it("prints the wedding's symbol and never converts", () => {
    expect(formatMoney(460_000, "NZD")).toBe("$4,600.00");
    expect(formatMoney(460_000, "AUD")).toBe("A$4,600.00");
    expect(formatMoney(460_000, "GBP")).toBe("£4,600.00");
  });

  it("always shows hundredths, whatever the currency's own convention", () => {
    // en-NZ prints yen as "JP¥", unambiguous beside NZ's own "$".
    expect(formatMoney(460_000, "JPY")).toBe("JP¥4,600.00");
    expect(formatMoneyShort(460_050, "JPY")).toBe("JP¥4,600.50");
  });

  it("never throws mid-render on a bad code", () => {
    // A well-formed unknown code prints as the code; a malformed one falls back to NZD.
    expect(formatMoney(100, "ZZZ")).toContain("1.00");
    expect(formatMoney(100, "not-a-code")).toBe("$1.00");
  });

  it("gives a symbol for a field label", () => {
    expect(currencySymbol("NZD")).toBe("$");
    expect(currencySymbol("AUD")).toBe("A$");
  });
});
