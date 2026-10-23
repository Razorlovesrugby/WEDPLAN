import { z } from "zod";
import { formatMoneyShort } from "@/lib/format";

/**
 * Pure helpers for registry items (spec 36 §5.3). Nothing here touches the
 * database; the actions and the page call these.
 */

export const MAX_SPECS = 8;
export const MAX_TAGS_PER_ITEM = 8;

/** Web links only. Ends up in an href in front of every visitor (0039 checks it too). */
export function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** "www.amazon.co.nz" → "amazon.co.nz". Null for anything that isn't a URL. */
export function storeFromUrl(value: string): string | null {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export const specSchema = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(80),
});
export type Spec = z.infer<typeof specSchema>;

/**
 * Specs as typed: blank rows are dropped (a half-filled row is a row the owner
 * is still typing), the rest trimmed, the list capped. Never throws — a bad
 * row is skipped, because a form refusing to save over a stray empty line is
 * worse than a missing spec.
 */
export function cleanSpecs(raw: unknown): Spec[] {
  if (!Array.isArray(raw)) return [];
  const out: Spec[] = [];
  for (const row of raw) {
    const parsed = specSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    if (out.length === MAX_SPECS) break;
  }
  return out;
}

/** "Sage · Queen" — the chip line on a card. Values only, in order. */
export function specSummary(specs: readonly Spec[], max = 3): string {
  return specs.slice(0, max).map((spec) => spec.value).join(" · ");
}

/** A typed price in dollars → integer cents. Null for blank; NaN-safe; never a float in the database. */
export function dollarsToMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).replace(/[$,\s]/g, "");
  if (text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, cents = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 100_000_00 ? minor : null;
}

/** Minor units → what goes in a price field ("120" or "119.50"). */
export function minorToDollars(minor: number | null | undefined): string {
  if (!minor) return "";
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** "$120" — whole dollars lose their ".00" on a card. */
export function formatPrice(minor: number | null | undefined): string | null {
  if (!minor) return null;
  return formatMoneyShort(minor);
}

/** What a card says about how many are wanted. Nothing for a single item. */
export function wantedLabel(remaining: number, quantity: number): string | null {
  if (quantity <= 1 || remaining <= 0) return null;
  return remaining === quantity ? `${remaining} wanted` : `${remaining} still wanted`;
}

export const itemSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Give it a name").max(160),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine(isWebUrl, { message: "Needs to be a web address starting with http:// or https://" }),
  price: z.union([z.string(), z.number(), z.null()]).optional(),
  note: z.string().trim().max(400).optional().transform((v) => (v ? v : null)),
  quantity: z.coerce.number().int().min(1, "At least 1").max(99).default(1),
  specs: z.unknown().optional(),
  ship_note: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
  starred: z.boolean().default(false),
  hidden: z.boolean().default(false),
  image_asset_id: z.string().uuid().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).max(MAX_TAGS_PER_ITEM).default([]),
});
