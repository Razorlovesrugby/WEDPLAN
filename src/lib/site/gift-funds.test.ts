import { describe, expect, it } from "vitest";
import { safeContributeUrl, toPublicBank, toPublicFund } from "./gift-funds";

describe("toPublicFund", () => {
  const row = {
    id: "f1",
    wedding_id: "w1",
    name: "The honeymoon",
    blurb: "Two weeks with no phone signal",
    target_minor: 120_000,
    raised_minor: 74_000,
    contribute_url: "https://wise.test/pay/abc",
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  it("carries a name and a line, and nothing about money", () => {
    const fund = toPublicFund(row);
    expect(fund).toEqual({
      id: "f1",
      name: "The honeymoon",
      blurb: "Two weeks with no phone signal",
      contributeUrl: "https://wise.test/pay/abc",
    });
    // The figures the couple typed stay in the database and never reach a guest.
    expect(JSON.stringify(fund)).not.toMatch(/74000|120000|raised|target/i);
  });

  it("drops a link that is not a web address", () => {
    expect(toPublicFund({ ...row, contribute_url: "javascript:alert(1)" }).contributeUrl).toBeNull();
  });
});

describe("toPublicBank", () => {
  const bank = {
    wedding_id: "w1",
    account_name: " Ray & Olivia Smith ",
    account_number: "123456789012300",
    message: null,
    note: " ",
    created_at: "",
    updated_at: "",
  };

  it("trims, and turns a blank into nothing", () => {
    expect(toPublicBank(bank)).toEqual({
      accountName: "Ray & Olivia Smith",
      accountNumber: "123456789012300",
      message: null,
      note: null,
    });
  });

  it("is null when there is no row, or when the couple left it empty", () => {
    expect(toPublicBank(null)).toBeNull();
    expect(toPublicBank(undefined)).toBeNull();
    expect(toPublicBank({ ...bank, account_name: "", account_number: null })).toBeNull();
  });

  it("is enough with just a name or just a number", () => {
    expect(toPublicBank({ ...bank, account_number: null })).not.toBeNull();
    expect(toPublicBank({ ...bank, account_name: null })).not.toBeNull();
  });
});

describe("safeContributeUrl", () => {
  it("passes http and https through untouched", () => {
    expect(safeContributeUrl("https://wise.com/pay/abc")).toBe("https://wise.com/pay/abc");
    expect(safeContributeUrl("  http://example.test/give  ")).toBe("http://example.test/give");
  });

  it("refuses anything that is not a web address", () => {
    // The value ends up in an href in front of every guest.
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative", "wise.com", "", null]) {
      expect(safeContributeUrl(bad), String(bad)).toBeNull();
    }
  });
});
