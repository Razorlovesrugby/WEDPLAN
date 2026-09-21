import { describe, expect, it } from "vitest";
import { arrivalStatus, canPublishImmediately, canVote, isPublic } from "./participation";

describe("who may publish without being read first", () => {
  it("publishes a contribution carrying a household", () => {
    // They hold a slug_suffix somebody minted for them (spec 21). That is an
    // invitation, not a stranger.
    expect(canPublishImmediately("d0000000-0000-4000-8000-000000000001")).toBe(true);
    expect(arrivalStatus("d0000000-0000-4000-8000-000000000001")).toBe("approved");
  });

  it("queues one from the shared address", () => {
    expect(canPublishImmediately(null)).toBe(false);
    expect(canPublishImmediately(undefined)).toBe(false);
    expect(arrivalStatus(null)).toBe("new");
  });

  it("treats an empty string as no household", () => {
    // The difference between "" and null should never decide whether a
    // stranger's words reach a wedding site.
    expect(canPublishImmediately("")).toBe(false);
    expect(arrivalStatus("")).toBe("new");
  });
});

describe("voting", () => {
  it("needs a household, because a cookie is a suggestion", () => {
    expect(canVote("d0000000-0000-4000-8000-000000000001")).toBe(true);
    expect(canVote(null)).toBe(false);
    expect(canVote("")).toBe(false);
  });

  it("uses exactly the same rule as publishing", () => {
    // One rule, one function. Two copies is how one of them stops gating.
    for (const id of ["abc", "", null, undefined] as const) {
      expect(canVote(id)).toBe(canPublishImmediately(id));
    }
  });
});

describe("what a reader is shown", () => {
  it("is approved rows only", () => {
    expect(isPublic("approved")).toBe(true);
    expect(isPublic("new")).toBe(false);
    expect(isPublic("ignored")).toBe(false);
  });

  it("hides a household's own note while it is still queued", () => {
    // Showing somebody their own unapproved note reads as published, and they
    // tell people to go and look at it.
    expect(isPublic("new")).toBe(false);
  });
});
