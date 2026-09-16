import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { signPaths } from "@/lib/supabase/storage";
import type {
  MoodboardClipTokenRow,
  MoodboardItemRow,
  MoodboardShareRow,
  MoodboardView,
  PinterestAccountRow,
} from "@/lib/types/database";

/** An item with its images already signed, which is the only form a page can render. */
export type SignedItem = MoodboardItemRow & {
  displayUrl: string | null;
  thumbUrl: string | null;
};

export const listMoodboards = cache(async (weddingId: string): Promise<MoodboardView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_moodboards")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load moodboards: ${error.message}`);
  return data ?? [];
});

/** Archived boards, for the ?archived=1 toggle. Never mixed into the default list. */
export const listArchivedMoodboards = cache(async (weddingId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboards")
    .select("*")
    .eq("wedding_id", weddingId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) throw new Error(`Could not load archived moodboards: ${error.message}`);
  return data ?? [];
});

export const getMoodboard = cache(async (weddingId: string, id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboards")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load the moodboard: ${error.message}`);
  return data;
});

/**
 * Every item on a board, newest failures included.
 *
 * `includePending` is what separates the planner's own board page — which has
 * to show a failed upload so it can be retried or removed — from every other
 * surface, where a row whose bytes never arrived does not exist.
 */
export const listMoodboardItems = cache(
  async (
    weddingId: string,
    moodboardId: string,
    options?: { includePending?: boolean },
  ): Promise<MoodboardItemRow[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("moodboard_items")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("moodboard_id", moodboardId);

    if (!options?.includePending) query = query.not("uploaded_at", "is", null);

    const { data, error } = await query
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Could not load the board: ${error.message}`);
    return data ?? [];
  },
);

/**
 * Signing, deliberately NOT cache()d.
 *
 * A signed URL is time-boxed, so caching one across a render pass is fine but
 * caching it across requests is how a viewer gets a URL that expired twenty
 * minutes ago. React's cache() is per-request, but keeping this uncached
 * makes the rule visible rather than implied.
 */
export async function signItems(items: readonly MoodboardItemRow[]): Promise<SignedItem[]> {
  const paths = items.flatMap((item) => [item.storage_path, item.thumb_path]);
  const signed = await signPaths(paths);
  return items.map((item) => ({
    ...item,
    displayUrl: signed.get(item.storage_path) ?? null,
    thumbUrl: signed.get(item.thumb_path) ?? signed.get(item.storage_path) ?? null,
  }));
}

export const listShares = cache(async (weddingId: string, moodboardId: string): Promise<MoodboardShareRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_shares")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("moodboard_id", moodboardId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load shares: ${error.message}`);
  return data ?? [];
});

/** How many bytes this wedding is already storing — the per-wedding cap's input. */
export const getWeddingStorageBytes = cache(async (weddingId: string): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("byte_size")
    .eq("wedding_id", weddingId);

  if (error) throw new Error(`Could not measure storage: ${error.message}`);
  return (data ?? []).reduce((total, row) => total + (row.byte_size ?? 0), 0);
});

export const listClipTokens = cache(async (weddingId: string): Promise<MoodboardClipTokenRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_clip_tokens")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load clip tokens: ${error.message}`);
  return data ?? [];
});

export const getPinterestAccount = cache(async (weddingId: string): Promise<PinterestAccountRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pinterest_accounts")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (error) throw new Error(`Could not load the Pinterest connection: ${error.message}`);
  return data;
});

/** Pin ids already imported into a board, so the import screen can tick and disable them. */
export const listImportedPinIds = cache(async (weddingId: string, moodboardId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("external_id")
    .eq("wedding_id", weddingId)
    .eq("moodboard_id", moodboardId)
    .not("external_id", "is", null);

  if (error) throw new Error(`Could not check what is already imported: ${error.message}`);
  return new Set((data ?? []).flatMap((row) => (row.external_id ? [row.external_id] : [])));
});
