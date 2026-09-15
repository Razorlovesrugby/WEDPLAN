import { describe, expect, it } from "vitest";
import { buildDigest, hasAnythingToReport, isoWeek, type DigestItem } from "./digest";

function item(overrides: Partial<DigestItem> & Pick<DigestItem, "id" | "due_date">): DigestItem {
  return {
    title: `Item ${overrides.id}`,
    list_title: "Decor",
    list_color: "#7c5c3e",
    snoozed_until: null,
    done: false,
    ...overrides,
  };
}

describe("buildDigest", () => {
  const today = "2027-06-09"; // a Wednesday

  it("buckets an item before today as overdue", () => {
    const digest = buildDigest([item({ id: "1", due_date: "2027-06-01" })], today);
    expect(digest.overdueCount).toBe(1);
    expect(digest.dueSoonCount).toBe(0);
    expect(digest.groups[0]!.overdue.map((i) => i.id)).toEqual(["1"]);
  });

  it("buckets today itself and up to 6 days out as due soon (a 7-day window)", () => {
    const digest = buildDigest(
      [
        item({ id: "today", due_date: "2027-06-09" }),
        item({ id: "edge", due_date: "2027-06-15" }), // today + 6
      ],
      today,
    );
    expect(digest.dueSoonCount).toBe(2);
    expect(digest.overdueCount).toBe(0);
  });

  it("excludes anything past the 7-day window entirely — not a third bucket", () => {
    const digest = buildDigest([item({ id: "far", due_date: "2027-06-16" })], today); // today + 7
    expect(digest.overdueCount).toBe(0);
    expect(digest.dueSoonCount).toBe(0);
    expect(digest.groups).toEqual([]);
  });

  it("excludes done items", () => {
    const digest = buildDigest([item({ id: "1", due_date: "2027-06-01", done: true })], today);
    expect(hasAnythingToReport(digest)).toBe(false);
  });

  it("excludes an item snoozed into the future, even if it's overdue", () => {
    const digest = buildDigest(
      [item({ id: "1", due_date: "2027-06-01", snoozed_until: "2027-06-20" })],
      today,
    );
    expect(hasAnythingToReport(digest)).toBe(false);
  });

  it("includes an item whose snooze has already lifted", () => {
    const digest = buildDigest(
      [item({ id: "1", due_date: "2027-06-01", snoozed_until: "2027-06-05" })],
      today,
    );
    expect(digest.overdueCount).toBe(1);
  });

  it("groups by originating list, sorted by list title", () => {
    const digest = buildDigest(
      [
        item({ id: "1", due_date: "2027-06-01", list_title: "Stationery", list_color: "#123456" }),
        item({ id: "2", due_date: "2027-06-01", list_title: "Decor" }),
      ],
      today,
    );
    expect(digest.groups.map((g) => g.listTitle)).toEqual(["Decor", "Stationery"]);
  });

  it("sorts items within a bucket by due date", () => {
    const digest = buildDigest(
      [
        item({ id: "later", due_date: "2027-06-08" }),
        item({ id: "earlier", due_date: "2027-06-02" }),
      ],
      today,
    );
    expect(digest.groups[0]!.overdue.map((i) => i.id)).toEqual(["earlier", "later"]);
  });

  it("reports nothing when there is nothing due or overdue", () => {
    const digest = buildDigest([], today);
    expect(hasAnythingToReport(digest)).toBe(false);
    expect(digest.groups).toEqual([]);
  });

  it("hasAnythingToReport is true once at least one item is bucketed", () => {
    const digest = buildDigest([item({ id: "1", due_date: today })], today);
    expect(hasAnythingToReport(digest)).toBe(true);
  });
});

describe("isoWeek", () => {
  it("matches the well-known ISO week edge cases", () => {
    expect(isoWeek("2024-01-01")).toBe("2024-W01"); // Monday, start of its own ISO year
    expect(isoWeek("2023-01-01")).toBe("2022-W52"); // Sunday, belongs to the previous ISO year
    expect(isoWeek("2027-06-09")).toBe(isoWeek("2027-06-07")); // same ISO week (Mon-Sun), different weekdays
  });

  it("advances by one for the following Tuesday, matching the cron's weekly cadence", () => {
    const week1 = isoWeek("2027-06-01"); // a Tuesday
    const week2 = isoWeek("2027-06-08"); // the following Tuesday
    expect(week1).not.toBe(week2);
  });
});
