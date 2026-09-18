import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPaths } from "@/lib/supabase/storage";
import type { SiteAssetRow } from "@/lib/types/database";

/** A gallery image with a URL the browser can actually fetch (spec 14 §9). */
export type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  uploadedByHousehold: string | null;
  approvedAt: string | null;
};

/**
 * Signed URLs, not a public bucket.
 *
 * A public bucket is a permanent, un-revocable decision and this one holds a
 * guest list's faces. An image whose object has gone missing is dropped rather
 * than rendered broken — one bad row must not take the section down.
 */
async function withUrls(rows: SiteAssetRow[]): Promise<GalleryImage[]> {
  const signed = await signPaths(rows.map((row) => row.storage_path));
  return rows.flatMap((row) => {
    const url = signed.get(row.storage_path);
    if (!url) return [];
    return [
      {
        id: row.id,
        url,
        alt: row.alt,
        width: row.width,
        height: row.height,
        uploadedByHousehold: row.uploaded_by_household,
        approvedAt: row.approved_at,
      },
    ];
  });
}

/** What the public site shows: approved only. */
export async function getPublicGallery(weddingId: string): Promise<GalleryImage[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_assets")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("kind", "gallery")
    .not("approved_at", "is", null)
    .order("sort_order")
    .order("created_at");
  return withUrls((data ?? []) as SiteAssetRow[]);
}

/** What one household has contributed, approved or not, on their RSVP page. */
export async function getHouseholdUploads(
  weddingId: string,
  householdId: string,
): Promise<GalleryImage[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_assets")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("uploaded_by_household", householdId)
    .order("created_at", { ascending: false });
  return withUrls((data ?? []) as SiteAssetRow[]);
}

/** The planner's view: everything, waiting first. */
export async function getGalleryForPlanner(weddingId: string): Promise<{
  pending: GalleryImage[];
  approved: GalleryImage[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_assets")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("kind", "gallery")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as SiteAssetRow[];
  const [pending, approved] = await Promise.all([
    withUrls(rows.filter((row) => row.approved_at === null)),
    withUrls(rows.filter((row) => row.approved_at !== null)),
  ]);
  return { pending, approved };
}

/**
 * The gallery block's payload, for the RSVP page's upload gate.
 *
 * Lives here rather than in the page so the service-role read stays inside a
 * query module — the same rule every other public read follows.
 */
export async function getGallerySettings(weddingId: string): Promise<unknown> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", weddingId)
    .eq("block_key", "gallery")
    .maybeSingle();
  return data?.payload ?? null;
}
