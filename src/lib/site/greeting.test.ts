import { describe, expect, it } from "vitest";
import {
  DEFAULT_GREETING,
  GREETING_MAX_LENGTH,
  GREETING_MAX_NAMES,
  renderGreeting,
  validateGreeting,
} from "./greeting";

const three = ["Chidi", "Ada", "Zara"];
const render = (template: string | null, firstNames: string[] = three, householdName = "Okonkwo family") =>
  renderGreeting({ template, firstNames, householdName });

describe("renderGreeting", () => {
  it("is 'For {names}' by default", () => {
    expect(DEFAULT_GREETING).toBe("For {names}");
    expect(render(null)).toBe("For Chidi, Ada and Zara");
    expect(render("")).toBe("For Chidi, Ada and Zara");
    expect(render("   ")).toBe("For Chidi, Ada and Zara");
  });

  it("fills each token on its own and together", () => {
    expect(render("Dear {names}")).toBe("Dear Chidi, Ada and Zara");
    expect(render("Welcome, {household}")).toBe("Welcome, Okonkwo family");
    expect(render("{names} of the {household}")).toBe("Chidi, Ada and Zara of the Okonkwo family");
  });

  it("allows a greeting with no token at all", () => {
    expect(render("Just for you")).toBe("Just for you");
  });

  it("reads one, two and three names the way a person would", () => {
    expect(render("For {names}", ["Ada"])).toBe("For Ada");
    expect(render("For {names}", ["Chidi", "Ada"])).toBe("For Chidi and Ada");
    expect(render("For {names}", three)).toBe("For Chidi, Ada and Zara");
  });

  it("copes with non-Latin names", () => {
    expect(render("For {names}", ["Åse", "Żaneta", "大輔"])).toBe("For Åse, Żaneta and 大輔");
  });

  it("falls back to the household name when nobody has a first name", () => {
    expect(render("For {names}", [])).toBe("For Okonkwo family");
    expect(render("For {names}", ["", "  "])).toBe("For Okonkwo family");
  });

  it("falls back to the household name for a very large household", () => {
    const many = ["A", "B", "C", "D", "E", "F"];
    expect(many.length).toBeGreaterThan(GREETING_MAX_NAMES);
    expect(render("For {names}", many)).toBe("For Okonkwo family");
    // At the limit it still lists them.
    expect(render("For {names}", many.slice(0, GREETING_MAX_NAMES))).toBe("For A, B, C, D and E");
  });

  it("hides the line when it renders to nothing", () => {
    expect(render("{names}", [], "")).toBeNull();
    expect(render("{household}", three, "  ")).toBeNull();
  });

  it("never puts an unfilled token on a page, even from a template saved some other way", () => {
    expect(render("For {nickname}")).toBe("For Chidi, Ada and Zara");
    expect(render("For {names")).toBe("For Chidi, Ada and Zara");
  });

  it("collapses the whitespace a token can leave", () => {
    expect(render("Dear   {names} ,")).toBe("Dear Chidi, Ada and Zara ,");
  });

  it("renders HTML as the characters it is — it is plain text", () => {
    expect(render("<b>Hi</b> {names}")).toBe("<b>Hi</b> Chidi, Ada and Zara");
  });
});

describe("validateGreeting", () => {
  it("accepts the known tokens, none, and empty", () => {
    for (const ok of ["For {names}", "{household}", "Hello", "", "  For {names}  "]) {
      expect(validateGreeting(ok).ok, ok).toBe(true);
    }
  });

  it("returns the trimmed value", () => {
    expect(validateGreeting("  For {names}  ")).toEqual({ ok: true, value: "For {names}" });
  });

  it("refuses an unknown token and names the ones that exist", () => {
    const result = validateGreeting("For {nickname}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("{nickname}");
      expect(result.error).toContain("{names}");
      expect(result.error).toContain("{household}");
    }
  });

  it("refuses a stray brace", () => {
    for (const bad of ["For {names", "For names}", "{{names}}", "}{"]) {
      expect(validateGreeting(bad).ok, bad).toBe(false);
    }
  });

  it("refuses more than the limit, and accepts exactly the limit", () => {
    expect(validateGreeting("x".repeat(GREETING_MAX_LENGTH)).ok).toBe(true);
    expect(validateGreeting("x".repeat(GREETING_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
