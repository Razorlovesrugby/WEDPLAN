import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { body, script } from "@/lib/fonts";
import { findWeddingBySlug } from "@/server/queries/site";
import { loadPublishedBlocks } from "@/server/queries/site-blocks";
import { buildRenderContext } from "@/server/queries/site-render";
import { blockNavItems, visibleBlocks } from "@/lib/site/blocks";
import { themeCssVars } from "@/lib/theme/presets";
import { SiteNav } from "@/components/site/site-nav";
import { Monogram } from "@/components/site/monogram";
import { SiteBlocks } from "@/components/site/blocks/render";

/**
 * The public site (spec 14, rebuilt onto blocks by spec 23).
 *
 * Two things changed here and both matter. It renders **the newest published
 * revision**, never the draft — a half-finished edit cannot reach the internet
 * by construction rather than by anyone remembering a flag. And it renders
 * through the same `SiteBlocks` component a household's own page and the
 * editor's preview use, so there is one layout rather than three that drift.
 *
 * `noindex` stays on. A wedding site turning up in search results for the
 * couple's names is a decision, not an accident (spec 14 §11, Q8).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wedding = await findWeddingBySlug(slug);
  return {
    title: wedding?.name ?? "Wedding",
    robots: { index: false, follow: false },
  };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const wedding = await findWeddingBySlug(slug);
  if (!wedding) notFound();

  const [blocks, ctx] = await Promise.all([
    loadPublishedBlocks(wedding.id),
    buildRenderContext(wedding, null),
  ]);

  const shown = visibleBlocks(blocks, false);
  const nav = blockNavItems(shown);

  return (
    // The theme's five tokens are set here as CSS custom properties, so every
    // `text-muted` / `border-line` / `bg-paper` below this element — shared
    // components like the moodboard grid included — resolves to this wedding's
    // palette rather than the planner's.
    <div
      style={themeCssVars(ctx.theme)}
      className={`site-print ${script.variable} ${body.variable} min-h-screen bg-paper font-body text-ink antialiased`}
    >
      {nav.length > 0 ? (
        <SiteNav
          items={nav}
          rsvpLabel="RSVP"
          monogram={<Monogram name={ctx.theme.monogram ? wedding.name : null} />}
        />
      ) : null}

      <SiteBlocks blocks={shown} ctx={ctx} />
    </div>
  );
}
