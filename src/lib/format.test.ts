import { describe, expect, it } from "vitest";
import { sideLabel } from "./format";

describe("sideLabel", () => {
  const owner = { role: "owner" as const, display_name: "Ray" };
  const partner = { role: "partner" as const, display_name: "Olivia" };

  it("labels partner_a with the owner collaborator's name", () => {
    expect(sideLabel("partner_a", [owner, partner])).toBe("Ray");
  });

  it("labels partner_b with the non-owner collaborator's name", () => {
    expect(sideLabel("partner_b", [owner, partner])).toBe("Olivia");
  });

  it("falls back to Partner A / Partner B when a name isn't set", () => {
    const unnamedOwner = { role: "owner" as const, display_name: null };
    const unnamedPartner = { role: "partner" as const, display_name: null };
    expect(sideLabel("partner_a", [unnamedOwner, unnamedPartner])).toBe("Partner A");
    expect(sideLabel("partner_b", [unnamedOwner, unnamedPartner])).toBe("Partner B");
  });

  it("falls back to Partner A / Partner B when the matching collaborator doesn't exist yet", () => {
    expect(sideLabel("partner_a", [])).toBe("Partner A");
    expect(sideLabel("partner_b", [])).toBe("Partner B");
  });

  it("labels both and other generically, and blank as an em dash", () => {
    expect(sideLabel("both", [owner, partner])).toBe("Both");
    expect(sideLabel("other", [owner, partner])).toBe("Other");
    expect(sideLabel(null, [owner, partner])).toBe("—");
    expect(sideLabel(undefined, [owner, partner])).toBe("—");
  });
});
