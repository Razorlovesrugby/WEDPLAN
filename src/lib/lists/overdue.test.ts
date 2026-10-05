import { describe, expect, it } from "vitest";
import { daysOverdue, isOverdue, overdueLabel } from "./overdue";

const base = { due_date: "2026-10-01", status: "todo", snoozed_until: null };

describe("isOverdue", () => {
  it("is overdue when due before today", () => expect(isOverdue(base, "2026-10-05")).toBe(true));
  it("is not overdue when due today or later", () => {
    expect(isOverdue({ ...base, due_date: "2026-10-05" }, "2026-10-05")).toBe(false);
    expect(isOverdue({ ...base, due_date: "2026-10-06" }, "2026-10-05")).toBe(false);
  });
  it("ignores done items and undated items", () => {
    expect(isOverdue({ ...base, status: "done" }, "2026-10-05")).toBe(false);
    expect(isOverdue({ ...base, due_date: null }, "2026-10-05")).toBe(false);
  });
  it("hides an item snoozed past today, shows it once the snooze has expired", () => {
    expect(isOverdue({ ...base, snoozed_until: "2026-10-07" }, "2026-10-05")).toBe(false);
    expect(isOverdue({ ...base, snoozed_until: "2026-10-05" }, "2026-10-05")).toBe(true);
  });
});

describe("daysOverdue / overdueLabel", () => {
  it("counts whole days, never negative", () => {
    expect(daysOverdue("2026-10-02", "2026-10-05")).toBe(3);
    expect(daysOverdue("2026-10-09", "2026-10-05")).toBe(0);
  });
  it("pluralises", () => {
    expect(overdueLabel(1)).toBe("1 day overdue");
    expect(overdueLabel(3)).toBe("3 days overdue");
  });
});
