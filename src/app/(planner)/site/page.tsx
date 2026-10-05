import { SiteBuilder } from "@/components/site/editor/builder";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import { SITE_SIGNED_URL_TTL_SECONDS } from "@/lib/site/assets";
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

  const [blocks, publishState, theme, { data: assets }, { data: households }] = await Promise.all([
    listDraftBlocks(wedding.id),
    getPublishState(wedding.id),
    getSiteTheme(wedding.id),
    supabase
      .from("site_assets")
      .select("id, storage_path, alt, kind, created_at, focal_x, focal_y")
      .eq("wedding_id", wedding.id)
      .in("kind", ["hero", "gallery", "story", "party", "stay"])
      .order("created_at", { ascending: false }),
    // Who the preview can be shown as (spec 27 E7).
    supabase
      .from("households")
      .select("id, display_name")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null)
      .order("display_name")
      .limit(300),
  ]);

  const rows = (assets ?? []) as Pick<SiteAssetRow, "id" | "storage_path" | "alt" | "focal_x" | "focal_y">[];
  const signed = await signPaths(
    rows.map((row) => row.storage_path),
    SITE_SIGNED_URL_TTL_SECONDS,
  );
  const photos: PhotoOption[] = rows.flatMap((row) => {
    const url = signed.get(row.storage_path);
    // A row whose object has gone missing is dropped rather than rendered as
    // a broken tile — one bad asset must not take the picker down.
    const focal =
      row.focal_x !== null && row.focal_y !== null
        ? { x: Number(row.focal_x), y: Number(row.focal_y) }
        : null;
    return url ? [{ id: row.id, url, alt: row.alt, focal }] : [];
  });

  return (
    <SiteBuilder
      blocks={blocks}
      photos={photos}
      theme={theme}
      publishedAt={publishState.publishedAt}
      unpublished={publishState.unpublished}
      households={(households ?? []).map((household) => ({ id: household.id, name: household.display_name }))}
    />
  );
}
