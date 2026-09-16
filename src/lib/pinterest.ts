import { z } from "zod";

/**
 * Pinterest API v5, the parts of it this app touches.
 *
 * Everything here is pure: parsing, picking and URL building, with no fetch
 * in sight, so it is unit-testable against recorded payloads rather than
 * against Pinterest (docs/HANDOFF.md section 8). The network calls live in
 * src/server/pinterest/client.ts.
 *
 * READ docs/specs/09.1-pinterest-import-and-clipper.md section 4 BEFORE
 * changing anything here. Access tiers, scope names and token lifetimes are
 * Pinterest's to change and have changed before; every assumption this file
 * makes about their payloads is defensive for that reason — an unexpected
 * shape returns null and is reported, rather than throwing halfway through
 * importing 300 pins.
 */

export const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
export const PINTEREST_AUTH_URL = "https://www.pinterest.com/oauth/";
export const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";

/**
 * Read-only, and the secret variants because a moodboard-shaped Pinterest
 * board is very often a secret one. Nothing here can modify an account.
 */
export const PINTEREST_SCOPES = [
  "boards:read",
  "boards:read_secret",
  "pins:read",
  "pins:read_secret",
] as const;

/** Refresh this long before the token actually expires, so a slow import doesn't die mid-run. */
const EXPIRY_SKEW_SECONDS = 120;

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------
// Loose on purpose: unknown keys are ignored, and anything that does not match
// is reported as a skipped pin rather than failing the import.

const imageSchema = z.object({
  url: z.string().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const pinSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullish(),
  description: z.string().nullish(),
  alt_text: z.string().nullish(),
  /** The destination website the pin points at, not the pin's own page. */
  link: z.string().nullish(),
  media: z
    .object({
      media_type: z.string().nullish(),
      images: z.record(z.string(), imageSchema).nullish(),
    })
    .nullish(),
});

const boardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  privacy: z.string().nullish(),
  pin_count: z.number().int().nonnegative().nullish(),
  media: z.object({ image_cover_url: z.string().nullish() }).nullish(),
});

const pagedSchema = z.object({
  items: z.array(z.unknown()).nullish(),
  bookmark: z.string().nullish(),
});

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().nullish(),
  /** Seconds. */
  expires_in: z.number().int().positive().nullish(),
  scope: z.string().nullish(),
});

const accountSchema = z.object({
  /** v5 calls this `id` on /user_account for some shapes and omits it in others. */
  id: z.string().nullish(),
  username: z.string().nullish(),
});

export type PinterestPin = z.infer<typeof pinSchema>;
export type PinterestBoard = z.infer<typeof boardSchema>;
export type PinterestTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** One page of a list endpoint. Returns the raw items plus the cursor for the next call. */
export function parsePage(json: unknown): { items: unknown[]; bookmark: string | null } {
  const parsed = pagedSchema.safeParse(json);
  if (!parsed.success) return { items: [], bookmark: null };
  return { items: parsed.data.items ?? [], bookmark: parsed.data.bookmark || null };
}

export function parseBoards(items: readonly unknown[]): PinterestBoard[] {
  const boards: PinterestBoard[] = [];
  for (const item of items) {
    const parsed = boardSchema.safeParse(item);
    if (parsed.success) boards.push(parsed.data);
  }
  return boards;
}

export function parsePins(items: readonly unknown[]): PinterestPin[] {
  const pins: PinterestPin[] = [];
  for (const item of items) {
    const parsed = pinSchema.safeParse(item);
    if (parsed.success) pins.push(parsed.data);
  }
  return pins;
}

export function parseTokens(json: unknown, now: Date = new Date()): PinterestTokens | null {
  const parsed = tokenSchema.safeParse(json);
  if (!parsed.success) return null;
  const { access_token, refresh_token, expires_in, scope } = parsed.data;
  return {
    accessToken: access_token,
    refreshToken: refresh_token || null,
    expiresAt: expires_in ? new Date(now.getTime() + expires_in * 1000).toISOString() : null,
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : [],
  };
}

export function parseAccount(json: unknown): { id: string | null; username: string | null } {
  const parsed = accountSchema.safeParse(json);
  if (!parsed.success) return { id: null, username: null };
  return { id: parsed.data.id || null, username: parsed.data.username || null };
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------

export type PinImage = { url: string; width: number | null; height: number | null };

/**
 * The biggest image the pin actually offers.
 *
 * Keyed by size label ("150x150", "600x", "1200x", "originals"), and the
 * labels are not a reliable ordering — "600x" has no height in its name and
 * "originals" sorts nowhere useful. So this compares the declared dimensions
 * and falls back to the label's leading number when they are missing, rather
 * than trusting either alone.
 *
 * NOTE this deliberately does not rewrite CDN URL paths toward /originals/.
 * That trick belongs in the extension, where there is a fallback if the
 * guess 404s; here, the API has told us what exists.
 */
export function largestImage(pin: PinterestPin): PinImage | null {
  const images = pin.media?.images;
  if (!images) return null;

  let best: PinImage | null = null;
  let bestScore = -1;

  for (const [label, image] of Object.entries(images)) {
    const width = image.width ?? null;
    const height = image.height ?? null;
    const labelWidth = Number.parseInt(label, 10);
    const score =
      width && height ? width * height : width ? width * width : Number.isFinite(labelWidth) ? labelWidth * labelWidth : 0;

    if (score > bestScore) {
      bestScore = score;
      best = { url: image.url, width, height };
    }
  }

  return best;
}

/** `https://www.pinterest.com/pin/{id}/` — the pin's own page, always reconstructible from its id. */
export function pinPageUrl(pinId: string): string {
  return `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;
}

export type ImportableePin = {
  externalId: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  caption: string | null;
  /** Where it came from: the pin's destination site if it has one, else the pin itself. */
  sourceUrl: string;
  /** Shown under a shared board. The destination's domain is the most honest short form. */
  credit: string | null;
};

/**
 * A pin, as the fields a moodboard_items row needs. Null when the pin has no
 * usable image — a video pin, or one whose media payload is a shape this does
 * not recognise. The caller counts those and reports them; it never guesses.
 */
export function pinToItem(pin: PinterestPin): ImportableePin | null {
  const image = largestImage(pin);
  if (!image) return null;

  const caption = (pin.title || pin.description || pin.alt_text || "").trim() || null;

  let sourceUrl = pinPageUrl(pin.id);
  let credit: string | null = null;
  if (pin.link) {
    try {
      const link = new URL(pin.link);
      if (link.protocol === "https:" || link.protocol === "http:") {
        sourceUrl = link.toString();
        credit = link.hostname.replace(/^www\./, "");
      }
    } catch {
      // A link Pinterest gave us that will not parse is not worth failing over.
    }
  }

  return {
    externalId: pin.id,
    imageUrl: image.url,
    width: image.width,
    height: image.height,
    caption: caption && caption.length > 500 ? `${caption.slice(0, 497)}...` : caption,
    sourceUrl,
    credit,
  };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * Pinterest requires an HTTPS redirect URI, which makes a plain
 * http://localhost:3000 callback awkward — run the connect flow against the
 * deployed URL, or a tunnel. Spec 9.1 section 4.
 */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL(PINTEREST_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (input.scopes ?? PINTEREST_SCOPES).join(","));
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** True when the stored token should be refreshed before it is used. */
export function tokenNeedsRefresh(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false; // nothing to go on; let the call fail and surface a 401
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return expiry - now.getTime() <= EXPIRY_SKEW_SECONDS * 1000;
}
