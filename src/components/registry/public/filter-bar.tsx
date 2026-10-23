import Link from "next/link";
import { SORTS, filtersToQuery, toggleTag, type Filters } from "@/lib/registry/browse";

/**
 * Tag chips, search, price range and sort (spec 36 §4.2).
 *
 * A server component made of plain links and one GET form, so it works with no
 * JavaScript and a filtered view is a link you can send. Tags are links built
 * from `toggleTag`; the form carries the selected tags along as hidden inputs
 * so searching doesn't drop them.
 */
export function FilterBar({
  basePath,
  tags,
  filters,
  showPrices,
  preview,
  shown,
  total,
}: {
  basePath: string;
  tags: { id: string; name: string }[];
  filters: Filters;
  showPrices: boolean;
  preview: boolean;
  shown: number;
  total: number;
}) {
  const withPreview = (query: string) => {
    if (!preview) return query;
    return query ? `${query}&preview=1` : "?preview=1";
  };
  const active = filters.tags.length > 0 || filters.q !== "" || filters.min !== null || filters.max !== null;

  return (
    <div className="mb-8 space-y-4">
      {tags.length > 0 ? (
        <nav aria-label="Filter by tag" className="flex flex-wrap justify-center gap-2">
          <Link
            href={`${basePath}${withPreview(filtersToQuery({ ...filters, tags: [] }))}`}
            aria-current={filters.tags.length === 0 ? "true" : undefined}
            className={chip(filters.tags.length === 0)}
          >
            Everything
          </Link>
          {tags.map((tag) => {
            const on = filters.tags.includes(tag.id);
            return (
              <Link
                key={tag.id}
                href={`${basePath}${withPreview(filtersToQuery(toggleTag(filters, tag.id)))}`}
                aria-pressed={on}
                className={chip(on)}
              >
                {tag.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <form method="get" action={basePath} className="flex flex-wrap items-end justify-center gap-3 text-sm">
        {filters.tags.map((id) => <input key={id} type="hidden" name="tag" value={id} />)}
        {preview ? <input type="hidden" name="preview" value="1" /> : null}
        <label className="block">
          <span className="sr-only">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search"
            maxLength={80}
            className="w-40 rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent sm:w-52"
          />
        </label>
        {showPrices ? (
          <div className="flex gap-3">
            <label className="block">
              <span className="mb-0.5 block text-xs text-muted">From $</span>
              <input type="number" name="min" min={0} max={999999} inputMode="numeric" defaultValue={filters.min !== null ? filters.min / 100 : ""} className="w-24 rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-xs text-muted">To $</span>
              <input type="number" name="max" min={0} max={999999} inputMode="numeric" defaultValue={filters.max !== null ? filters.max / 100 : ""} className="w-24 rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent" />
            </label>
          </div>
        ) : null}
        <label className="block">
          <span className="mb-0.5 block text-xs text-muted">Sort</span>
          <select name="sort" defaultValue={filters.sort} className="rounded-full border border-line bg-paper px-4 py-2 outline-none focus:border-accent focus:ring-1 focus:ring-accent">
            {SORTS.filter((s) => showPrices || (s.id !== "price_asc" && s.id !== "price_desc")).map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-full bg-accent px-5 py-2 font-medium text-paper hover:opacity-90">Apply</button>
      </form>

      {active ? (
        <p className="text-center text-sm text-muted" role="status">
          Showing {shown} of {total}.{" "}
          <Link className="underline" href={`${basePath}${preview ? "?preview=1" : ""}`}>Clear</Link>
        </p>
      ) : null}
    </div>
  );
}

function chip(on: boolean): string {
  return `rounded-full border px-4 py-1.5 text-sm transition-colors ${
    on ? "border-accent bg-accent text-paper" : "border-line text-ink/80 hover:border-accent hover:text-ink"
  }`;
}
