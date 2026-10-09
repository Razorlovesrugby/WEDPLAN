import { describe, expect, it } from "vitest";
import { BLOCK_STYLE_KEYS, BLOCK_TYPES } from "./blocks";
import { BLOCK_SCHEMAS, styleSchema } from "./block-schemas";

describe("styleSchema", () => {
  it("accepts exactly the keys BlockStyle declares", () => {
    // `styleSchema` is strict: a key it does not list makes every save of a
    // styled block fail with "That isn't a style this block offers". This is
    // the test that stops a new style key shipping without its schema entry.
    expect(Object.keys(styleSchema.shape).sort()).toEqual([...BLOCK_STYLE_KEYS].sort());
  });

  it("refuses a key it does not know", () => {
    expect(styleSchema.safeParse({ colour: "red" }).success).toBe(false);
  });

  it("takes an asset id, never a URL, for a photograph background", () => {
    expect(styleSchema.safeParse({ bgImage: "https://example.com/x.jpg" }).success).toBe(false);
    expect(styleSchema.safeParse({ bgImage: crypto.randomUUID() }).success).toBe(true);
  });
});

describe("photoText", () => {
  it("takes the four choices and nothing else", () => {
    for (const value of ["none", "darken", "shadow", "panel"]) {
      expect(styleSchema.safeParse({ photoText: value }).success).toBe(true);
    }
    expect(styleSchema.safeParse({ photoText: "blur" }).success).toBe(false);
  });

  it("is optional, so every existing block still validates", () => {
    expect(styleSchema.safeParse({ background: "photograph" }).success).toBe(true);
  });
});

describe("BLOCK_SCHEMAS", () => {
  it("has a schema for every block type", () => {
    expect(Object.keys(BLOCK_SCHEMAS).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});

describe("the hero's cover", () => {
  const hero = BLOCK_SCHEMAS.hero;

  it("accepts a hero saved before the cover existed", () => {
    // Every cover switch is optional, and absent means ON — so an old hero
    // validates and renders exactly as it did.
    expect(hero.safeParse({ headline: "Ray & Olivia", date_label: "12 June" }).success).toBe(true);
    expect(hero.safeParse({}).success).toBe(true);
  });

  it("accepts a greeting built from the tokens, and none", () => {
    for (const greeting of ["For {names}", "Dear {household}", "Just for you", ""]) {
      expect(hero.safeParse({ greeting_text: greeting }).success, greeting).toBe(true);
    }
  });

  it("refuses an unknown token, and says which", () => {
    const result = hero.safeParse({ greeting_text: "For {nickname}" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.flatten().fieldErrors.greeting_text)).toContain("{nickname}");
    }
  });

  it("refuses a greeting over 80 characters", () => {
    expect(hero.safeParse({ greeting_text: "x".repeat(81) }).success).toBe(false);
  });

  it("stores an empty greeting as nothing, so the default applies", () => {
    expect(hero.parse({ greeting_text: "   " }).greeting_text).toBeUndefined();
  });
});
