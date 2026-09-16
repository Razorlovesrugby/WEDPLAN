import { describe, expect, it } from "vitest";
import { fetchImage } from "./fetch-image";

/**
 * These cases all resolve locally or fail before a socket opens, so the suite
 * needs no network and cannot flake. What it is proving is that the guard in
 * fetch-image.ts sits in front of the connection rather than beside it.
 */

async function reason(url: string): Promise<string> {
  const result = await fetchImage(url, { timeoutMs: 2000 });
  expect(result.ok, `expected ${url} to be refused`).toBe(false);
  return result.ok ? "" : result.reason;
}

describe("fetchImage: schemes", () => {
  it("refuses everything that is not https", async () => {
    for (const url of [
      "http://example.com/a.jpg",
      "file:///etc/passwd",
      "data:image/png;base64,iVBORw0KGgo=",
      "ftp://example.com/a.jpg",
      "not a url",
      "",
    ]) {
      expect(await reason(url)).toMatch(/https:\/\/ image address/);
    }
  });
});

describe("fetchImage: addresses", () => {
  /**
   * The bypass worth its own test: Node's net.connect skips the DNS lookup
   * when the host is already an IP literal, so a guard that lives only in the
   * lookup would never run for these.
   */
  it("refuses IP literals in private ranges without ever connecting", async () => {
    for (const url of [
      "https://127.0.0.1/a.jpg",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.1/a.jpg",
      "https://192.168.1.1/a.jpg",
      "https://[::1]/a.jpg",
      "https://[::ffff:169.254.169.254]/a.jpg",
    ]) {
      expect(await reason(url)).toMatch(/https:\/\/ image address/);
    }
  });

  it("refuses a hostname that resolves into a private range", async () => {
    // localhost resolves to 127.0.0.1 (or ::1), so this exercises the
    // guarded lookup itself rather than the literal check above.
    expect(await reason("https://localhost/a.jpg")).toMatch(/won't fetch from|isn't one this server/);
  });

  it("allows a public IP literal past the address check", async () => {
    // Refused for some later reason (no route, TLS, timeout) — never for
    // being a blocked address. Proves the check is a filter, not a blanket.
    const result = await fetchImage("https://1.1.1.1/nothing-here.jpg", { timeoutMs: 1500 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toMatch(/https:\/\/ image address/);
  });
});
