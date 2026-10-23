import { describe, expect, it } from "vitest";
import {
  MAX_SPECS,
  cleanSpecs,
  dollarsToMinor,
  formatPrice,
  isWebUrl,
  itemSchema,
  minorToDollars,
  specSummary,
  storeFromUrl,
  wantedLabel,
} from "./items";

describe("isWebUrl", () => {
  it("accepts http and https shops", () => {
    expect(isWebUrl("https://www.briscoes.co.nz/p/123")).toBe(true);
    expect(isWebUrl("http://shop.test/a")).toBe(true);
  });
  it("refuses everything else — the value ends up in an href", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://a.test/x", "//a.test", "https://localhost", "", "not a url"]) {
      expect(isWebUrl(bad), bad).toBe(false);
    }
  });
});

describe("storeFromUrl", () => {
  it("names the shop by its host, without www", () => {
    expect(storeFromUrl("https://www.Amazon.co.nz/dp/1")).toBe("amazon.co.nz");
    expect(storeFromUrl("nonsense")).toBeNull();
  });
});

describe("cleanSpecs", () => {
  it("drops blank rows, trims, and keeps order", () => {
    expect(cleanSpecs([{ label: " Colour ", value: " Sage " }, { label: "", value: "x" }, { label: "Size", value: "" }, { label: "Size", value: "Queen" }])).toEqual([
      { label: "Colour", value: "Sage" },
      { label: "Size", value: "Queen" },
    ]);
  });
  it("caps the list and never throws on junk", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: `V${i}` }));
    expect(cleanSpecs(many)).toHaveLength(MAX_SPECS);
    expect(cleanSpecs("nope")).toEqual([]);
    expect(cleanSpecs([null, 5, {}])).toEqual([]);
  });
  it("summarises values for a card chip line", () => {
    expect(specSummary([{ label: "Colour", value: "Sage" }, { label: "Size", value: "Queen" }])).toBe("Sage · Queen");
    expect(specSummary([])).toBe("");
  });
});

describe("price handling is integer minor units, never a float", () => {
  it("converts typed dollars", () => {
    expect(dollarsToMinor("120")).toBe(12000);
    expect(dollarsToMinor("$1,299.50")).toBe(129950);
    expect(dollarsToMinor("19.9")).toBe(1990);
    expect(dollarsToMinor("0.10")).toBe(10);
  });
  it("is exact where floats are not", () => {
    expect(dollarsToMinor("0.29")).toBe(29); // 0.29 * 100 === 28.999999999999996
    expect(dollarsToMinor("1.15")).toBe(115);
  });
  it("rejects blanks, junk, zero and absurd values", () => {
    for (const bad of ["", "abc", "0", "-5", "1.234", "99999999", null, undefined]) {
      expect(dollarsToMinor(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });
  it("round-trips for the edit field", () => {
    expect(minorToDollars(12000)).toBe("120");
    expect(minorToDollars(11950)).toBe("119.50");
    expect(minorToDollars(null)).toBe("");
  });
  it("shows whole dollars without cents on a card", () => {
    expect(formatPrice(12000)).toBe("$120");
    expect(formatPrice(11950)).toBe("$119.50");
    expect(formatPrice(null)).toBeNull();
  });
});

describe("wantedLabel", () => {
  it("says nothing for a single item or a finished one", () => {
    expect(wantedLabel(1, 1)).toBeNull();
    expect(wantedLabel(0, 4)).toBeNull();
  });
  it("counts for several", () => {
    expect(wantedLabel(4, 4)).toBe("4 wanted");
    expect(wantedLabel(2, 4)).toBe("2 still wanted");
  });
});

describe("itemSchema", () => {
  const base = { title: "Glasses", url: "https://shop.test/g" };
  it("accepts the minimum and applies defaults", () => {
    const out = itemSchema.parse(base);
    expect(out.quantity).toBe(1);
    expect(out.tag_ids).toEqual([]);
    expect(out.starred).toBe(false);
  });
  it("refuses a javascript: link and a blank title", () => {
    expect(itemSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
  });
  it("bounds quantity", () => {
    expect(itemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, quantity: 100 }).success).toBe(false);
    expect(itemSchema.parse({ ...base, quantity: "4" }).quantity).toBe(4);
  });
});
