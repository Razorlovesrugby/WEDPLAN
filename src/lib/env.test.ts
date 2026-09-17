import { beforeAll, describe, expect, it } from "vitest";

// env.ts validates the whole client environment at import, so it has to exist
// before the module is pulled in. Same pattern as tokens.test.ts.
beforeAll(() => {
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://example.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon";
  process.env["NEXT_PUBLIC_SITE_URL"] = "https://wedding.example";
});

/**
 * These guard a real deployment failure: NEXT_PUBLIC_SITE_URL was set on
 * Vercel to a bare hostname, exactly as the dashboard displays a domain, and
 * the build died with "Invalid url" and nothing else to go on.
 */
describe("normaliseOrigin", () => {
  it("completes a bare hostname, which is how every dashboard shows a domain", async () => {
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("wedplan.vercel.app")).toBe("https://wedplan.vercel.app");
    expect(normaliseOrigin("ourwedding.co.uk")).toBe("https://ourwedding.co.uk");
  });

  it("leaves an absolute URL alone", async () => {
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("https://wedplan.vercel.app")).toBe("https://wedplan.vercel.app");
    expect(normaliseOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes and surrounding whitespace", async () => {
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("  wedplan.vercel.app/  ")).toBe("https://wedplan.vercel.app");
    expect(normaliseOrigin("https://wedplan.vercel.app///")).toBe("https://wedplan.vercel.app");
  });

  it("uses http for localhost, because nobody serves a dev box over TLS", async () => {
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("localhost:3000")).toBe("http://localhost:3000");
    expect(normaliseOrigin("127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("returns undefined for blank, so the caller falls through to the next source", async () => {
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("")).toBeUndefined();
    expect(normaliseOrigin("   ")).toBeUndefined();
    expect(normaliseOrigin(undefined)).toBeUndefined();
  });

  it("does not patch genuine rubbish into something that parses", async () => {
    // The completion is only for a value already shaped like a host. Anything
    // else is handed back untouched so the schema reports it.
    const { normaliseOrigin } = await import("./env");
    expect(normaliseOrigin("http://")).toBe("http:");
    expect(normaliseOrigin("our wedding site")).toBe("our wedding site");
    expect(normaliseOrigin("https://")).toBe("https:");
  });
});

/**
 * A regression, not a nicety.
 *
 * /settings renders a "Pinterest" card, which asks whether Pinterest is
 * configured. The first version asked through serverEnv(), which validates
 * EVERY server secret at once — so a deployment with no INVITE_TOKEN_PEPPER
 * (a value that page neither uses nor mentions) threw, and /settings became
 * the only planner screen that would not open. The cut-line editor and the
 * list-appearance editor went with it.
 */
describe("pinterestEnv", () => {
  it("answers without validating any other secret", async () => {
    const { pinterestEnv } = await import("./env");

    delete process.env["INVITE_TOKEN_PEPPER"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    delete process.env["PINTEREST_APP_ID"];
    delete process.env["PINTEREST_APP_SECRET"];

    // The point: this does not throw.
    expect(pinterestEnv()).toEqual({ appId: null, appSecret: null });
  });

  it("reads the pair when they are set, and treats blank as unset", async () => {
    const { pinterestEnv } = await import("./env");

    process.env["PINTEREST_APP_ID"] = "  12345  ";
    process.env["PINTEREST_APP_SECRET"] = "   ";
    expect(pinterestEnv()).toEqual({ appId: "12345", appSecret: null });

    process.env["PINTEREST_APP_SECRET"] = "shh";
    expect(pinterestEnv()).toEqual({ appId: "12345", appSecret: "shh" });

    delete process.env["PINTEREST_APP_ID"];
    delete process.env["PINTEREST_APP_SECRET"];
  });
});
