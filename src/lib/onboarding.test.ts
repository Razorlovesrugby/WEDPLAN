import { describe, expect, it } from "vitest";
import {
  currencyOptions,
  defaultWeddingName,
  isEmailTaken,
  isHoneypotTripped,
  isKnownCurrency,
  isOnboardingOpen,
  passwordProblem,
  startSchema,
  startSignedInSchema,
  timeZoneOptions,
  utcOffsetLabel,
} from "./onboarding";

const valid = {
  your_name: "Sam Taylor",
  partner_name: "Alex",
  partner_email: "alex@example.test",
  wedding_name: "Sam & Alex",
  wedding_date: "2027-03-20",
  timezone: "Pacific/Auckland",
  currency: "nzd",
  capacity: "80",
  email: "Sam@Example.test",
  password: "longenough",
  password_again: "longenough",
};

describe("passwordProblem (Q3: 8 characters)", () => {
  it("accepts 8 and refuses 7", () => {
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("1234567")).toBe("Use at least 8 characters");
  });
  it("refuses more than 72 bytes rather than truncating", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toBe("Use at most 72 characters");
  });
});

describe("startSchema", () => {
  it("parses a full sign-up, normalising email and currency", () => {
    const parsed = startSchema.parse(valid);
    expect(parsed.email).toBe("sam@example.test");
    expect(parsed.currency).toBe("NZD");
    expect(parsed.capacity).toBe(80);
    expect(parsed.partner_email).toBe("alex@example.test");
  });

  it("treats blank optional fields as absent", () => {
    const parsed = startSchema.parse({ ...valid, partner_name: "", partner_email: "", wedding_date: "", capacity: "" });
    expect(parsed.partner_name).toBeNull();
    expect(parsed.partner_email).toBeNull();
    expect(parsed.wedding_date).toBeNull();
    expect(parsed.capacity).toBeNull();
  });

  it("needs the two passwords to match", () => {
    const result = startSchema.safeParse({ ...valid, password_again: "different!" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.password_again).toEqual(["The two passwords don't match"]);
  });

  it("refuses a short password", () => {
    const result = startSchema.safeParse({ ...valid, password: "short", password_again: "short" });
    expect(result.error?.flatten().fieldErrors.password).toEqual(["Use at least 8 characters"]);
  });

  it("refuses the partner using your own email", () => {
    const result = startSchema.safeParse({ ...valid, partner_email: "sam@example.test" });
    expect(result.error?.flatten().fieldErrors.partner_email).toEqual(["Your partner needs their own email address"]);
  });

  it("refuses an unknown timezone or currency", () => {
    expect(startSchema.safeParse({ ...valid, timezone: "Pacific/Atlantis" }).success).toBe(false);
    expect(startSchema.safeParse({ ...valid, currency: "DOLLARS" }).success).toBe(false);
  });

  it("needs a name and a wedding name", () => {
    const result = startSchema.safeParse({ ...valid, your_name: " ", wedding_name: "" });
    const errors = result.error?.flatten().fieldErrors;
    expect(errors?.your_name).toBeDefined();
    expect(errors?.wedding_name).toBeDefined();
  });

  it("has a signed-in variant with no account fields", () => {
    const { email: _e, password: _p, password_again: _a, ...rest } = valid;
    expect(startSignedInSchema.safeParse(rest).success).toBe(true);
  });
});

describe("currency (Q6)", () => {
  it("pins the six main currencies first", () => {
    expect(currencyOptions().slice(0, 6)).toEqual(["NZD", "AUD", "USD", "GBP", "EUR", "CAD"]);
  });
  it("knows real codes and refuses junk", () => {
    expect(isKnownCurrency("NZD")).toBe(true);
    expect(isKnownCurrency("JPY")).toBe(true);
    expect(isKnownCurrency("nzd")).toBe(false);
    expect(isKnownCurrency("ZZZ")).toBe(false);
  });
});

describe("timezones", () => {
  it("puts Auckland first, then the extras, without duplicates", () => {
    const all = ["Europe/London", "Pacific/Auckland", "Australia/Sydney"];
    expect(timeZoneOptions(all, ["Australia/Sydney", "Pacific/Auckland", null])).toEqual([
      "Pacific/Auckland",
      "Australia/Sydney",
      "Europe/London",
    ]);
  });
  it("labels the offset at a given moment, following daylight saving", () => {
    expect(utcOffsetLabel("Pacific/Auckland", new Date("2027-01-15T00:00:00Z"))).toBe("UTC+13");
    expect(utcOffsetLabel("Pacific/Auckland", new Date("2027-07-15T00:00:00Z"))).toBe("UTC+12");
    expect(utcOffsetLabel("America/New_York", new Date("2027-01-15T00:00:00Z"))).toBe("UTC−5");
    expect(utcOffsetLabel("Asia/Kolkata", new Date("2027-01-15T00:00:00Z"))).toBe("UTC+5:30");
    expect(utcOffsetLabel("UTC")).toBe("UTC");
  });
});

describe("small helpers", () => {
  it("suggests a wedding name from first names", () => {
    expect(defaultWeddingName("Sam Taylor", "Alex Smith")).toBe("Sam & Alex");
    expect(defaultWeddingName("Sam", null)).toBe("Sam's wedding");
    expect(defaultWeddingName("", null)).toBe("");
  });
  it("spots the honeypot", () => {
    expect(isHoneypotTripped({ website: "http://spam" })).toBe(true);
    expect(isHoneypotTripped({ website: "" })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
  });
  it("opens only on an explicit yes", () => {
    expect(isOnboardingOpen("true")).toBe(true);
    expect(isOnboardingOpen("1")).toBe(true);
    expect(isOnboardingOpen("")).toBe(false);
    expect(isOnboardingOpen(undefined)).toBe(false);
    expect(isOnboardingOpen("false")).toBe(false);
  });
  it("recognises Supabase's 'email taken' errors", () => {
    expect(isEmailTaken({ code: "email_exists" })).toBe(true);
    expect(isEmailTaken({ message: "A user with this email address has already been registered" })).toBe(true);
    expect(isEmailTaken({ message: "Database error" })).toBe(false);
  });
});
