import { describe, expect, it } from "vitest";
import { BLOCK_SCHEMAS } from "./block-schemas";

const schema = BLOCK_SCHEMAS.gift_funds;

describe("the gift block's registry address", () => {
  it("keeps an https address, trimmed", () => {
    const parsed = schema.parse({ registry_url: "  https://gifts.example/ray-olivia " });
    expect(parsed.registry_url).toBe("https://gifts.example/ray-olivia");
  });

  it("treats an empty address as none", () => {
    expect(schema.parse({ registry_url: "" }).registry_url).toBeUndefined();
  });

  it("refuses anything that is not http(s), because it ends up in an href", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "gifts.example", "//gifts.example"]) {
      expect(schema.safeParse({ registry_url: bad }).success, bad).toBe(false);
    }
  });

  it("keeps the on/off tick", () => {
    expect(schema.parse({ show_registry: false }).show_registry).toBe(false);
  });
});
