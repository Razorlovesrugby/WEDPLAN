import { describe, expect, it } from "vitest";
import {
  defaultStage,
  defaultStep,
  invitationState,
  matchesStatus,
  saveTheDateState,
  stageForStatus,
  stageProgress,
  STATUSES,
  type JourneyRow,
  type JourneySummary,
} from "./journey";

const blank: JourneySummary = {
  sent_at: null,
  opened_at: null,
  view_count: 0,
  response_state: "none",
  std_sent_at: null,
  std_view_count: 0,
  unable_count: 0,
};

function row(id: string, summary: Partial<JourneySummary> | null, invitationId: string | null = null): JourneyRow {
  return { household: { id }, summary: summary ? { ...blank, ...summary } : null, invitationId };
}

const T = "2026-11-01T00:00:00Z";

describe("status filters keep their meaning", () => {
  // The same truth table the page used before spec 42 moved it here.
  const rows = {
    nothing: row("a", null),
    sentOnly: row("b", { sent_at: T }, "i"),
    openedSilent: row("c", { sent_at: T, view_count: 2 }, "i"),
    answered: row("d", { sent_at: T, opened_at: T, response_state: "complete" }, "i"),
    stdSent: row("e", { std_sent_at: T }),
    unable: row("f", { unable_count: 1 }),
  };
  const expected: Record<(typeof STATUSES)[number], string[]> = {
    sent: ["b", "c", "d"],
    unsent: ["a", "e", "f"],
    opened: ["c", "d"],
    silent: ["c"],
    std_unsent: ["a", "b", "c", "d", "f"],
    unable: ["f"],
  };
  it.each(STATUSES)("%s", (status) => {
    const got = Object.values(rows)
      .filter((r) => matchesStatus(r, status))
      .map((r) => r.household.id);
    expect(got).toEqual(expected[status]);
  });

  it("opens a save-the-date filter on the save-the-date stage, the rest on Invitation", () => {
    expect(stageForStatus("std_unsent")).toBe("save-the-date");
    expect(stageForStatus("silent")).toBe("invitation");
  });
});

describe("where a household is", () => {
  it("save the date", () => {
    expect(saveTheDateState(row("a", null))).toBe("none");
    expect(saveTheDateState(row("a", { std_sent_at: T }))).toBe("sent");
    expect(saveTheDateState(row("a", { std_sent_at: T, std_view_count: 1 }))).toBe("opened");
    // Opened without the tick (a link copied by hand) still counts as opened.
    expect(saveTheDateState(row("a", { std_view_count: 3 }))).toBe("opened");
  });

  it("invitation", () => {
    expect(invitationState(row("a", null))).toBe("none");
    expect(invitationState(row("a", null, "i"))).toBe("ready");
    expect(invitationState(row("a", { sent_at: T }, "i"))).toBe("sent");
    expect(invitationState(row("a", { sent_at: T, view_count: 1 }, "i"))).toBe("opened");
    expect(invitationState(row("a", { sent_at: T, view_count: 1, response_state: "partial" }, "i"))).toBe("replied");
    expect(invitationState(row("a", { sent_at: T, response_state: "complete", unable_count: 1 }, "i"))).toBe("unable");
  });
});

describe("progress", () => {
  const rows = [row("a", { std_sent_at: T, sent_at: T, response_state: "complete" }, "i"), row("b", { std_sent_at: T }, "i"), row("c", null)];

  it("counts save the dates sent", () => {
    expect(stageProgress(rows, "save-the-date")).toEqual({ done: 2, total: 3, caption: "2 of 3 sent" });
  });

  it("counts invitations sent and replied", () => {
    expect(stageProgress(rows, "invitation")).toEqual({ done: 1, total: 3, caption: "1 of 3 sent · 1 replied" });
  });
});

describe("where /invitations opens", () => {
  it("on the save the date while any is unsent", () => {
    expect(defaultStage([row("a", { std_sent_at: T }), row("b", null)])).toBe("save-the-date");
  });

  it("on the invitation once every save the date is sent, or with no households", () => {
    expect(defaultStage([row("a", { std_sent_at: T })])).toBe("invitation");
    expect(defaultStage([])).toBe("invitation");
  });

  it("on Who while a household has no invitation", () => {
    expect(defaultStep([row("a", null, "i"), row("b", null)], "invitation")).toBe("who");
  });

  it("on Send while something is unsent, then Track", () => {
    expect(defaultStep([row("a", null, "i")], "invitation")).toBe("send");
    expect(defaultStep([row("a", { sent_at: T }, "i")], "invitation")).toBe("track");
    expect(defaultStep([row("a", null)], "save-the-date")).toBe("send");
    expect(defaultStep([row("a", { std_sent_at: T })], "save-the-date")).toBe("track");
  });
});
