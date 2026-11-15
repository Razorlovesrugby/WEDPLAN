import { describe, expect, it } from "vitest";
import { UPLOAD_CACHE_CONTROL, mayReuseSigned, reuseSeconds } from "./storage-cache";

describe("reuseSeconds", () => {
  it("is half the signed URL's life", () => {
    expect(reuseSeconds(3600)).toBe(1800);
    expect(reuseSeconds(86400)).toBe(43200);
  });

  it("never drops to zero", () => {
    expect(reuseSeconds(1)).toBe(1);
  });
});

describe("mayReuseSigned", () => {
  const ttl = 3600;
  const signedAt = 1_000_000;

  it("reuses a URL in the first half of its life", () => {
    expect(mayReuseSigned(signedAt, signedAt, ttl)).toBe(true);
    expect(mayReuseSigned(signedAt, signedAt + 1_799_999, ttl)).toBe(true);
  });

  it("re-signs once half its life is gone, so a stale cache entry is never served", () => {
    expect(mayReuseSigned(signedAt, signedAt + 1_800_000, ttl)).toBe(false);
    expect(mayReuseSigned(signedAt, signedAt + 5 * 3_600_000, ttl)).toBe(false);
  });

  it("re-signs when the clock says the entry is from the future", () => {
    expect(mayReuseSigned(signedAt, signedAt - 1, ttl)).toBe(false);
  });
});

describe("UPLOAD_CACHE_CONTROL", () => {
  it("asks for a year, in the form Storage stores", () => {
    expect(UPLOAD_CACHE_CONTROL).toBe("max-age=31536000");
  });
});
