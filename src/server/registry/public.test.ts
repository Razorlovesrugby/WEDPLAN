import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source guards for the one rule the registry turns on (spec 36 §6.2): the
 * public loader must not be able to leak a buyer's name or message, or the
 * delivery address, because it never reads the tables that hold them.
 */
const source = readFileSync(new URL("./public.ts", import.meta.url), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("public registry loader", () => {
  it("never queries the claims table", () => {
    expect(code).not.toMatch(/registry_claims/);
  });
  it("never queries the delivery address", () => {
    expect(code).not.toMatch(/registry_shipping/);
  });
  it("never selects a claim column", () => {
    expect(code).not.toMatch(/claim_token_hash|released_at/);
  });
  it("filters hidden and deleted items in the query, not the component", () => {
    expect(code).toMatch(/\.is\("deleted_at", null\)/);
    expect(code).toMatch(/\.eq\("hidden", false\)/);
  });
  it("returns nothing for a registry that is switched off", () => {
    expect(code).toMatch(/!settings\.enabled && !preview/);
  });
});
