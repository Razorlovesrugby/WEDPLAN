import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import { pickSaveTheDatePhotos } from "@/lib/site/save-the-date";
import type { SiteAssetRow } from "@/lib/types/database";

export type SaveTheDatePhoto = { id: string; url: string; alt: string | null };

/**
 * The couple's photographs for the save-the-date page, signed.
 *
 * Service role because the reader is a guest with no session; pinned to the
 * one wedding the page's address already resolved to, like every other query
 * behind `/w`.
 */
export const getSaveTheDatePhotos = cache(async (weddingId: string): Promise<SaveTheDatePhoto[]> => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_assets")
    .select("id, kind, sort_order, uploaded_by_household, storage_path, alt")
    .eq("wedding_id", weddingId)
    .in("kind", ["hero", "story", "gallery"]);

  const picked = pickSaveTheDatePhotos(
    (data ?? []) as Pick<
      SiteAssetRow,
      "id" | "kind" | "sort_order" | "uploaded_by_household" | "storage_path" | "alt"
    >[],
  );
  const signed = await signPaths(picked.map((row) => row.storage_path));

  return picked.flatMap((row) => {
    const url = signed.get(row.storage_path);
    return url ? [{ id: row.id, url, alt: row.alt }] : [];
  });
});

export type SaveTheDateOpens = { lastViewedAt: string | null; viewCount: number };

/**
 * Save-the-date opens per household, for the Guests table (0031). A plain
 * object rather than a Map because it crosses into a client component.
 */
export const listSaveTheDateOpens = cache(
  async (weddingId: string): Promise<Record<string, SaveTheDateOpens>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_household_rsvp")
      .select("household_id, std_last_viewed_at, std_view_count")
      .eq("wedding_id", weddingId);

    if (error) throw new Error(`Could not load save-the-date opens: ${error.message}`);
    return Object.fromEntries(
      (data ?? []).map((row) => [
        row.household_id,
        { lastViewedAt: row.std_last_viewed_at, viewCount: row.std_view_count },
      ]),
    );
  },
);
