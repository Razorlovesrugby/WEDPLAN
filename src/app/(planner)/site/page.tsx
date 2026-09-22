import { SiteBuilder } from "@/components/site/editor/builder";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import { requireWedding } from "@/server/queries/wedding";
import { getPublishState, listDraftBlocks } from "@/server/queries/site-blocks";
import type { PhotoOption } from "@/components/site/editor/photo-picker";
import { getSiteTheme } from "@/server/queries/site";
import type { SiteAssetRow } from "@/lib/types/database";

export const metadata = { title: "The site" };

/**
 * `/site` — the builder (spec 23).
 *
 * This screen was twelve fixed forms writing twelve fixed rows. It became a
 * page made of blocks (spec 23), and spec 24 recomposed it again: a rail of
 * controls beside a live preview, with the theme, palette and typography that
 * used to live on `/site/theme` folded in beside the thing they change.
 *
 * The row of links this page used to carry is gone — those screens are in the
 * rail now. What guests see is still the last published revision, which is why
 * the publish bar is the first thing on the screen rather than a button at the
 * bottom.
 */
export default async function SitePage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [blocks, publishState, theme, { data: assets }] = await Promise.all([
    listDraftBlocks(wedding.id),
    getPublishState(wedding.id),
    getSiteTheme(wedding.id),
    supabase
      .from("site_assets")
      .select("id, storage_path, alt, kind, created_at")
      .eq("wedding_id", wedding.id)
      .in("kind", ["hero", "gallery", "story", "party", "stay"])
      .order("created_at", { ascending: false }),
  ]);

  const rows = (assets ?? []) as Pick<SiteAssetRow, "id" | "storage_path" | "alt">[];
  const signed = await signPaths(rows.map((row) => row.storage_path));
  const photos: PhotoOption[] = rows.flatMap((row) => {
    const url = signed.get(row.storage_path);
    // A row whose object has gone missing is dropped rather than rendered as
    // a broken tile — one bad asset must not take the picker down.
    return url ? [{ id: row.id, url, alt: row.alt }] : [];
  });

  return (
    <SiteBuilder
      blocks={blocks}
      photos={photos}
      theme={theme}
      publishedAt={publishState.publishedAt}
      unpublished={publishState.unpublished}
      siteHref={`/w/${wedding.slug}`}
      // Any change to the draft changes this, which remounts the preview
      // frame — that is what makes an edit appear without a manual refresh.
      previewKey={JSON.stringify(
        blocks.map((block) => [block.id, block.payload, block.style, block.visible]),
      )}
    />
  );
}
