/**
 * Reading a block's payload (spec 14 §3, kept through spec 23's rebuild).
 *
 * `site_content` held twelve fixed sections; `site_blocks` holds a list of
 * blocks. What did not change is the shape of a payload — loose JSONB, read
 * defensively — so these readers survived the rewrite untouched and are what
 * every block renderer uses.
 *
 * The rule they encode: **the renderer tolerates rubbish.** A payload written
 * months ago by a version of this app that no longer exists must cost its own
 * block at worst, never the page. The strictness lives in
 * `src/server/actions/site-blocks.ts`, on the way in.
 */

/** The theme is configuration rather than a block, and still lives in `site_content`. */
export const THEME_BLOCK_KEY = "theme";

/** One entry of the jump nav. Built from blocks now — see `blocks.ts`. */
export type NavItem = { href: string; label: string };

// ---------------------------------------------------------------------------
// Payload readers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A trimmed string, or null. Whitespace-only is nothing, not content. */
export function text(payload: unknown, key: string): string | null {
  if (!isRecord(payload)) return null;
  const value = payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function flag(payload: unknown, key: string, fallback = false): boolean {
  if (!isRecord(payload)) return fallback;
  const value = payload[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Rows out of a payload's array field, each one an object. */
export function rows(payload: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

export type FaqItem = { q: string; a: string; featured: boolean; tags: string[] };

/**
 * FAQ items. An item with no question is dropped — an answer with nothing to
 * answer renders as a floating paragraph and reads like a mistake.
 */
export function faqItems(payload: unknown): FaqItem[] {
  return rows(payload, "items").flatMap((row) => {
    const q = text(row, "q");
    if (!q) return [];
    return [
      {
        q,
        a: text(row, "a") ?? "",
        featured: flag(row, "featured"),
        tags: (Array.isArray(row["tags"]) ? row["tags"] : []).filter(
          (tag): tag is string => typeof tag === "string" && tag.trim() !== "",
        ),
      },
    ];
  });
}

/**
 * Aisle's rule, copied: a handful open, the rest collapsed. Six is their
 * number and it is a good one — enough to answer the common questions without
 * a wall of text, few enough that the page still scrolls.
 *
 * Under the threshold nothing is collapsed at all: collapsing three questions
 * is pure friction.
 */
export const FAQ_FEATURED_LIMIT = 6;

export function splitFaq(items: FaqItem[]): { featured: FaqItem[]; rest: FaqItem[] } {
  if (items.length <= FAQ_FEATURED_LIMIT) return { featured: items, rest: [] };

  const explicit = items.filter((item) => item.featured);
  // Nobody has chosen: take the first six in the order they were written.
  const featured =
    explicit.length > 0 ? explicit.slice(0, FAQ_FEATURED_LIMIT) : items.slice(0, FAQ_FEATURED_LIMIT);
  const featuredSet = new Set(featured);
  return { featured, rest: items.filter((item) => !featuredSet.has(item)) };
}

/** Group the collapsed remainder by tag, preserving first-seen tag order. */
export function groupByTag(items: FaqItem[]): Array<{ tag: string | null; items: FaqItem[] }> {
  const groups = new Map<string | null, FaqItem[]>();
  for (const item of items) {
    const tag = item.tags[0] ?? null;
    const existing = groups.get(tag);
    if (existing) existing.push(item);
    else groups.set(tag, [item]);
  }
  return [...groups.entries()].map(([tag, grouped]) => ({ tag, items: grouped }));
}

// ---------------------------------------------------------------------------
// Emptiness, and the nav that follows from it
// ---------------------------------------------------------------------------

/**
 * What each section needs before it is worth rendering.
 *
 * `counts` carries the things that live in their own tables rather than in the
 * payload — events, published moodboards, gallery images — because "the
 * schedule has an intro but no events" is an empty schedule, and rendering the
 * heading over nothing is the failure this whole function exists to prevent.
 */
