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

describe("BLOCK_SCHEMAS", () => {
  it("has a schema for every block type", () => {
    expect(Object.keys(BLOCK_SCHEMAS).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});
