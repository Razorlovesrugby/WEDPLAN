import Link from "next/link";
import { SiteEditor, type EditorBlock, type EditorEvent } from "@/components/site/editor/site-editor";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";

export const metadata = { title: "The site" };

/**
 * `/site` — the editor for the public wedding site (spec 14 §13).
 *
 * Every section is listed, including ones with nothing in them, because this
 * is the screen for filling them in. The site itself drops empty sections; the
 * editor must not, or a blank section becomes unreachable.
 */
export default async function SitePage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [{ data: blocks, error }, { data: events }] = await Promise.all([
    supabase
      .from("site_content")
      .select("block_key, payload, sort_order, visible")
      .eq("wedding_id", wedding.id)
      .order("sort_order"),
    supabase
      .from("events")
      .select("id, name")
      .eq("wedding_id", wedding.id)
      .eq("is_public", true)
      .order("sort_order")
      .order("starts_at"),
  ]);

  if (error) throw new Error(`Could not load the site: ${error.message}`);

  const siteHref = `/w/${wedding.slug}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl">The site</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What guests see at{" "}
          <Link href={siteHref} className="underline" target="_blank" rel="noreferrer">
            {siteHref}
          </Link>
          . Sections with nothing in them don&rsquo;t appear on the site at all — an empty heading
          is worse than no section. It&rsquo;s not listed in search engines.{" "}
          <Link href="/site/theme" className="underline">
            Change how it looks →
          </Link>
        </p>
      </div>

      <SiteEditor
        blocks={(blocks ?? []) as EditorBlock[]}
        events={(events ?? []) as EditorEvent[]}
        siteHref={siteHref}
      />
    </div>
  );
}
