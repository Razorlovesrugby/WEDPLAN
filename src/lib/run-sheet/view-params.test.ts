import { describe, expect, it } from "vitest";
import { parseRunSheetParams, runSheetHref } from "./view-params";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("parseRunSheetParams", () => {
  it("defaults to By the hour, everyone, every event", () => {
    expect(parseRunSheetParams({})).toEqual({ view: "hours", who: "", event: null });
  });

  it("reads the list view, an assignee, and an event", () => {
    expect(parseRunSheetParams({ view: "list", who: `person:${ID}`, event: ID })).toEqual({
      view: "list",
      who: `person:${ID}`,
      event: ID,
    });
  });

  it("accepts every assignee type and unassigned", () => {
    for (const who of ["collaborator", "guest", "vendor", "person"]) {
      expect(parseRunSheetParams({ who: `${who}:${ID}` }).who).toBe(`${who}:${ID}`);
    }
    expect(parseRunSheetParams({ who: "unassigned" }).who).toBe("unassigned");
  });

  it("ignores anything it doesn't recognise", () => {
    expect(parseRunSheetParams({ view: "people", who: "robot:1", event: "not-an-id" })).toEqual({
      view: "hours",
      who: "",
      event: null,
    });
  });
});

describe("runSheetHref", () => {
  it("leaves out defaults", () => {
    expect(runSheetHref("/run-sheet", {})).toBe("/run-sheet");
    expect(runSheetHref("/run-sheet", { view: "hours", who: "", event: null })).toBe("/run-sheet");
  });

  it("keeps what is set", () => {
    expect(runSheetHref("/run-sheet", { view: "list", event: ID })).toBe(`/run-sheet?view=list&event=${ID}`);
    expect(runSheetHref("/run-sheet/people", { who: `person:${ID}` })).toBe(`/run-sheet/people?who=person%3A${ID}`);
  });

  it("round-trips through parse", () => {
    const params = { view: "list", who: `vendor:${ID}`, event: ID } as const;
    const url = new URL(runSheetHref("/run-sheet", params), "http://x");
    expect(parseRunSheetParams(Object.fromEntries(url.searchParams))).toEqual(params);
  });
});
