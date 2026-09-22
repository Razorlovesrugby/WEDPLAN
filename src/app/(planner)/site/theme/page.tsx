import Link from "next/link";
import { ThemeEditor } from "@/components/site/editor/theme-editor";
import { requireWedding } from "@/server/queries/wedding";
import { getSiteTheme } from "@/server/queries/site";

export const metadata = { title: "How the site looks" };

/**
 * `/site/theme`.
 *
 * Theme, palette and typography live in the builder's rail now (spec 24), and
 * `/site` no longer links here. This screen stays because it is the only
 * place `heroStyle`, the monogram and an existing custom palette can still be
 * edited — the rail deliberately offers curated swatches only — and because a
 * bookmarked URL that starts 404ing is its own small betrayal.
 */

export default async function SiteThemePage() {
  const wedding = await requireWedding();
  const theme = await getSiteTheme(wedding.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">How the site looks</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One theme, one set of colours, one choice about the top of the page.{" "}
          <Link href="/site" className="underline">
            Back to the content →
          </Link>
        </p>
      </div>

      <ThemeEditor theme={theme} siteHref={`/w/${wedding.slug}`} />
    </div>
  );
}
