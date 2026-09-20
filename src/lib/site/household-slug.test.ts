import { describe, expect, it } from "vitest";
import {
  formatAddress,
  generateSuffix,
  householdPath,
  householdSlugify,
  isValidHouseholdSlug,
  isValidSuffix,
  parseAddress,
  slugify,
  stripHouseholdFiller,
  SUFFIX_ALPHABET,
  SUFFIX_LENGTH,
} from "./household-slug";

/**
 * The cases marked "same as SQL" are also asserted in
 * `supabase/tests/08_household_slugs.sql` against `household_slugify()`. Two
 * implementations derive an address — the trigger on insert, this in the
 * editor — and they have to agree, so the cases live in both files on
 * purpose. If you change one, change the other.
 */

describe("slugify", () => {
  it("matches 0015's SQL for the cases that file tests", () => {
    expect(slugify("Alex & Sam")).toBe("alex-sam");
    expect(slugify("  Alex   and   Sam  ")).toBe("alex-and-sam");
    expect(slugify("José & Siân")).toBe("jose-sian");
    expect(slugify("Zoë")).toBe("zoe");
    expect(slugify("A/B")).toBe("a-b");
    expect(slugify("Alex--Sam")).toBe("alex-sam");
    expect(slugify("-Alex-")).toBe("alex");
    expect(slugify("2027")).toBe("2027");
    expect(slugify("!!!")).toBe("");
  });
});

describe("stripHouseholdFiller", () => {
  it("takes off a leading The and a trailing family word", () => {
    expect(stripHouseholdFiller("The Okonkwo family")).toBe("Okonkwo");
    expect(stripHouseholdFiller("The Nakamuras")).toBe("Nakamuras");
    expect(stripHouseholdFiller("The Reid whānau")).toBe("Reid");
    expect(stripHouseholdFiller("The Ferreira Family")).toBe("Ferreira");
  });

  it("leaves a name that merely starts with those letters alone", () => {
    // The bug this prevents is "Theodore Blake" addressing as `odore-blake`.
    expect(stripHouseholdFiller("Theodore Blake")).toBe("Theodore Blake");
    expect(stripHouseholdFiller("Thessaly Ng")).toBe("Thessaly Ng");
  });

  it("only strips the family word from the end", () => {
    expect(stripHouseholdFiller("Family Ferreira")).toBe("Family Ferreira");
  });
});

describe("householdSlugify", () => {
  it("derives the address the planner sees — same as SQL", () => {
    expect(householdSlugify("The Okonkwo family")).toBe("okonkwo");
    expect(householdSlugify("The Nakamuras")).toBe("nakamuras");
    expect(householdSlugify("Priya & Dev Raman")).toBe("priya-dev-raman");
    expect(householdSlugify("Grandma Reid")).toBe("grandma-reid");
    expect(householdSlugify("Old rugby lot")).toBe("old-rugby-lot");
  });

  it("falls back to the unstripped name rather than to nothing", () => {
    // "The family" strips to "", which is not an address. The whole name is
    // a better answer than the constant.
    expect(householdSlugify("The family")).toBe("the-family");
  });

  it("falls back to the constant when nothing is usable", () => {
    expect(householdSlugify("🎉🎉")).toBe("household");
    expect(householdSlugify("")).toBe("household");
    expect(householdSlugify(null)).toBe("household");
    expect(householdSlugify(undefined)).toBe("household");
  });

  it("never returns something the shape check would reject", () => {
    // A one-character name derives `j`, which violates length >= 2 — the
    // insert would fail on a name the planner is allowed to type.
    expect(householdSlugify("J")).toBe("household");
    expect(isValidHouseholdSlug(householdSlugify("J"))).toBe(true);

    const long = householdSlugify("Wilhelmina ".repeat(20));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(isValidHouseholdSlug(long)).toBe(true);
  });
});

describe("isValidHouseholdSlug", () => {
  it("rejects what the database rejects", () => {
    for (const bad of ["with/slash", "with space", "UPPER", "-leading", "trailing-", "a", ""]) {
      expect(isValidHouseholdSlug(bad), bad).toBe(false);
    }
  });

  it("rejects a slug that would shadow a route", () => {
    expect(isValidHouseholdSlug("rsvp")).toBe(false);
    expect(isValidHouseholdSlug("api")).toBe(false);
    // Not reserved as a whole word, so still fine.
    expect(isValidHouseholdSlug("rsvp-crew")).toBe(true);
  });

  it("accepts the real guest list", () => {
    for (const good of ["okonkwo", "nakamuras", "priya-dev-raman", "old-rugby-lot", "2027"]) {
      expect(isValidHouseholdSlug(good), good).toBe(true);
    }
  });
});

describe("generateSuffix", () => {
  it("is five characters of the Crockford alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const suffix = generateSuffix();
      expect(suffix).toHaveLength(SUFFIX_LENGTH);
      expect(isValidSuffix(suffix)).toBe(true);
      expect(suffix).not.toMatch(/[ilou]/);
    }
  });

  it("covers the alphabet and does not repeat itself", () => {
    const drawn = new Set<string>();
    const chars = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const suffix = generateSuffix();
      drawn.add(suffix);
      for (const char of suffix) chars.add(char);
    }
    // 500 draws from 33 million: a collision means something is very wrong.
    expect(drawn.size).toBe(500);
    expect(chars.size).toBe(SUFFIX_ALPHABET.length);
  });
});

describe("parseAddress", () => {
  it("splits on the last hyphen, so a multi-word name survives", () => {
    expect(parseAddress("priya-dev-raman-7t3mq")).toEqual({
      slug: "priya-dev-raman",
      suffix: "7t3mq",
    });
    expect(parseAddress("okonkwo-4f7ak")).toEqual({ slug: "okonkwo", suffix: "4f7ak" });
  });

  it("refuses anything that is not an address", () => {
    for (const bad of [
      "okonkwo", // no suffix
      "okonkwo-", // empty suffix
      "-4f7ak", // no slug
      "okonkwo-4f7a", // four characters
      "okonkwo-4f7akk", // six
      "okonkwo-4f7ai", // i is not in the alphabet
      "okonkwo-4F7AK", // uppercase
      "OKONKWO-4f7ak",
      "okon kwo-4f7ak",
      "okonkwo/x-4f7ak",
      "",
      "-",
    ]) {
      expect(parseAddress(bad), bad).toBeNull();
    }
  });

  it("round-trips whatever formatAddress produces", () => {
    const address = { slug: householdSlugify("The Okonkwo family"), suffix: generateSuffix() };
    expect(parseAddress(formatAddress(address))).toEqual(address);
  });

  it("still resolves a stored slug that has since become a route name", () => {
    // isValidHouseholdSlug refuses to MINT `rsvp`; parseAddress still resolves
    // one that was minted before the route existed, because a household whose
    // link stops working is worse than a slug we would not issue today.
    expect(parseAddress("rsvp-4f7ak")).toEqual({ slug: "rsvp", suffix: "4f7ak" });
  });
});

describe("householdPath", () => {
  it("is the address the planner copies", () => {
    expect(householdPath("ray-and-olivia", { slug: "okonkwo", suffix: "4f7ak" })).toBe(
      "/w/ray-and-olivia/okonkwo-4f7ak",
    );
  });
});
