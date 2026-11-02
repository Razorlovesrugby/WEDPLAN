import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicRegistry } from "@/server/registry/public";
import type { RegistrySettingsRow } from "@/lib/types/database";

// next/font only works inside Next's build (see src/lib/registry/fonts.ts).
vi.mock("@/lib/registry/fonts", () => ({ registryFonts: () => ({ className: "", vars: {} }) }));
// The item sheet imports server actions, which build a Supabase client at import time.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");

const baseSettings: RegistrySettingsRow = {
  wedding_id: "w", enabled: true, open: true, title: null, intro: null, hero_asset_id: null,
  thanks_text: null, thanks_asset_id: null, no_gifts_line: null, show_prices: true, show_taken: false,
  show_funds: false, contribute_position: "off", contribute_heading: null, contribute_text: null,
  contribute_button_only: false, disclosure_on: false, disclosure_text: null, palette: "linen",
  type_pairing: "classic", last_viewed_claims_at: null, created_at: "", updated_at: "",
};

const { RegistryView } = await import("./registry-view");

function registry(overrides: Partial<PublicRegistry["settings"]>, extra: Partial<PublicRegistry> = {}): PublicRegistry {
  return {
    weddingName: "Ray & Olivia",
    slug: "ray-and-olivia",
    settings: { ...baseSettings, ...overrides },
    items: [],
    tags: [],
    funds: [{ id: "f1", name: "Honeymoon", blurb: "Flights to Rarotonga", contributeUrl: null }],
    bank: { accountName: "R Smith", accountNumber: "010203040506070", message: null, note: null },
    heroUrl: null,
    heroPosition: null,
    heroColour: null,
    thanksImageUrl: null,
    preview: false,
    ...extra,
  };
}

const html = (r: PublicRegistry) => renderToStaticMarkup(createElement(RegistryView, { registry: r, search: {} }));

describe("RegistryView — Contribute block (spec 38)", () => {
  it("is absent when off, even with funds and bank details", () => {
    const out = html(registry({ contribute_position: "off" }));
    expect(out).not.toContain("registry-contribute");
    expect(out).not.toContain("Honeymoon");
  });

  it("sits before the gifts when above, after them when below", () => {
    const above = html(registry({ contribute_position: "above" }));
    expect(above.indexOf("registry-contribute")).toBeGreaterThan(-1);
    expect(above.indexOf("registry-contribute")).toBeLessThan(above.indexOf("registry-items"));
    expect(above).toContain("Prefer to contribute?");

    const below = html(registry({ contribute_position: "below" }));
    expect(below.indexOf("registry-contribute")).toBeGreaterThan(below.indexOf("registry-items"));
    expect(below).toContain("Or give towards something bigger");
  });

  it("uses the couple's own wording", () => {
    const out = html(registry({ contribute_position: "above", contribute_heading: "Help us honeymoon", contribute_text: "No gift needed." }));
    expect(out).toContain("Help us honeymoon");
    expect(out).toContain("No gift needed.");
  });

  it("button only leaves out the fund list but keeps the button", () => {
    const out = html(registry({ contribute_position: "below", contribute_button_only: true }));
    expect(out).not.toContain("Flights to Rarotonga");
    expect(out).toContain("Contribute");
  });

  it("still shows on a closed registry", () => {
    expect(html(registry({ contribute_position: "below", open: false }))).toContain("registry-contribute");
  });

  it("shows nothing when there is nothing behind it", () => {
    expect(html(registry({ contribute_position: "below" }, { funds: [], bank: null }))).not.toContain("registry-contribute");
  });
});
