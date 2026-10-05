import { describe, expect, it } from "vitest";
import {
  accountDigits,
  formatNzAccount,
  giftClipboardText,
  giftReference,
  parseNzAccount,
} from "./bank-account";

describe("parseNzAccount", () => {
  it("accepts the usual grouping and stores digits", () => {
    const result = parseNzAccount("12-3456-7890123-00");
    expect(result).toEqual({ ok: true, digits: "123456789012300", formatted: "12-3456-7890123-00" });
  });

  it("accepts the same number pasted any other way", () => {
    for (const typed of ["123456789012300", "12 3456 7890123 00", "12 – 3456 – 7890123 – 00", " 12-3456-7890123-00 "]) {
      expect(parseNzAccount(typed), typed).toMatchObject({ ok: true, digits: "123456789012300" });
    }
  });

  it("accepts a three-digit suffix", () => {
    expect(parseNzAccount("01-0203-0405060-001")).toEqual({
      ok: true,
      digits: "0102030405060001",
      formatted: "01-0203-0405060-001",
    });
  });

  it("keeps a leading zero — a bank number is not a quantity", () => {
    const result = parseNzAccount("01-0203-0405060-00");
    expect(result.ok && result.digits.startsWith("01")).toBe(true);
  });

  it("says how far off a short number is", () => {
    const result = parseNzAccount("12-3456-789012-00");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/14 digits.*15 or 16/);
  });

  it("refuses a long one, letters, and nothing", () => {
    expect(parseNzAccount("12-3456-7890123-0000").ok).toBe(false);
    expect(parseNzAccount("12-3456-78901AB-00").ok).toBe(false);
    expect(parseNzAccount("").ok).toBe(false);
    expect(parseNzAccount("   ").ok).toBe(false);
  });

  it("agrees with the database's own check (15 or 16 digits, nothing else)", () => {
    // `0033`: account_number ~ '^[0-9]{15,16}$'. Anything ok here must pass it.
    for (const typed of ["123456789012300", "1234567890123001", "12-3456-7890123-00"]) {
      const result = parseNzAccount(typed);
      expect(result.ok && /^[0-9]{15,16}$/.test(result.digits), typed).toBe(true);
    }
  });
});

describe("formatNzAccount", () => {
  it("groups 2-4-7-2 and 2-4-7-3", () => {
    expect(formatNzAccount("123456789012300")).toBe("12-3456-7890123-00");
    expect(formatNzAccount("1234567890123001")).toBe("12-3456-7890123-001");
  });

  it("leaves anything else as it was rather than guessing", () => {
    expect(formatNzAccount("12345")).toBe("12345");
    expect(formatNzAccount("")).toBe("");
  });

  it("round-trips through accountDigits", () => {
    expect(accountDigits(formatNzAccount("123456789012300"))).toBe("123456789012300");
  });
});

describe("giftReference", () => {
  it("is the household's name without the filler, then 'gift'", () => {
    expect(giftReference("The Okonkwo Family")).toBe("Okonkwo gift");
    expect(giftReference("Okonkwo")).toBe("Okonkwo gift");
    expect(giftReference("The Smith-Jones household")).toBe("Smith-Jones gift");
  });

  it("keeps a name that merely starts with 'the'", () => {
    expect(giftReference("Theodore Blake")).toBe("Theodore Blake gift");
  });

  it("falls back rather than printing ' gift'", () => {
    expect(giftReference("")).toBe("Wedding gift");
    expect(giftReference(null)).toBe("Wedding gift");
    expect(giftReference("The Family")).toBe("The Family gift");
  });

  it("is capped, because a bank cuts a long reference where it likes", () => {
    const reference = giftReference("Wolfeschlegelsteinhausenbergerdorff Wolfeschlegelsteinhausen");
    expect(reference.length).toBeLessThanOrEqual(40);
  });
});

describe("giftClipboardText", () => {
  it("is three labelled lines, the number grouped for reading", () => {
    expect(
      giftClipboardText({
        accountName: "Ray & Olivia Smith",
        accountNumber: "123456789012300",
        reference: "Okonkwo gift",
      }),
    ).toBe("Account name: Ray & Olivia Smith\nAccount number: 12-3456-7890123-00\nReference: Okonkwo gift");
  });

  it("leaves out what the couple have not filled in", () => {
    expect(giftClipboardText({ accountName: null, accountNumber: null, reference: "Okonkwo gift" })).toBe(
      "Reference: Okonkwo gift",
    );
  });
});
