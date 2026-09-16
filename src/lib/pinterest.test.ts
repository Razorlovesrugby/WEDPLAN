import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  largestImage,
  parseAccount,
  parseBoards,
  parsePage,
  parsePins,
  parseTokens,
  pinPageUrl,
  pinToItem,
  tokenNeedsRefresh,
  type PinterestPin,
} from "./pinterest";

/**
 * Fixtures are shaped like Pinterest v5 responses as documented, with the
 * awkward bits kept in on purpose: sizes keyed by label, "600x" with no
 * height in its name, and pins that carry no usable media at all.
 */
const pin = (overrides: Partial<PinterestPin> = {}): PinterestPin => ({
  id: "813744956860114778",
  title: "Golden hour in a walled garden",
  description: null,
  alt_text: null,
  link: "https://example-photographer.com/blog/walled-garden",
  media: {
    media_type: "image",
    images: {
      "150x150": { url: "https://i.pinimg.com/150x150/a.jpg", width: 150, height: 150 },
      "400x300": { url: "https://i.pinimg.com/400x300/a.jpg", width: 400, height: 300 },
      "1200x": { url: "https://i.pinimg.com/1200x/a.jpg", width: 1200, height: 900 },
    },
  },
  ...overrides,
});

describe("largestImage", () => {
  it("picks the largest by area, not by key order", () => {
    expect(largestImage(pin())?.url).toBe("https://i.pinimg.com/1200x/a.jpg");
  });

  it("falls back to the size label when dimensions are missing", () => {
    const result = largestImage(
      pin({
        media: {
          media_type: "image",
          images: {
            "236x": { url: "https://i.pinimg.com/236x/a.jpg" },
            "736x": { url: "https://i.pinimg.com/736x/a.jpg" },
          },
        },
      }),
    );
    expect(result?.url).toBe("https://i.pinimg.com/736x/a.jpg");
  });

  it("returns null for a pin with no images", () => {
    expect(largestImage(pin({ media: { media_type: "video", images: null } }))).toBeNull();
    expect(largestImage(pin({ media: null }))).toBeNull();
  });
});

describe("pinToItem", () => {
  it("maps a pin to the fields an item needs", () => {
    expect(pinToItem(pin())).toEqual({
      externalId: "813744956860114778",
      imageUrl: "https://i.pinimg.com/1200x/a.jpg",
      width: 1200,
      height: 900,
      caption: "Golden hour in a walled garden",
      sourceUrl: "https://example-photographer.com/blog/walled-garden",
      credit: "example-photographer.com",
    });
  });

  it("falls back to the pin's own page when it links nowhere", () => {
    const result = pinToItem(pin({ link: null }));
    expect(result?.sourceUrl).toBe(pinPageUrl("813744956860114778"));
    expect(result?.credit).toBeNull();
  });

  it("survives a link that will not parse", () => {
    const result = pinToItem(pin({ link: "not a url" }));
    expect(result?.sourceUrl).toBe(pinPageUrl("813744956860114778"));
  });

  it("refuses a javascript: link rather than storing it as a source", () => {
    const result = pinToItem(pin({ link: "javascript:alert(1)" }));
    expect(result?.sourceUrl).toBe(pinPageUrl("813744956860114778"));
  });

  it("takes the description when there is no title", () => {
    expect(pinToItem(pin({ title: null, description: "Long grass, low sun" }))?.caption).toBe(
      "Long grass, low sun",
    );
  });

  it("truncates an essay of a description", () => {
    const caption = pinToItem(pin({ title: "x".repeat(900) }))?.caption ?? "";
    expect(caption.length).toBe(500);
    expect(caption.endsWith("...")).toBe(true);
  });

  it("returns null for a pin with no usable image, rather than guessing", () => {
    expect(pinToItem(pin({ media: null }))).toBeNull();
  });
});

describe("parsing", () => {
  it("reads a page and its cursor", () => {
    expect(parsePage({ items: [1, 2], bookmark: "abc" })).toEqual({ items: [1, 2], bookmark: "abc" });
    expect(parsePage({ items: [], bookmark: null })).toEqual({ items: [], bookmark: null });
    // The last page omits the bookmark entirely.
    expect(parsePage({ items: [1] }).bookmark).toBeNull();
  });

  it("returns an empty page rather than throwing on a shape it does not know", () => {
    expect(parsePage("nope")).toEqual({ items: [], bookmark: null });
    expect(parsePage(null)).toEqual({ items: [], bookmark: null });
  });

  it("skips malformed entries instead of failing the whole page", () => {
    const boards = parseBoards([
      { id: "1", name: "Photography" },
      { id: "", name: "Broken" },
      { name: "No id" },
      { id: "2", name: "Flowers", pin_count: 40 },
    ]);
    expect(boards.map((b) => b.id)).toEqual(["1", "2"]);

    const pins = parsePins([pin(), { nonsense: true }, pin({ id: "2" })]);
    expect(pins.map((p) => p.id)).toEqual(["813744956860114778", "2"]);
  });

  it("reads a token response and computes an absolute expiry", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(
      parseTokens(
        { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "boards:read pins:read" },
        now,
      ),
    ).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: "2026-06-01T13:00:00.000Z",
      scopes: ["boards:read", "pins:read"],
    });
  });

  it("returns null for a token response it cannot use", () => {
    expect(parseTokens({ error: "invalid_grant" })).toBeNull();
    expect(parseTokens(null)).toBeNull();
  });

  it("reads an account, and shrugs at one it cannot", () => {
    expect(parseAccount({ id: "42", username: "someone" })).toEqual({ id: "42", username: "someone" });
    expect(parseAccount({})).toEqual({ id: null, username: null });
    expect(parseAccount("nope")).toEqual({ id: null, username: null });
  });
});

describe("oauth", () => {
  it("builds an authorize URL with read-only scopes", () => {
    const url = new URL(
      authorizeUrl({ clientId: "123", redirectUri: "https://app.example/cb", state: "s" }),
    );
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/cb");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("s");
    // Nothing that could modify the account.
    expect(url.searchParams.get("scope")).not.toMatch(/write/);
  });

  it("refreshes ahead of the expiry rather than on it", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(tokenNeedsRefresh("2026-06-01T13:00:00Z", now)).toBe(false);
    expect(tokenNeedsRefresh("2026-06-01T12:01:00Z", now)).toBe(true); // inside the skew
    expect(tokenNeedsRefresh("2026-06-01T11:00:00Z", now)).toBe(true); // already gone
  });

  it("treats an unreadable expiry as needing a refresh, and no expiry as fine", () => {
    expect(tokenNeedsRefresh("whenever")).toBe(true);
    expect(tokenNeedsRefresh(null)).toBe(false);
  });
});
