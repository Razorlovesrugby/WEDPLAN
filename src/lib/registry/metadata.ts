import { isWebUrl } from "./items";

/**
 * Reading a product page for the "paste a link" autofill (spec 36 §5.3).
 *
 * A convenience, never a dependency: many shops block us or ship a page with
 * nothing worth reading, and then the owner just types the item in. So this
 * returns whatever it can find and never throws. It is regex-based on purpose —
 * it only needs `<meta>`, `<title>` and JSON-LD, and pulling in an HTML parser
 * for that is a dependency to audit for a feature that is allowed to fail.
 *
 * It parses markup that came from a stranger's website. Nothing it returns is
 * trusted: titles are length-capped plain text, and every image URL is
 * re-validated as https and fetched through the hardened fetcher
 * (`src/lib/net`) before it is stored.
 */

export type PageMetadata = {
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** Candidate hero images, best first, absolute https URLs, de-duplicated. */
  images: string[];
  /** NZD minor units; null if absent or in another currency. */
  priceMinor: number | null;
};

const MAX_IMAGES = 8;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,6});/g, (_, n: string) => {
      const code = Number(n);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => {
      const code = Number.parseInt(h, 16);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

function clean(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  const out = decodeEntities(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return out ? out.slice(0, max) : null;
}

/** Every `<meta ...>` as a lowercase-key attribute map. */
function metaTags(html: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of tag[0].matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      attrs[attr[1]!.toLowerCase()] = attr[3] ?? attr[4] ?? "";
    }
    out.push(attrs);
  }
  return out;
}

function metaValue(tags: Array<Record<string, string>>, ...keys: string[]): string | null {
  for (const key of keys) {
    const hit = tags.find((t) => (t.property ?? t.name ?? t.itemprop ?? "").toLowerCase() === key && t.content);
    if (hit?.content) return hit.content;
  }
  return null;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1]!));
    } catch {
      // Invalid JSON-LD is common; skip it.
    }
  }
  return out;
}

function* walk(node: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  yield record;
  for (const value of Object.values(record)) yield* walk(value, depth + 1);
}

function isProduct(record: Record<string, unknown>): boolean {
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && /^product$/i.test(t));
}

function toStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(toStrings);
  if (value && typeof value === "object" && "url" in value) return toStrings((value as { url: unknown }).url);
  return [];
}

/** "1,299.50" / "1299.5" / 1299.5 → 129950, or null. */
export function parsePriceToMinor(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
  // A negative amount is never a price; stripping the sign would turn -1 into 1.
  if (/(^|\s)-\s*[\d$]/.test(text)) return null;
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // "1.299,50" (comma decimal) vs "1,299.50": the last separator is the decimal one if 1-2 digits follow.
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const last = Math.max(lastDot, lastComma);
  let normal = cleaned;
  if (last >= 0 && cleaned.length - last - 1 <= 2) {
    normal = `${cleaned.slice(0, last).replace(/[.,]/g, "")}.${cleaned.slice(last + 1)}`;
  } else {
    normal = cleaned.replace(/[.,]/g, "");
  }
  const value = Number(normal);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return Math.round(value * 100);
}

function absoluteHttps(raw: string, base: string): string | null {
  try {
    const url = new URL(decodeEntities(raw.trim()), base);
    if (url.protocol !== "https:") return null;
    return isWebUrl(url.toString()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function extractMetadata(html: string, pageUrl: string): PageMetadata {
  // Only the head and the first part of the body matter; this also bounds the
  // regex work on an enormous page.
  const text = html.slice(0, 400_000);
  const tags = metaTags(text);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] ?? null;

  const images: string[] = [];
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const abs = absoluteHttps(raw, pageUrl);
    if (abs && !images.includes(abs)) images.push(abs);
  };

  const products = jsonLdBlocks(text).flatMap((block) => [...walk(block)].filter(isProduct));

  let title = clean(metaValue(tags, "og:title", "twitter:title"), 160);
  if (!title) title = clean(products.map((p) => (typeof p.name === "string" ? p.name : null)).find(Boolean), 160);
  if (!title) title = clean(titleTag, 160);

  const description = clean(
    metaValue(tags, "og:description", "twitter:description", "description") ??
      products.map((p) => (typeof p.description === "string" ? p.description : null)).find(Boolean),
    400,
  );
  const siteName = clean(metaValue(tags, "og:site_name", "application-name"), 100);

  add(metaValue(tags, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"));
  for (const product of products) for (const img of toStrings(product.image)) add(img);
  for (const link of text.matchAll(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) add(link[1]);

  // Price: only NZD, or unlabelled. A USD price shown as NZD is worse than none.
  let priceMinor: number | null = null;
  const metaCurrency = (metaValue(tags, "product:price:currency", "og:price:currency", "pricecurrency") ?? "").toUpperCase();
  const metaPrice = metaValue(tags, "product:price:amount", "og:price:amount", "price");
  if (metaPrice && (metaCurrency === "" || metaCurrency === "NZD")) priceMinor = parsePriceToMinor(metaPrice);
  if (priceMinor === null) {
    for (const product of products) {
      for (const offer of [...walk(product.offers)]) {
        const currency = typeof offer.priceCurrency === "string" ? offer.priceCurrency.toUpperCase() : "";
        if (currency !== "" && currency !== "NZD") continue;
        const price = parsePriceToMinor(offer.price ?? offer.lowPrice);
        if (price !== null) {
          priceMinor = price;
          break;
        }
      }
      if (priceMinor !== null) break;
    }
  }

  return { title, description, siteName, images: images.slice(0, MAX_IMAGES), priceMinor };
}
