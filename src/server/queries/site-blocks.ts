import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlockType, type BlockAudience, type BlockStyle, type SiteBlock } from "@/lib/site/blocks";
import type { SiteBlockRow, SiteRevisionRow } from "@/lib/types/database";

/**
 * Reading the site (spec 23 §4).
 *
 * Two different things are called "the site" and keeping them apart is the
 * whole point of the draft/publish split:
 *
 *   `listDraftBlocks`      what the planner is editing. Only ever read by
 *                          `/site` and its preview.
 *   `loadPublishedBlocks`  what guests see — the newest revision, one row.
 *
 * A half-finished edit cannot leak onto the public page by construction,
 * rather than by everybody remembering to check a flag.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One entry of a revision's `blocks` array, defensively.
 *
 * A revision is JSONB written months ago by a version of this app that no
 * longer exists. An entry that makes no sense is dropped rather than rendered
 * as an empty section or thrown over — the rest of the page is somebody's
 * wedding and has to keep working.
 */
function toBlock(value: unknown): SiteBlock | null {
  if (!isRecord(value)) return null;
  const type = value["type"];
  if (typeof type !== "string" || !isBlockType(type)) return null;

  const audience = value["audience"];
  return {
    id: typeof value["id"] === "string" ? value["id"] : `${type}-${Math.random()}`,
    type,
    payload: value["payload"] ?? {},
    style: (isRecord(value["style"]) ? value["style"] : {}) as BlockStyle,
    visible: value["visible"] !== false,
    audience:
      audience === "invited" || audience === "public_only" ? (audience as BlockAudience) : "everyone",
  };
}

function fromRow(row: SiteBlockRow): SiteBlock | null {
  if (!isBlockType(row.type)) return null;
  return {
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    style: (isRecord(row.style) ? row.style : {}) as BlockStyle,
    visible: row.visible,
    audience: row.audience,
  };
}

/** The planner's working copy, in order. */
export const listDraftBlocks = cache(async (weddingId: string): Promise<SiteBlock[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_blocks")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order")
    .order("created_at");

  if (error) throw new Error(`Could not load the site: ${error.message}`);
  return ((data ?? []) as SiteBlockRow[]).flatMap((row) => {
    const block = fromRow(row);
    return block ? [block] : [];
  });
});

export type PublishState = {
  publishedAt: string | null;
  /** How many draft blocks differ from the published snapshot. */
  unpublished: number;
};

/**
 * What the editor's header says: when guests last got a new version, and how
 * far ahead the draft is.
 *
 * A draft system whose state is invisible is a bug generator — somebody edits
 * for an hour, never presses Publish, and cannot work out why nothing changed.
 */
export const getPublishState = cache(async (weddingId: string): Promise<PublishState> => {
  const supabase = await createClient();
  const [{ data: revision }, draft] = await Promise.all([
    supabase
      .from("site_revisions")
      .select("published_at, blocks")
      .eq("wedding_id", weddingId)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    listDraftBlocks(weddingId),
  ]);

  const published = Array.isArray(revision?.blocks)
    ? (revision.blocks as unknown[]).flatMap((entry) => {
        const block = toBlock(entry);
        return block ? [block] : [];
      })
    : [];

  // Compared by value rather than by updated_at: a planner who types a word
  // and types it back has not changed anything, and telling them they have
  // teaches them to ignore the number.
  const shape = (blocks: SiteBlock[]) =>
    blocks.map((block) => JSON.stringify([block.type, block.payload, block.style, block.visible, block.audience]));
  const before = shape(published);
  const after = shape(draft);

  let differences = Math.abs(before.length - after.length);
  for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
    if (before[i] !== after[i]) differences += 1;
  }

  return { publishedAt: revision?.published_at ?? null, unpublished: differences };
});

/** The history, newest first, for the restore list. */
export const listRevisions = cache(
  async (weddingId: string): Promise<Pick<SiteRevisionRow, "id" | "published_at" | "note">[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("site_revisions")
      .select("id, published_at, note")
      .eq("wedding_id", weddingId)
      .order("published_at", { ascending: false });
    return data ?? [];
  },
);

/**
 * What guests see: the newest revision, read through the service role because
 * nobody on the public path is signed in.
 *
 * A wedding with no revision at all renders nothing rather than falling back
 * to the draft — falling back is how an unpublished page reaches the internet.
 * `0025` gives every existing wedding a first revision so this is not the
 * common case.
 */
export async function loadPublishedBlocks(weddingId: string): Promise<SiteBlock[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_revisions")
    .select("blocks")
    .eq("wedding_id", weddingId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || !Array.isArray(data.blocks)) return [];
  return (data.blocks as unknown[]).flatMap((entry) => {
    const block = toBlock(entry);
    return block ? [block] : [];
  });
}
