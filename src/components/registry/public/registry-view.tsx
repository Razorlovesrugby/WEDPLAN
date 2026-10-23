import type { CSSProperties } from "react";
import type { PublicRegistry } from "@/server/registry/public";
import { applyFilters, parseFilters, usableTags } from "@/lib/registry/browse";
import { registryColourVars } from "@/lib/registry/look";
import { registryFonts } from "@/lib/registry/fonts";
import { GiftFunds } from "@/components/site/gift-funds";
import { FilterBar } from "./filter-bar";
import { ItemGrid } from "./item-grid";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The public registry page, as a pure function of a loaded registry and the
 * query string (spec 36 §4). Split from the route so what a visitor sees can be
 * rendered from sample data without a database.
 */
export function RegistryView({ registry, search }: { registry: PublicRegistry; search: SearchParams }) {
  const { settings } = registry;
  const filters = parseFilters(search, registry.tags.map((t) => t.id));
  const shown = applyFilters(registry.items, filters);
  const tags = usableTags(registry.tags, registry.items);
  const fonts = registryFonts(settings.type_pairing);
  const open = settings.open && !registry.preview;
  const heading = settings.title || registry.weddingName;
  const hasFunds = settings.show_funds && (registry.funds.length > 0 || registry.bank !== null);
  const filtered = filters.tags.length > 0 || filters.q !== "" || filters.min !== null || filters.max !== null;

  return (
    <div
      data-registry
      className={`${fonts.className} min-h-screen bg-paper font-body text-ink`}
      style={{ ...registryColourVars(settings.palette), ...fonts.vars } as CSSProperties}
    >
      {registry.preview ? (
        <p className="bg-ink px-4 py-2 text-center text-sm text-paper">
          Preview — this is how visitors see it. Nothing you press here is saved{!settings.enabled ? ", and the page is still switched off" : ""}.
        </p>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* ------------------------------------------------------------ hero */}
        <header className="pt-8 text-center sm:pt-12">
          {registry.heroUrl ? (
            <div
              className="mx-auto mb-8 aspect-[4/3] max-w-3xl overflow-hidden rounded-2xl sm:aspect-[16/9]"
              style={{ background: registry.heroColour ?? "rgb(var(--site-line))" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address; see its route */}
              <img
                src={registry.heroUrl}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: registry.heroPosition ?? "50% 50%" }}
                fetchPriority="high"
              />
            </div>
          ) : null}
          <p className="site-label text-muted">Our registry</p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-6xl">{heading}</h1>
          {settings.intro ? (
            <p className="mx-auto mt-5 max-w-xl whitespace-pre-line text-lg leading-relaxed text-ink/90">{settings.intro}</p>
          ) : null}
        </header>

        {/* ---------------------------------------------------------- thanks */}
        {settings.thanks_text || registry.thanksImageUrl ? (
          <section
            aria-labelledby="registry-thanks"
            className="mx-auto mt-12 grid max-w-3xl items-center gap-6 rounded-2xl border border-line bg-paper p-6 sm:p-8 md:grid-cols-[1fr_12rem]"
          >
            <div>
              <h2 id="registry-thanks" className="font-display text-2xl">Thank you</h2>
              {settings.thanks_text ? (
                <p className="mt-3 whitespace-pre-line leading-relaxed">{settings.thanks_text}</p>
              ) : null}
            </div>
            {registry.thanksImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- stable /api/photo address
              <img src={registry.thanksImageUrl} alt="" className="aspect-square w-full rounded-xl object-cover md:order-last" />
            ) : null}
          </section>
        ) : null}

        {settings.no_gifts_line ? (
          <p className="mx-auto mt-6 max-w-xl text-center italic text-muted">{settings.no_gifts_line}</p>
        ) : null}

        {!settings.open ? (
          <p role="status" className="mx-auto mt-8 max-w-xl rounded-xl border border-line px-4 py-3 text-center">
            The registry has closed &mdash; thank you for everything.
          </p>
        ) : null}

        {/* ---------------------------------------------------------- items */}
        <section aria-labelledby="registry-items" className="mt-14">
          <h2 id="registry-items" className="sr-only">Things we&rsquo;d love</h2>
          {registry.items.length > 0 ? (
            <FilterBar
              basePath={`/registry/${registry.slug}`}
              tags={tags}
              filters={filters}
              showPrices={settings.show_prices}
              preview={registry.preview}
              shown={shown.length}
              total={registry.items.length}
            />
          ) : null}

          {registry.items.length === 0 ? (
            <p className="py-16 text-center text-muted">Nothing on the list just yet &mdash; check back soon.</p>
          ) : shown.length === 0 ? (
            <p className="py-16 text-center text-muted">
              Nothing matches{filtered ? " those filters" : ""}.{" "}
              <a className="underline" href={`/registry/${registry.slug}${registry.preview ? "?preview=1" : ""}`}>Show everything</a>
            </p>
          ) : (
            <ItemGrid items={shown} slug={registry.slug} canClaim={open} preview={registry.preview} />
          )}
        </section>

        {hasFunds ? (
          <section aria-labelledby="registry-funds" className="mx-auto mt-20 max-w-2xl text-center">
            <h2 id="registry-funds" className="font-display text-2xl">Or give towards something bigger</h2>
            <div className="mt-6">
              <GiftFunds funds={registry.funds} bank={registry.bank} />
            </div>
          </section>
        ) : null}

        {settings.disclosure_on ? (
          <footer className="mx-auto mt-20 max-w-xl text-center text-xs text-muted">
            {settings.disclosure_text || "Some of these links may earn us a small commission."}
          </footer>
        ) : null}
      </main>
    </div>
  );
}
