import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  computeNextDueDate,
  generateTimelineItems,
  parseQuickAdd,
  shouldSpawnNext,
  spawnNextOccurrence,
  templateItemKey,
  todayIso,
  type RepeatRule,
  type TemplateSection,
} from "./generate";

describe("addDays / addMonths", () => {
  it("adds and subtracts days across month and year boundaries", () => {
    expect(addDays("2027-06-12", -391)).toBe("2026-05-17");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
  });

  it("clamps day-of-month overflow rather than rolling into the next month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28"); // not a leap year
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
  });
});

describe("generateTimelineItems", () => {
  const sections: TemplateSection[] = [
    {
      section: "13 months before",
      items: [
        { title: "Announce your engagement", offset_days: -391, note: "" },
        { title: "Research wedding costs", offset_days: -388, note: "Use the budget tool" },
      ],
    },
    {
      section: "1 day before",
      items: [{ title: "Relax and set your alarm", offset_days: -1 }],
    },
  ];

  it("computes a real due_date from the wedding date and each item's offset (normal engagement)", () => {
    // Wedding date far enough out that every offset lands in the future.
    const result = generateTimelineItems("timeline", "2027-06-12", sections, "2026-01-01");
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      title: "Announce your engagement",
      due_date: "2026-05-17",
      offset_days: -391,
      overdue_on_import: false,
      section: "13 months before",
    });
    expect(result[1]!.notes).toBe("Use the budget tool");
    expect(result[2]!.notes).toBeNull(); // blank/absent note becomes null, not ""
  });

  it("returns an empty array for a null wedding date, rather than throwing", () => {
    expect(generateTimelineItems("timeline", null, sections)).toEqual([]);
  });

  it("does not clamp a short-engagement date into the future — it flags it instead", () => {
    // Wedding is 10 days out: every offset before -10 lands in the past.
    const today = "2027-06-02";
    const result = generateTimelineItems("timeline", "2027-06-12", sections, today);
    const announce = result.find((r) => r.title === "Announce your engagement")!;
    expect(announce.due_date).toBe("2026-05-17"); // real computed date, not moved to today
    expect(announce.overdue_on_import).toBe(true);
    const relax = result.find((r) => r.title === "Relax and set your alarm")!;
    expect(relax.due_date).toBe("2027-06-11");
    expect(relax.overdue_on_import).toBe(false); // 11 June is still after 2 June
  });

  it("marks only items whose computed date is before today as overdue on import", () => {
    const today = "2027-06-10";
    const result = generateTimelineItems("timeline", "2027-06-12", sections, today);
    const relax = result.find((r) => r.title === "Relax and set your alarm")!;
    expect(relax.due_date).toBe("2027-06-11");
    expect(relax.overdue_on_import).toBe(false); // 11 June is after 10 June
  });

  it("regenerating with the same inputs produces identical output (no-op re-run)", () => {
    const a = generateTimelineItems("timeline", "2027-06-12", sections, "2026-01-01");
    const b = generateTimelineItems("timeline", "2027-06-12", sections, "2026-01-01");
    expect(b).toEqual(a);
  });

  it("regenerating after the wedding date changes keeps the same template_keys but new due_dates", () => {
    const before = generateTimelineItems("timeline", "2027-06-12", sections, "2026-01-01");
    const after = generateTimelineItems("timeline", "2027-09-04", sections, "2026-01-01");
    expect(after.map((r) => r.template_key)).toEqual(before.map((r) => r.template_key));
    expect(after[0]!.due_date).not.toBe(before[0]!.due_date);
  });

  it("template_key is stable and namespaced under the template key", () => {
    expect(templateItemKey("timeline", "Announce your engagement", -391)).toBe(
      "timeline:announce-your-engagement:-391",
    );
  });
});

describe("todayIso", () => {
  it("formats as a plain calendar date, ignoring the time of day", () => {
    expect(todayIso(new Date("2027-06-12T23:59:59Z"))).toBe("2027-06-12");
  });
});

describe("recurrence", () => {
  it("computes the next daily occurrence", () => {
    const rule: RepeatRule = { freq: "daily", interval: 3, end: { type: "never" }, occurrence_index: 1 };
    expect(computeNextDueDate("2027-01-01", rule)).toBe("2027-01-04");
  });

  it("computes the next weekly occurrence on a specific weekday ('every Monday')", () => {
    const rule: RepeatRule = {
      freq: "weekly",
      interval: 1,
      weekdays: [1], // Monday
      end: { type: "never" },
      occurrence_index: 1,
    };
    // 2027-01-01 is a Friday.
    expect(computeNextDueDate("2027-01-01", rule)).toBe("2027-01-04");
  });

  it("computes the next weekly occurrence with no weekday set (every N weeks, same weekday)", () => {
    const rule: RepeatRule = { freq: "weekly", interval: 2, end: { type: "never" }, occurrence_index: 1 };
    expect(computeNextDueDate("2027-01-01", rule)).toBe("2027-01-15");
  });

  it("computes the next monthly occurrence on a fixed day-of-month ('the 1st of the month')", () => {
    const rule: RepeatRule = {
      freq: "monthly",
      interval: 1,
      day_of_month: 1,
      end: { type: "never" },
      occurrence_index: 1,
    };
    expect(computeNextDueDate("2027-01-15", rule)).toBe("2027-02-01");
  });

  it("clamps a monthly day-of-month against a shorter month", () => {
    const rule: RepeatRule = {
      freq: "monthly",
      interval: 1,
      day_of_month: 31,
      end: { type: "never" },
      occurrence_index: 1,
    };
    expect(computeNextDueDate("2027-01-31", rule)).toBe("2027-02-28");
  });

  it("respects an 'after N occurrences' end condition", () => {
    const rule: RepeatRule = { freq: "daily", interval: 1, end: { type: "after", count: 3 }, occurrence_index: 3 };
    expect(shouldSpawnNext(rule, "2027-01-04")).toBe(false);
    expect(shouldSpawnNext({ ...rule, occurrence_index: 2 }, "2027-01-03")).toBe(true);
  });

  it("respects an 'until a date' end condition", () => {
    const rule: RepeatRule = {
      freq: "daily",
      interval: 1,
      end: { type: "until", date: "2027-01-05" },
      occurrence_index: 1,
    };
    expect(shouldSpawnNext(rule, "2027-01-05")).toBe(true);
    expect(shouldSpawnNext(rule, "2027-01-06")).toBe(false);
  });

  it("a 'never' end condition always spawns the next occurrence", () => {
    const rule: RepeatRule = { freq: "weekly", interval: 1, end: { type: "never" }, occurrence_index: 40 };
    expect(shouldSpawnNext(rule, "2027-12-31")).toBe(true);
  });

  it("completing a recurring item spawns a new row and increments occurrence_index (history is kept)", () => {
    const rule: RepeatRule = { freq: "daily", interval: 1, end: { type: "after", count: 2 }, occurrence_index: 1 };
    const spawned = spawnNextOccurrence({ due_date: "2027-01-01", repeat_rule: rule });
    expect(spawned).toEqual({
      due_date: "2027-01-02",
      repeat_rule: { ...rule, occurrence_index: 2 },
    });
  });

  it("returns null instead of spawning once the end condition is reached", () => {
    const rule: RepeatRule = { freq: "daily", interval: 1, end: { type: "after", count: 1 }, occurrence_index: 1 };
    expect(spawnNextOccurrence({ due_date: "2027-01-01", repeat_rule: rule })).toBeNull();
  });
});

describe("parseQuickAdd", () => {
  const today = new Date("2027-06-09T12:00:00Z"); // a Wednesday

  it("parses 'tomorrow'", () => {
    expect(parseQuickAdd("Book the florist tomorrow", today)).toEqual({
      title: "Book the florist",
      due_date: "2027-06-10",
    });
  });

  it("parses 'today'", () => {
    expect(parseQuickAdd("Call the venue today", today)).toEqual({
      title: "Call the venue",
      due_date: "2027-06-09",
    });
  });

  it("parses 'next Friday' as the upcoming Friday, not this week's if already past", () => {
    expect(parseQuickAdd("Cake tasting next friday", today)).toEqual({
      title: "Cake tasting",
      due_date: "2027-06-11",
    });
  });

  it("parses a bare weekday the same way as 'next <weekday>'", () => {
    expect(parseQuickAdd("Dress fitting friday", today)).toEqual({
      title: "Dress fitting",
      due_date: "2027-06-11",
    });
  });

  it("parses 'in 2 weeks'", () => {
    expect(parseQuickAdd("Order invitations in 2 weeks", today)).toEqual({
      title: "Order invitations",
      due_date: "2027-06-23",
    });
  });

  it("parses 'in 3 days'", () => {
    expect(parseQuickAdd("Confirm headcount in 3 days", today)).toEqual({
      title: "Confirm headcount",
      due_date: "2027-06-12",
    });
  });

  it("parses 'next month'", () => {
    expect(parseQuickAdd("Dress rehearsal next month", today)).toEqual({
      title: "Dress rehearsal",
      due_date: "2027-07-09",
    });
  });

  it("falls back to no date for anything it doesn't recognise", () => {
    expect(parseQuickAdd("Pick a cake flavour", today)).toEqual({
      title: "Pick a cake flavour",
      due_date: null,
    });
  });

  it("leaves the title intact and trimmed when nothing matches", () => {
    expect(parseQuickAdd("  Choose the band  ", today)).toEqual({
      title: "Choose the band",
      due_date: null,
    });
  });
});
