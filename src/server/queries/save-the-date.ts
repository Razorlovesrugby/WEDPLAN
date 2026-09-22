import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import {
  SAVE_THE_DATE_BLOCK_KEY,
  orderByIds,
  pickSaveTheDatePhotos,
  resolveSaveTheDate,
  type SaveTheDateContent,
} from "@/lib/site/save-the-date";
import { resolveTheme, type SiteTheme } from "@/lib/theme/presets";
import type { SiteAssetRow } from "@/lib/types/database";

export type SaveTheDatePhoto = { id: string; url: string; alt: string | null };

type AssetRow = Pick<
  SiteAssetRow,
  "id" | "kind" | "sort_order" | "uploaded_by_household" | "storage_path" | "alt"
>;

type Client = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the save-the-date needs from the database, through whichever
 * client the caller holds: the service role for a guest (no session), the
 * planner's own session in the editor (RLS does the scoping).
 */
async function loadRaw(supabase: Client, weddingId: string) {
  const [{ data: config }, { data: assets }] = await Promise.all([
    supabase
      .from("site_content")
      .select("block_key, payload")
      .eq("wedding_id", weddingId)
      .in("block_key", ["theme", SAVE_THE_DATE_BLOCK_KEY]),
    supabase
      .from("site_assets")
      .select("id, kind, sort_order, uploaded_by_household, storage_path, alt, created_at")
      .eq("wedding_id", weddingId)
      // Approved only: a guest's upload waiting for review is not the
      // planner's to publish yet, even by choosing it here.
      .not("approved_at", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const byKey = new Map((config ?? []).map((row) => [row.block_key, row.payload]));
  return {
    content: resolveSaveTheDate(byKey.get(SAVE_THE_DATE_BLOCK_KEY) ?? null),
    siteTheme: resolveTheme(byKey.get("theme") ?? null),
    assets: (assets ?? []) as AssetRow[],
  };
}

/** The couple's choice when they made one; the automatic pick until then. */
function chosenAssets(content: SaveTheDateContent, assets: AssetRow[]): AssetRow[] {
  return content.photoIds === null
    ? pickSaveTheDatePhotos(assets)
    : orderByIds(assets, content.photoIds);
}

async function sign(rows: AssetRow[]): Promise<SaveTheDatePhoto[]> {
  const signed = await signPaths(rows.map((row) => row.storage_path));
  // A row whose object has gone missing is dropped rather than rendered as a
  // broken tile.
  return rows.flatMap((row) => {
    const url = signed.get(row.storage_path);
    return url ? [{ id: row.id, url, alt: row.alt }] : [];
  });
}

export type SaveTheDateForGuest = {
  content: SaveTheDateContent;
  siteTheme: SiteTheme;
  photos: SaveTheDatePhoto[];
};

/**
 * For the public page and its preview image. Service role because the reader
 * is a guest with no session; pinned to the one wedding the page's address
 * already resolved to, like every other query behind `/w`.
 */
export const loadSaveTheDate = cache(async (weddingId: string): Promise<SaveTheDateForGuest> => {
  const raw = await loadRaw(createAdminClient(), weddingId);
  return {
    content: raw.content,
    siteTheme: raw.siteTheme,
    photos: await sign(chosenAssets(raw.content, raw.assets)),
  };
});

/** The words only — for the email and the preview image, which draw no photos. */
export const loadSaveTheDateContent = cache(async (weddingId: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_content")
    .select("block_key, payload")
    .eq("wedding_id", weddingId)
    .in("block_key", ["theme", SAVE_THE_DATE_BLOCK_KEY]);
  const byKey = new Map((data ?? []).map((row) => [row.block_key, row.payload]));
  return {
    content: resolveSaveTheDate(byKey.get(SAVE_THE_DATE_BLOCK_KEY) ?? null),
    siteTheme: resolveTheme(byKey.get("theme") ?? null),
  };
});

export type SaveTheDateEditorData = {
  content: SaveTheDateContent;
  siteTheme: SiteTheme;
  /** Every photograph the couple could choose, newest first. */
  library: SaveTheDatePhoto[];
  /** What "automatic" currently resolves to, so the preview can show it. */
  autoPhotoIds: string[];
};

/** For `/invitations/save-the-date`, through the planner's own session. */
export const getSaveTheDateEditor = cache(
  async (weddingId: string): Promise<SaveTheDateEditorData> => {
    const raw = await loadRaw(await createClient(), weddingId);
    return {
      content: raw.content,
      siteTheme: raw.siteTheme,
      library: await sign(raw.assets),
      autoPhotoIds: pickSaveTheDatePhotos(raw.assets).map((row) => row.id),
    };
  },
);

export type SaveTheDateOpens = {
  lastViewedAt: string | null;
  viewCount: number;
};

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

/**
 * The save-the-date's words, through the planner's own session — for
 * `/invitations`, where the WhatsApp text is composed and no photos are needed.
 */
export const getSaveTheDateContent = cache(
  async (weddingId: string): Promise<SaveTheDateContent> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("site_content")
      .select("payload")
      .eq("wedding_id", weddingId)
      .eq("block_key", SAVE_THE_DATE_BLOCK_KEY)
      .maybeSingle();
    return resolveSaveTheDate(data?.payload ?? null);
  },
);
