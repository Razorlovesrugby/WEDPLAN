/**
 * Filtering and sorting the public grid (spec 36 §4.2).
 *
 * State lives in the query string so a filtered view can be shared, and so the
 * tag chips work as plain links with no JavaScript. Parsing is forgiving:
 * anything unrecognised is ignored, never an error — a mangled link should
 * show the whole registry, not a blank page.
 */

export type Sort = "wanted" | "price_asc" | "price_desc" | "newest";
export const SORTS: readonly { id: Sort; label: string }[] = [
  { id: "wanted", label: "Most wanted" },
  { id: "price_asc", label: "Price: low to high" },
  { id: "price_desc", label: "Price: high to low" },
  { id: "newest", label: "Newest" },
];

export type Filters = {
  tags: string[]; // tag ids; an item needs ANY of them (see `matches`)
  q: string;
  min: number | null; // minor units
  max: number | null;
  sort: Sort;
};

export type BrowseItem = {
  id: string;
  title: string;
  store: string | null;
  note: string | null;
  price_minor: number | null;
  starred: boolean;
  sort_order: number;
  created_at: string;
  tag_ids: string[];
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function money(value: string): number | null {
  if (!/^\d{1,6}$/.test(value)) return null;
  return Number(value) * 100;
}

export function parseFilters(params: Params, knownTagIds: readonly string[] = []): Filters {
  const rawTags = params.tag;
  const wanted = (Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : []).flatMap((t) => t.split(","));
  const known = new Set(knownTagIds);
  const tags = [...new Set(wanted.filter((t) => (known.size === 0 ? /^[0-9a-f-]{36}$/i.test(t) : known.has(t))))];
  const sort = first(params.sort);
  return {
    tags,
    q: first(params.q).trim().slice(0, 80),
    min: money(first(params.min)),
    max: money(first(params.max)),
    sort: SORTS.some((s) => s.id === sort) ? (sort as Sort) : "wanted",
  };
}

/** The query string for a set of filters, defaults omitted so shared links stay short. */
export function filtersToQuery(filters: Filters): string {
  const search = new URLSearchParams();
  for (const tag of filters.tags) search.append("tag", tag);
  if (filters.q) search.set("q", filters.q);
  if (filters.min !== null) search.set("min", String(Math.floor(filters.min / 100)));
  if (filters.max !== null) search.set("max", String(Math.floor(filters.max / 100)));
  if (filters.sort !== "wanted") search.set("sort", filters.sort);
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Toggle one tag and return the new filters (the chips are links built from this). */
export function toggleTag(filters: Filters, tagId: string): Filters {
  const has = filters.tags.includes(tagId);
  return { ...filters, tags: has ? filters.tags.filter((t) => t !== tagId) : [...filters.tags, tagId] };
}

/** ANY selected tag matches: picking Kitchen and Dining widens, as shoppers expect. */
export function matches(item: BrowseItem, filters: Filters): boolean {
  if (filters.tags.length > 0 && !filters.tags.some((t) => item.tag_ids.includes(t))) return false;
  if (filters.q) {
    const hay = `${item.title} ${item.store ?? ""} ${item.note ?? ""}`.toLowerCase();
    if (!filters.q.toLowerCase().split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  // An unpriced item is never hidden by a price filter: dropping it would make
  // the registry look emptier than it is.
  if (item.price_minor !== null) {
    if (filters.min !== null && item.price_minor < filters.min) return false;
    if (filters.max !== null && item.price_minor > filters.max) return false;
  }
  return true;
}

export function sortItems<T extends BrowseItem>(items: readonly T[], sort: Sort): T[] {
  const copy = [...items];
  const byOrder = (a: T, b: T) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
  switch (sort) {
    case "price_asc":
    case "price_desc": {
      const dir = sort === "price_asc" ? 1 : -1;
      // No price sorts last in both directions.
      return copy.sort((a, b) => {
        if (a.price_minor === null && b.price_minor === null) return byOrder(a, b);
        if (a.price_minor === null) return 1;
        if (b.price_minor === null) return -1;
        return (a.price_minor - b.price_minor) * dir || byOrder(a, b);
      });
    }
    case "newest":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    default:
      // The couple's own order, with the starred ones first.
      return copy.sort((a, b) => Number(b.starred) - Number(a.starred) || byOrder(a, b));
  }
}

export function applyFilters<T extends BrowseItem>(items: readonly T[], filters: Filters): T[] {
  return sortItems(items.filter((item) => matches(item, filters)), filters.sort);
}

/** Tags worth offering: only those on at least one visible item, in the couple's order. */
export function usableTags<T extends { id: string }>(tags: readonly T[], items: readonly BrowseItem[]): T[] {
  const used = new Set(items.flatMap((item) => item.tag_ids));
  return tags.filter((tag) => used.has(tag.id));
}
