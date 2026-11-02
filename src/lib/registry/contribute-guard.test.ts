import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 38 §6: the registry link has no credential, so the Contribute block's
 * bank details are visible to whoever holds it — and must reach nothing else.
 * Account details live in the page HTML inside the closed dialog and are never
 * in the link preview image or the page metadata.
 */
const strip = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("registry link preview", () => {
  const og = strip("../../app/registry/[slug]/opengraph-image.tsx");
  const page = strip("../../app/registry/[slug]/page.tsx");

  it("the preview image never reads bank details or funds", () => {
    expect(og).not.toMatch(/gift_bank_details|gift_funds|bank|account_number|contribute/i);
  });
  it("the page metadata never mentions bank details", () => {
    const metadata = page.slice(page.indexOf("generateMetadata"), page.indexOf("export default"));
    expect(metadata).not.toMatch(/bank|account|funds|contribute/i);
  });
});

describe("public registry loader", () => {
  const loader = strip("../../server/registry/public.ts");
  it("reads funds and bank details only when Contribute is on", () => {
    expect(loader).toMatch(/contributeOn\s*\?\s*admin\s*\.from\("gift_funds"\)/);
    expect(loader).toMatch(/contributeOn\s*\?\s*admin\s*\.from\("gift_bank_details"\)/);
  });
  it("no longer reads the superseded show_funds", () => {
    expect(loader).not.toMatch(/show_funds/);
  });
});
