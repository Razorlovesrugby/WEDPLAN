import { describe, expect, it } from "vitest";
import { HOLD_MAX_MS, NO_HOLDS, giveUpMessage, isHeld, skipPoll, syncDecision } from "./sync";

describe("sync holds (spec 60 E.1)", () => {
  it("takes the server's copy when nothing is pending", () => {
    expect(isHeld(NO_HOLDS)).toBe(false);
    expect(syncDecision(NO_HOLDS, 0)).toBe("take");
    expect(skipPoll(NO_HOLDS)).toBe(false);
  });

  it("holds while a write is in flight or queued", () => {
    expect(syncDecision({ ...NO_HOLDS, writes: 1 }, 0)).toBe("hold");
    expect(syncDecision({ ...NO_HOLDS, writes: 3 }, 4000)).toBe("hold");
  });

  it("holds while a run of nudges waits to be saved", () => {
    expect(syncDecision({ ...NO_HOLDS, nudges: true }, 0)).toBe("hold");
  });

  it("holds while a drag, box or line is in progress", () => {
    expect(syncDecision({ ...NO_HOLDS, gesture: true }, 0)).toBe("hold");
  });

  it("skips the 15-second poll while anything is pending", () => {
    expect(skipPoll({ ...NO_HOLDS, writes: 1 })).toBe(true);
    expect(skipPoll({ ...NO_HOLDS, nudges: true })).toBe(true);
    expect(skipPoll({ ...NO_HOLDS, gesture: true })).toBe(true);
  });

  it("gives up after the cap, and takes the copy anyway", () => {
    expect(syncDecision({ ...NO_HOLDS, writes: 1 }, HOLD_MAX_MS - 1)).toBe("hold");
    expect(syncDecision({ ...NO_HOLDS, writes: 1 }, HOLD_MAX_MS)).toBe("give-up");
  });

  it("takes the copy the moment the last hold is released, however long it was held", () => {
    expect(syncDecision(NO_HOLDS, HOLD_MAX_MS * 3)).toBe("take");
  });

  it("only warns about an unsaved write, not about a long drag", () => {
    expect(giveUpMessage({ ...NO_HOLDS, writes: 1 })).toMatch(/hasn't finished saving/);
    expect(giveUpMessage({ ...NO_HOLDS, gesture: true })).toBeNull();
    expect(giveUpMessage({ ...NO_HOLDS, nudges: true })).toBeNull();
  });
});
