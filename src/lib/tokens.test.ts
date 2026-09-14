import { beforeAll, describe, expect, it } from "vitest";

// The module reads the pepper at call time, so the environment has to exist
// before anything is imported that touches serverEnv().
beforeAll(() => {
  process.env["INVITE_TOKEN_PEPPER"] = "0".repeat(64);
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role";
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://example.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon";
  process.env["NEXT_PUBLIC_SITE_URL"] = "https://wedding.example";
});

describe("invitation tokens", () => {
  it("generates URL-safe tokens with real entropy", async () => {
    const { generateInviteToken, looksLikeToken } = await import("./tokens");
    const tokens = new Set(Array.from({ length: 500 }, () => generateInviteToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(looksLikeToken(token)).toBe(true);
      // base64url only: safe to paste into WhatsApp, safe in a URL segment.
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hashes deterministically, so lookup by token still works", async () => {
    const { generateInviteToken, hashInviteToken } = await import("./tokens");
    const token = generateInviteToken();
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(hashInviteToken(generateInviteToken()));
    // The stored form must not contain the token itself.
    expect(hashInviteToken(token)).not.toContain(token);
  });

  it("recovers an encrypted token, so a link can be reissued months later", async () => {
    const { encryptToken, decryptToken, generateInviteToken } = await import("./tokens");
    const token = generateInviteToken();
    const stored = encryptToken(token);
    expect(stored).not.toContain(token);
    expect(decryptToken(stored)).toBe(token);
  });

  it("uses a fresh IV each time, so identical tokens do not store identically", async () => {
    const { encryptToken } = await import("./tokens");
    expect(encryptToken("same-token")).not.toBe(encryptToken("same-token"));
  });

  it("returns null for a payload it cannot authenticate", async () => {
    const { decryptToken, encryptToken } = await import("./tokens");
    expect(decryptToken("not-a-payload")).toBeNull();
    expect(decryptToken("a.b.c")).toBeNull();

    // A tampered ciphertext must fail the GCM tag rather than decrypt to junk.
    const stored = encryptToken("original");
    const [iv, ciphertext, tag] = stored.split(".") as [string, string, string];
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(decryptToken(`${iv}.${flipped.toString("base64url")}.${tag}`)).toBeNull();
  });

  it("rejects things that are not shaped like tokens", async () => {
    const { looksLikeToken } = await import("./tokens");
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("../../etc/passwd")).toBe(false);
    expect(looksLikeToken("a".repeat(200))).toBe(false);
    expect(looksLikeToken(null)).toBe(false);
    expect(looksLikeToken(42)).toBe(false);
  });
});
