import { describe, expect, it } from "vitest";
import { applyFilters, filtersToQuery, matches, parseFilters, sortItems, toggleTag, usableTags, type BrowseItem } from "./browse";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

function item(over: Partial<BrowseItem> & { id: string }): BrowseItem {
  return {
    title: over.id, store: null, note: null, price_minor: null, starred: false,
    sort_order: 0, created_at: "2026-01-01T00:00:00Z", tag_ids: [], ...over,
  };
}

describe("parseFilters", () => {
  it("reads tags, search, price range and sort", () => {
    const f = parseFilters({ tag: [T1, T2], q: " mixer ", min: "50", max: "200", sort: "price_asc" }, [T1, T2]);
    expect(f).toEqual({ tags: [T1, T2], q: "mixer", min: 5000, max: 20000, sort: "price_asc" });
  });
  it("accepts comma-joined tags and drops unknown ones", () => {
    expect(parseFilters({ tag: `${T1},nope` }, [T1]).tags).toEqual([T1]);
  });
  it("ignores garbage instead of erroring", () => {
    const f = parseFilters({ min: "abc", max: "-1", sort: "sideways", q: "x".repeat(500) });
    expect(f.min).toBeNull();
    expect(f.max).toBeNull();
    expect(f.sort).toBe("wanted");
    expect(f.q).toHaveLength(80);
  });
});

describe("filtersToQuery", () => {
  it("omits defaults so shared links stay short, and round-trips", () => {
    expect(filtersToQuery(parseFilters({}))).toBe("");
    const f = parseFilters({ tag: T1, min: "50", sort: "newest" }, [T1]);
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f))), [T1])).toEqual(f);
  });
  it("toggles a tag on and off", () => {
    const on = toggleTag(parseFilters({}), T1);
    expect(on.tags).toEqual([T1]);
    expect(toggleTag(on, T1).tags).toEqual([]);
  });
});

describe("matching", () => {
  const a = item({ id: "a", title: "Stand mixer", tag_ids: [T1], price_minor: 40000 });
  const b = item({ id: "b", title: "Wine glasses", store: "Briscoes", tag_ids: [T2], price_minor: 9000 });
  const c = item({ id: "c", title: "Surprise", price_minor: null });

  it("any selected tag matches, so two tags widen", () => {
    expect(matches(a, parseFilters({ tag: [T1, T2] }, [T1, T2]))).toBe(true);
    expect(matches(b, parseFilters({ tag: T1 }, [T1, T2]))).toBe(false);
  });
  it("searches title, store and note, every word", () => {
    expect(matches(b, parseFilters({ q: "wine briscoes" }))).toBe(true);
    expect(matches(b, parseFilters({ q: "wine mixer" }))).toBe(false);
  });
  it("applies the price range but never hides an unpriced item", () => {
    const f = parseFilters({ min: "100", max: "500" });
    expect(matches(a, f)).toBe(true);
    expect(matches(b, f)).toBe(false);
    expect(matches(c, f)).toBe(true);
  });
});

describe("sorting", () => {
  const items = [
    item({ id: "plain", sort_order: 1, price_minor: 300 }),
    item({ id: "star", sort_order: 5, starred: true, price_minor: 900 }),
    item({ id: "free", sort_order: 0, price_minor: null }),
    item({ id: "cheap", sort_order: 2, price_minor: 100, created_at: "2026-03-01T00:00:00Z" }),
  ];
  const ids = (sorted: BrowseItem[]) => sorted.map((i) => i.id);

  it("most wanted: starred first, then the couple's own order", () => {
    expect(ids(sortItems(items, "wanted"))).toEqual(["star", "free", "plain", "cheap"]);
  });
  it("price sorts put unpriced items last in both directions", () => {
    expect(ids(sortItems(items, "price_asc"))).toEqual(["cheap", "plain", "star", "free"]);
    expect(ids(sortItems(items, "price_desc"))).toEqual(["star", "plain", "cheap", "free"]);
  });
  it("newest first", () => {
    expect(ids(sortItems(items, "newest"))[0]).toBe("cheap");
  });
  it("does not mutate its input", () => {
    const before = ids(items);
    applyFilters(items, parseFilters({ sort: "price_asc" }));
    expect(ids(items)).toEqual(before);
  });
});

describe("usableTags", () => {
  it("offers only tags on a visible item", () => {
    const tags = [{ id: T1 }, { id: T2 }];
    expect(usableTags(tags, [item({ id: "a", tag_ids: [T2] })])).toEqual([{ id: T2 }]);
  });
});
