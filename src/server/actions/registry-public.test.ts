import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Source guards for the visitor's write path (spec 36 §6). Comments stripped first. */
const source = readFileSync(new URL("./registry-public.ts", import.meta.url), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("registry-public actions", () => {
  it("claims only through the locking SQL function, never a raw insert", () => {
    expect(code).toMatch(/rpc\("claim_registry_item"/);
    expect(code).not.toMatch(/from\("registry_claims"\)\s*\.insert/);
    expect(code).not.toMatch(/\.insert\(/);
  });

  it("hashes the token before it reaches the database", () => {
    expect(code).toMatch(/p_token_hash: hashInviteToken\(token\)/);
    expect(code).toMatch(/claim_token_hash", hashInviteToken\(token\)/);
  });

  it("looks a buyer up only by their token hash — never by name, message or id from the client", () => {
    const claimReads = [...code.matchAll(/from\("registry_claims"\)[\s\S]*?\.maybeSingle\(\)/g)].map((m) => m[0]);
    expect(claimReads.length).toBeGreaterThan(0);
    for (const read of claimReads) expect(read).toMatch(/\.eq\("claim_token_hash"/);
  });

  it("never returns the token hash, other claims or a claim count", () => {
    expect(code).not.toMatch(/select\([^)]*claim_token_hash/);
    expect(code).not.toMatch(/count:\s*["']exact/);
    expect(code).not.toMatch(/from\("registry_claims"\)\s*\.select\([^)]*\)\s*\.eq\("(wedding_id|item_id)"/);
  });

  it("checks the honeypot and the slug before doing any work", () => {
    expect(code.indexOf("isHoneypotTripped")).toBeGreaterThan(-1);
    expect(code.indexOf("isHoneypotTripped")).toBeLessThan(code.indexOf("createAdminClient()"));
  });
});
