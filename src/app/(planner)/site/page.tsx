import Link from "next/link";
import { SiteBuilder } from "@/components/site/editor/builder";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import { requireWedding } from "@/server/queries/wedding";
import { getPublishState, listDraftBlocks } from "@/server/queries/site-blocks";
import type { PhotoOption } from "@/components/site/editor/photo-picker";
import type { SiteAssetRow } from "@/lib/types/database";

export const metadata = { title: "The site" };

/**
 * `/site` — the builder (spec 23).
 *
 * This screen was twelve fixed forms writing twelve fixed rows. It is now a
 * page made of blocks: add, reorder, style, hide, and publish when it is
 * ready. What guests see is the last published revision, which is why the
 * publish bar is the first thing on the screen rather than a button at the
 * bottom.
 */
export default async function SitePage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [blocks, publishState, { data: assets }] = await Promise.all([
    listDraftBlocks(wedding.id),
    getPublishState(wedding.id),
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl">Your site</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/site/theme" className="btn">
            Theme
          </Link>
          <Link href="/site/attire" className="btn">
            What to wear
          </Link>
          <Link href="/site/songs" className="btn">
            Song requests
          </Link>
          <Link href="/site/guestbook" className="btn">
            Guestbook
          </Link>
          <Link href={`/w/${wedding.slug}`} target="_blank" className="btn">
            See it live
          </Link>
        </div>
      </div>

      <SiteBuilder
        blocks={blocks}
        photos={photos}
        publishedAt={publishState.publishedAt}
        unpublished={publishState.unpublished}
        // Any change to the draft changes this, which remounts the preview
        // frame — that is what makes an edit appear without a manual refresh.
        previewKey={JSON.stringify(blocks.map((block) => [block.id, block.payload, block.style, block.visible]))}
      />
    </div>
  );
}
