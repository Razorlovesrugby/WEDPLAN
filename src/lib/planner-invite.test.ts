import { describe, expect, it } from "vitest";
import { isInviteLinkType, looksLikeEmail, plannerInvitePath } from "./planner-invite";

describe("plannerInvitePath", () => {
  it("goes to the auth callback and on to choosing a password", () => {
    const path = plannerInvitePath("abc123", "invite");
    const url = new URL(path, "https://wedplan.example");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("invite");
    expect(url.searchParams.get("next")).toBe("/reset-password");
  });

  it("encodes a token with awkward characters instead of letting it break the query", () => {
    const path = plannerInvitePath("a b&c=d#e", "recovery");
    const url = new URL(path, "https://wedplan.example");
    expect(url.searchParams.get("token_hash")).toBe("a b&c=d#e");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.hash).toBe("");
  });

  it("keeps `next` a same-origin path (the callback refuses anything else)", () => {
    const next = new URL(plannerInvitePath("t", "invite"), "https://x.test").searchParams.get("next") ?? "";
    expect(/^\/(?!\/)/.test(next)).toBe(true);
  });
});

describe("isInviteLinkType", () => {
  it("accepts only the two kinds the callback will verify", () => {
    expect(isInviteLinkType("invite")).toBe(true);
    expect(isInviteLinkType("recovery")).toBe(true);
    expect(isInviteLinkType("magiclink")).toBe(false);
    expect(isInviteLinkType("signup")).toBe(false);
    expect(isInviteLinkType(null)).toBe(false);
  });
});

describe("looksLikeEmail", () => {
  it("catches typos, not policy", () => {
    expect(looksLikeEmail("pat@planner.co.nz")).toBe(true);
    expect(looksLikeEmail("  pat@planner.co.nz ")).toBe(true);
    expect(looksLikeEmail("pat@planner")).toBe(false);
    expect(looksLikeEmail("pat planner@x.com")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(250)}@x.co`)).toBe(false);
  });
});
