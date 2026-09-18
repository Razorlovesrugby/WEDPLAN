import Link from "next/link";
import { ThemeEditor } from "@/components/site/editor/theme-editor";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { resolveTheme } from "@/lib/theme/presets";

export const metadata = { title: "How the site looks" };

export default async function SiteThemePage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", wedding.id)
    .eq("block_key", "theme")
    .maybeSingle();

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

      <ThemeEditor theme={resolveTheme(data?.payload ?? null)} siteHref={`/w/${wedding.slug}`} />
    </div>
  );
}
