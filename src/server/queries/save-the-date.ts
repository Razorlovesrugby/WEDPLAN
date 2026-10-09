import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import { SITE_SIGNED_URL_TTL_SECONDS } from "@/lib/site/assets";
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
  const signed = await signPaths(
    rows.map((row) => row.storage_path),
    SITE_SIGNED_URL_TTL_SECONDS,
  );
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

export type UnableGuest = { id: string; name: string };

/**
 * Who on a household's save-the-date can tell us they can't come (spec 29).
 *
 * Through the service role, for a guest with no session; the caller has
 * already resolved the household from its address, so this takes a household
 * id the SERVER chose and never one the browser sent.
 *
 *   `candidates`  guests with no flag at all — the "who can't come?" list.
 *   `declined`    guests who told us themselves, from this page. These are the
 *                 ones the thank-you state names and "undo" gives back.
 *
 * A guest the planner recorded by hand appears in neither: it is already dealt
 * with, and the guest has no business undoing something the planner did.
 */
export const loadUnableToAttend = cache(
  async (
    weddingId: string,
    householdId: string,
  ): Promise<{ candidates: UnableGuest[]; declined: UnableGuest[] }> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("guests")
      .select("id, first_name, preferred_name, unable_to_attend_via")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at");
    // A failed query must not read as "nobody here": that would hide the block
    // from someone who has already answered, and show the question again.
    if (error) throw new Error(`Could not load who can't come: ${error.message}`);

    const candidates: UnableGuest[] = [];
    const declined: UnableGuest[] = [];
    for (const guest of data ?? []) {
      const entry = { id: guest.id, name: guest.preferred_name?.trim() || guest.first_name };
      if (guest.unable_to_attend_via === null) candidates.push(entry);
      else if (guest.unable_to_attend_via === "save_the_date") declined.push(entry);
    }
    return { candidates, declined };
  },
);
