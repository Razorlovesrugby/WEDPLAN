import { describe, expect, it } from "vitest";
import { addDays, nextUp, NEXT_UP_LIMIT, type TodayInput } from "./today";

const quiet: TodayInput = {
  today: "2026-11-08",
  overdueTasks: 0,
  dueThisWeekTasks: 0,
  payments: [],
  inbox: { needsYou: 0 },
  saveTheDateNoInvitation: 0,
  silentHouseholds: 0,
  overCapacity: 0,
  rsvpLockDays: null,
};

describe("next up", () => {
  it("is empty when nothing needs you", () => {
    expect(nextUp(quiet)).toEqual([]);
  });

  it("each rule fires on its own", () => {
    expect(nextUp({ ...quiet, overdueTasks: 3 })[0]).toMatchObject({ text: "3 tasks overdue", href: "/lists" });
    expect(nextUp({ ...quiet, inbox: { needsYou: 1 } })[0]?.text).toBe("1 thing from guests in your Inbox");
    expect(nextUp({ ...quiet, saveTheDateNoInvitation: 12 })[0]?.text).toBe(
      "12 households have a save the date but no invitation",
    );
    expect(nextUp({ ...quiet, silentHouseholds: 1 })[0]?.href).toBe("/invitations?status=silent");
    expect(nextUp({ ...quiet, overCapacity: 2 })[0]?.text).toBe("2 seats over capacity above the cut");
    expect(nextUp({ ...quiet, rsvpLockDays: 5 })[0]?.text).toBe("RSVPs close in 5 days");
    expect(nextUp({ ...quiet, rsvpLockDays: 0 })[0]?.text).toBe("RSVPs close today");
    expect(nextUp({ ...quiet, dueThisWeekTasks: 2 })[0]?.text).toBe("2 tasks due this week");
  });

  it("ignores an RSVP lock that's far off or past", () => {
    expect(nextUp({ ...quiet, rsvpLockDays: 30 })).toEqual([]);
    expect(nextUp({ ...quiet, rsvpLockDays: -1 })).toEqual([]);
  });

  it("splits payments into past due and due this week, in the wedding's own today", () => {
    const lines = nextUp({
      ...quiet,
      payments: [
        { due_date: "2026-11-01", paid_at: null, item_label: "Venue" },
        { due_date: "2026-11-13", paid_at: null, item_label: "Caterer" },
        { due_date: "2026-11-16", paid_at: null, item_label: "Florist" },
        { due_date: "2026-11-10", paid_at: "2026-11-02", item_label: "Band" },
        { due_date: null, paid_at: null, item_label: "Cake" },
      ],
    });
    expect(lines.map((line) => line.text)).toEqual(["1 payment past due", "Payment for Caterer due this week"]);
  });

  it("keeps the priority order and stops at six", () => {
    const lines = nextUp({
      ...quiet,
      overdueTasks: 1,
      payments: [{ due_date: "2026-11-01", paid_at: null, item_label: "Venue" }, { due_date: "2026-11-09", paid_at: null, item_label: "DJ" }],
      inbox: { needsYou: 2 },
      saveTheDateNoInvitation: 3,
      silentHouseholds: 4,
      overCapacity: 1,
      rsvpLockDays: 3,
      dueThisWeekTasks: 9,
    });
    expect(lines).toHaveLength(NEXT_UP_LIMIT);
    expect(lines.map((line) => line.href)).toEqual([
      "/lists",
      "/budget",
      "/budget",
      "/inbox",
      "/invitations?stage=invitation",
      "/invitations?status=silent",
    ]);
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
