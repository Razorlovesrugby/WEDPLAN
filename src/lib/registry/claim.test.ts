import { describe, expect, it } from "vitest";
import { claimSchema, isHoneypotTripped, outcomeMessage, remainingOf } from "./claim";

const item_id = "f1111111-1111-4111-8111-111111111111";

describe("claimSchema", () => {
  it("takes a name and an optional message", () => {
    const out = claimSchema.parse({ item_id, name: "  Aunt Jo ", message: "  Love you both!  " });
    expect(out.name).toBe("Aunt Jo");
    expect(out.message).toBe("Love you both!");
    expect(out.quantity).toBe(1);
  });
  it("treats a blank message as none and collapses runs of blank lines", () => {
    expect(claimSchema.parse({ item_id, name: "A", message: "   " }).message).toBeNull();
    expect(claimSchema.parse({ item_id, name: "A", message: "a\n\n\n\n\nb" }).message).toBe("a\n\nb");
  });
  it("requires a name and caps both fields", () => {
    expect(claimSchema.safeParse({ item_id, name: "  " }).success).toBe(false);
    expect(claimSchema.safeParse({ item_id, name: "x".repeat(81) }).success).toBe(false);
    expect(claimSchema.safeParse({ item_id, name: "A", message: "x".repeat(501) }).success).toBe(false);
  });
  it("refuses a bad item id and a quantity below 1", () => {
    expect(claimSchema.safeParse({ item_id: "nope", name: "A" }).success).toBe(false);
    expect(claimSchema.safeParse({ item_id, name: "A", quantity: 0 }).success).toBe(false);
  });
  it("does not strip markup — it is stored as text and always rendered escaped", () => {
    expect(claimSchema.parse({ item_id, name: "A", message: "<b>hi</b>" }).message).toBe("<b>hi</b>");
  });
});

describe("honeypot", () => {
  it("trips only when the hidden field has something in it", () => {
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ website: "  " })).toBe(false);
    expect(isHoneypotTripped({ website: "http://spam.test" })).toBe(true);
  });
});

describe("outcomeMessage", () => {
  it("speaks plainly and tells the truth about how many are left", () => {
    expect(outcomeMessage("ok")).toBeNull();
    expect(outcomeMessage("sold_out", 0)).toMatch(/someone just got this one/i);
    expect(outcomeMessage("sold_out", 1)).toMatch(/only 1 is left/i);
    expect(outcomeMessage("sold_out", 3)).toMatch(/only 3 are left/i);
    expect(outcomeMessage("busy")).toMatch(/try again/i);
    expect(outcomeMessage("unavailable")).toMatch(/isn't available/i);
  });
});

describe("remainingOf", () => {
  it("never goes below zero", () => {
    expect(remainingOf(4, 1)).toBe(3);
    expect(remainingOf(1, 3)).toBe(0);
  });
});
