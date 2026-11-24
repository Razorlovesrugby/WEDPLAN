import { describe, expect, it } from "vitest";
import { clampTapTime, nextState, tapIsNewer } from "./state";

const part = (state: "todo" | "started" | "done" | "handed_back", startedAt: string | null = null) => ({ state, startedAt });

describe("nextState", () => {
  it("starts from To do only", () => {
    expect(nextState(part("todo"), "start")).toBe("started");
    expect(nextState(part("started"), "start")).toBeNull();
    expect(nextState(part("done"), "start")).toBeNull();
  });
  it("finishes from To do (a quick task) or On it", () => {
    expect(nextState(part("todo"), "done")).toBe("done");
    expect(nextState(part("started"), "done")).toBe("done");
    expect(nextState(part("done"), "done")).toBeNull();
    expect(nextState(part("handed_back"), "done")).toBeNull();
  });
  it("undoes Done back to where it was", () => {
    expect(nextState(part("done", "2027-03-06T00:47:00Z"), "undo")).toBe("started");
    expect(nextState(part("done"), "undo")).toBe("todo");
    expect(nextState(part("handed_back"), "undo")).toBe("todo");
    expect(nextState(part("todo"), "undo")).toBeNull();
  });
  it("hands back only an unfinished task", () => {
    expect(nextState(part("todo"), "hand_back")).toBe("handed_back");
    expect(nextState(part("started"), "hand_back")).toBe("handed_back");
    expect(nextState(part("done"), "hand_back")).toBeNull();
  });
});

describe("tapIsNewer", () => {
  it("applies a tap later than the state", () => {
    expect(tapIsNewer("2027-03-06T01:00:05Z", "2027-03-06T01:00:00Z")).toBe(true);
  });
  it("drops a replayed tap that is older or equal", () => {
    expect(tapIsNewer("2027-03-06T01:00:00Z", "2027-03-06T01:00:00Z")).toBe(false);
    expect(tapIsNewer("2027-03-06T00:59:00Z", "2027-03-06T01:00:00Z")).toBe(false);
  });
  it("takes any tap when the state has never changed", () => {
    expect(tapIsNewer("2027-03-06T00:59:00Z", null)).toBe(true);
  });
  it("rejects a tap time that isn't a time", () => {
    expect(tapIsNewer("nonsense", "2027-03-06T01:00:00Z")).toBe(false);
  });
});

describe("clampTapTime", () => {
  const now = new Date("2027-03-06T01:00:00Z");
  it("keeps a sensible device time", () => {
    expect(clampTapTime("2027-03-06T00:58:00Z", now)).toBe("2027-03-06T00:58:00.000Z");
  });
  it("won't let a clock in the future win every race", () => {
    expect(clampTapTime("2030-01-01T00:00:00Z", now)).toBe("2027-03-06T01:01:00.000Z");
  });
  it("uses the server's time when there is none or it is junk", () => {
    expect(clampTapTime(undefined, now)).toBe(now.toISOString());
    expect(clampTapTime("junk", now)).toBe(now.toISOString());
  });
});
