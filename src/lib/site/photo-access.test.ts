import { describe, expect, it } from "vitest";
import { chooseVariant, mayServePublicly, parseWidth, revisionReferences } from "./photo-access";

const ID = "22222222-2222-4222-8222-222222222222";

describe("revisionReferences", () => {
  it("finds a photograph wherever a block uses it", () => {
    expect(revisionReferences([{ type: "hero", payload: { image_id: ID } }], ID)).toBe(true);
    expect(revisionReferences([{ type: "story", style: { bgImage: ID } }], ID)).toBe(true);
    expect(revisionReferences([{ payload: { rows: [{ nested: { image_id: ID } }] } }], ID)).toBe(true);
  });

  it("does not find one the revision never mentions", () => {
    expect(revisionReferences([{ type: "hero", payload: { headline: "x" } }], ID)).toBe(false);
    expect(revisionReferences([], ID)).toBe(false);
    expect(revisionReferences(null, ID)).toBe(false);
  });

  it("is false for an empty id, which would otherwise match everything", () => {
    expect(revisionReferences([{ a: "anything" }], "")).toBe(false);
  });
});

describe("mayServePublicly", () => {
  const approved = "2027-01-01T00:00:00Z";

  it("never shows a photograph awaiting approval, whoever uploaded it", () => {
    expect(mayServePublicly({ approved_at: null, uploaded_by_household: null }, true)).toBe(false);
    expect(mayServePublicly({ approved_at: null, uploaded_by_household: "h1" }, true)).toBe(false);
  });

  it("shows the couple's own photograph only when a published revision uses it", () => {
    expect(mayServePublicly({ approved_at: approved, uploaded_by_household: null }, true)).toBe(true);
    expect(mayServePublicly({ approved_at: approved, uploaded_by_household: null }, false)).toBe(false);
  });

  it("shows an approved guest upload — that is the gallery", () => {
    expect(mayServePublicly({ approved_at: approved, uploaded_by_household: "h1" }, false)).toBe(true);
  });
});

describe("chooseVariant", () => {
  it("uses a narrower copy only when it exists", () => {
    expect(chooseVariant(480, [480, 960])).toBe(480);
    expect(chooseVariant(960, [480])).toBe("display");
    expect(chooseVariant(480, [])).toBe("display");
    expect(chooseVariant(480, null)).toBe("display");
  });

  it("serves the original for no request, or one it does not know", () => {
    expect(chooseVariant(null, [480, 960])).toBe("display");
    expect(chooseVariant(1200, [1200])).toBe("display");
  });
});

describe("parseWidth", () => {
  it("accepts the generated widths, and no width at all", () => {
    expect(parseWidth("480")).toBe(480);
    expect(parseWidth("960")).toBe(960);
    expect(parseWidth(null)).toBeNull();
  });

  it("marks anything else as invalid rather than guessing", () => {
    for (const bad of ["1200", "abc", "", "480px", "-1"]) expect(parseWidth(bad), bad).toBeUndefined();
  });
});
