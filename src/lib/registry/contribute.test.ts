import { describe, expect, it } from "vitest";
import {
  contributeHint,
  contributeSection,
  resolveContributePosition,
  type ContributeInput,
} from "./contribute";

const base: ContributeInput = {
  position: "below",
  heading: null,
  text: null,
  buttonOnly: false,
  fundCount: 2,
  hasBank: true,
  hasOnlineLink: false,
};

describe("contributeSection", () => {
  it("is nothing when off, whatever else is set", () => {
    expect(contributeSection({ ...base, position: "off" })).toBeNull();
  });
  it("keeps its position", () => {
    expect(contributeSection({ ...base, position: "above" })?.position).toBe("above");
    expect(contributeSection(base)?.position).toBe("below");
  });
  it("defaults the heading by position and prefers the couple's own", () => {
    expect(contributeSection({ ...base, position: "above" })?.heading).toBe("Prefer to contribute?");
    expect(contributeSection(base)?.heading).toBe("Or give towards something bigger");
    expect(contributeSection({ ...base, heading: "  Give a little  " })?.heading).toBe("Give a little");
    expect(contributeSection({ ...base, heading: "   " })?.heading).toBe("Or give towards something bigger");
  });
  it("is nothing when there is nothing to show", () => {
    expect(contributeSection({ ...base, fundCount: 0, hasBank: false })).toBeNull();
  });
  it("shows funds with no bank details (a fund can be listed on its own)", () => {
    expect(contributeSection({ ...base, hasBank: false })).not.toBeNull();
  });
  it("button only needs bank details or an online link", () => {
    expect(contributeSection({ ...base, buttonOnly: true, hasBank: false })).toBeNull();
    const withBank = contributeSection({ ...base, buttonOnly: true });
    expect(withBank?.listFunds).toBe(false);
    expect(contributeSection({ ...base, buttonOnly: true, hasBank: false, hasOnlineLink: true })).not.toBeNull();
  });
  it("lists the funds by default", () => {
    expect(contributeSection(base)?.listFunds).toBe(true);
  });
});

describe("contributeHint", () => {
  it("says nothing when off or when there is something to show", () => {
    expect(contributeHint({ ...base, position: "off" })).toBeNull();
    expect(contributeHint(base)).toBeNull();
  });
  it("explains an empty section", () => {
    expect(contributeHint({ ...base, fundCount: 0, hasBank: false })).toMatch(/Nothing to show/);
    expect(contributeHint({ ...base, buttonOnly: true, hasBank: false })).toMatch(/Just the button/);
  });
});

describe("resolveContributePosition", () => {
  it("treats anything unrecognised as off", () => {
    expect(resolveContributePosition("above")).toBe("above");
    expect(resolveContributePosition("sideways")).toBe("off");
    expect(resolveContributePosition(null)).toBe("off");
  });
});
