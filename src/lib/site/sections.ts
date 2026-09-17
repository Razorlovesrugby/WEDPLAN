/**
 * The public site's sections (spec 14 §3).
 *
 * `site_content` already stores key → JSONB → sort_order → visible, so this is
 * not a new storage idea: it is the list of keys that mean something, how to
 * read each payload safely, and the one rule that matters —
 *
 *   **a section with no content does not render, and does not appear in the
 *   nav.** An empty "Photos" heading is worse than no photos section.
 *
 * Everything here is pure so it can be tested without a database. The payloads
 * are JSONB written by an editor that will change shape, so every reader
 * tolerates garbage and falls back rather than throwing: a malformed FAQ
 * costs its own section, never the page.
 */

export const SECTION_KEYS = [
  "hero",
  "countdown",
  "story",
  "schedule",
  "travel",
  "stays",
  "gallery",
  "faq",
  "party",
  "things_to_do",
  "rsvp",
  "footer",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** `theme` is configuration, never a section. Kept out of the union on purpose. */
export const THEME_BLOCK_KEY = "theme";

export type SectionDef = {
  key: SectionKey;
  /** The heading and the nav label. First person plural, per Q11. */
  label: string;
  /** Sections that never appear in the nav: they are not destinations. */
  inNav: boolean;
  defaultOrder: number;
};

export const SECTIONS: Record<SectionKey, SectionDef> = {
  hero: { key: "hero", label: "Home", inNav: false, defaultOrder: 0 },
  countdown: { key: "countdown", label: "Not long now", inNav: false, defaultOrder: 10 },
  story: { key: "story", label: "Our story", inNav: true, defaultOrder: 20 },
  schedule: { key: "schedule", label: "The weekend", inNav: true, defaultOrder: 30 },
  travel: { key: "travel", label: "Getting there", inNav: true, defaultOrder: 40 },
  stays: { key: "stays", label: "Where to stay", inNav: true, defaultOrder: 50 },
  gallery: { key: "gallery", label: "Photos", inNav: true, defaultOrder: 60 },
  party: { key: "party", label: "Who's who", inNav: true, defaultOrder: 70 },
  things_to_do: { key: "things_to_do", label: "While you're here", inNav: true, defaultOrder: 80 },
  faq: { key: "faq", label: "Questions", inNav: true, defaultOrder: 90 },
  rsvp: { key: "rsvp", label: "RSVP", inNav: true, defaultOrder: 100 },
  footer: { key: "footer", label: "Footer", inNav: false, defaultOrder: 110 },
};

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

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
export type SectionCounts = {
  events: number;
  boards: number;
  galleryImages: number;
};

export const NO_COUNTS: SectionCounts = { events: 0, boards: 0, galleryImages: 0 };

export function hasContent(
  key: SectionKey,
  payload: unknown,
  counts: SectionCounts = NO_COUNTS,
): boolean {
  switch (key) {
    // The hero always renders: it carries the names, and a site whose top is
    // missing is not a site. It falls back to the wedding's own name.
    case "hero":
      return true;
    case "countdown":
      return flag(payload, "enabled");
    case "story":
      return text(payload, "body") !== null || rows(payload, "milestones").length > 0;
    case "schedule":
      return counts.events > 0;
    case "travel":
      return text(payload, "intro") !== null || text(payload, "body") !== null;
    case "stays":
      return text(payload, "intro") !== null;
    case "gallery":
      return counts.galleryImages > 0 || counts.boards > 0;
    case "faq":
      return faqItems(payload).length > 0;
    case "party":
      return rows(payload, "members").length > 0;
    case "things_to_do":
      return rows(payload, "items").length > 0;
    // The RSVP pointer is the reason most guests open the site at all, so it
    // renders on its default copy rather than needing to be filled in.
    case "rsvp":
      return true;
    case "footer":
      return (
        text(payload, "note") !== null ||
        text(payload, "contact_email") !== null ||
        text(payload, "hashtag") !== null
      );
  }
}

export type ResolvedSection = {
  key: SectionKey;
  def: SectionDef;
  payload: unknown;
  order: number;
};

export type SiteContentRow = {
  block_key: string;
  payload: unknown;
  sort_order: number;
  visible?: boolean;
};

/**
 * The sections this site actually renders, in order.
 *
 * Rows the database has marked invisible are already filtered by the query,
 * but `visible === false` is honoured here too so the same function can be
 * used by the editor's preview, which reads everything.
 */
export function resolveSections(
  blockRows: SiteContentRow[],
  counts: SectionCounts = NO_COUNTS,
): ResolvedSection[] {
  const byKey = new Map<SectionKey, SiteContentRow>();
  for (const row of blockRows) {
    if (row.visible === false) continue;
    if (!isSectionKey(row.block_key)) continue;
    byKey.set(row.block_key, row);
  }

  return SECTION_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      def: SECTIONS[key],
      payload: row?.payload ?? null,
      // A row's own sort_order wins; anything unsaved falls back to the
      // designed order, so a half-configured site still reads top to bottom.
      order: row ? row.sort_order : SECTIONS[key].defaultOrder,
    };
  })
    .filter((section) => {
      const row = byKey.get(section.key);
      // A section nobody has saved a row for still renders when it needs no
      // content of its own (hero, rsvp) — otherwise it needs a row.
      if (!row) return hasContent(section.key, null, counts);
      return hasContent(section.key, section.payload, counts);
    })
    .sort((a, b) => a.order - b.order || a.def.defaultOrder - b.def.defaultOrder);
}

export type NavItem = { href: string; label: string };

/** The jump links, derived from what actually rendered. */
export function navItems(sections: ResolvedSection[]): NavItem[] {
  return sections
    .filter((section) => section.def.inNav)
    .map((section) => ({ href: `#${section.key}`, label: SECTIONS[section.key].label }));
}
