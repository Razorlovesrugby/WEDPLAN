"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import {
  BLOCKS,
  BLOCK_AUDIENCES,
  STARTER_LAYOUTS,
  isBlockType,
  typesAtLimit,
} from "@/lib/site/blocks";
import { isLook } from "@/lib/site/looks";
import { blocksNeedingWork, starterPayload } from "@/lib/site/starter";
import { FAQ_LIBRARY } from "@/lib/site/faq-library";
import { fail, ok, type ActionResult } from "./result";

/**
 * Writes for the site builder (spec 23 §4).
 *
 * Two rules hold this file together.
 *
 * **The draft is never what guests see.** Everything here writes
 * `site_blocks`; guests read the newest `site_revisions` row. Publishing is
 * the one action that moves content between them, and it is a snapshot rather
 * than a flag flip, so a revision keeps rendering as it did even after the
 * draft moves on.
 *
 * **Payloads are validated here or nowhere.** The renderer tolerates rubbish
 * by design — a malformed FAQ costs its own block, never the page — and that
 * tolerance is exactly why nothing may rely on it. A bad payload that gets
 * past this file fails silently, months later, on somebody's wedding site.
 */

import { BLOCK_SCHEMAS, styleSchema, uuid } from "@/lib/site/block-schemas";


/** Drop the keys a form left empty, so a payload is what was actually said. */
function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== ""));
}

function revalidateSite(): void {
  revalidatePath("/site");
  revalidatePath("/site/preview");
  revalidatePath("/w", "layout");
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * Add a block.
 *
 *   `afterId` a block id   — directly after it
 *   `afterId` undefined    — at the end of the page
 *   `afterId` null         — at the very top (a drop above the first block)
 */
export async function addBlock(
  type: string,
  afterId?: string | null,
): Promise<ActionResult<{ id: string }>> {
  if (!isBlockType(type)) return fail("That isn't a kind of block");

  const wedding = await requireWedding();
  const blocks = await listDraftBlocks(wedding.id);

  // The limit is enforced here rather than only greyed out in the palette: the
  // palette is a UI and this is the rule.
  if (typesAtLimit(blocks).has(type)) {
    return fail(`Your page already has a ${BLOCKS[type].label.toLowerCase()}.`);
  }

  // Gaps of 10, so an insert between two blocks has somewhere to land without
  // renumbering the page.
  const index = afterId ? blocks.findIndex((block) => block.id === afterId) : blocks.length - 1;
  // Above the first block is a negative order, which sorts before the page's own
  // 0, 10, 20…; the next reorder renumbers everything from 0 as it always does.
  const sortOrder = afterId === null ? -5 : (index + 1) * 10 + 5;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_blocks")
    .insert({
      wedding_id: wedding.id,
      type,
      // Starter content, so the first thing the planner sees is what the block
      // looks like when it is full (spec 24 §5). Publish refuses a block still
      // carrying it untouched — see `publishSite`.
      payload: starterPayload(type) as never,
      style: {},
      sort_order: sortOrder,
      audience: BLOCKS[type].defaultAudience ?? "everyone",
    })
    .select("id")
    .single();

  if (error) return fail(`Could not add that block: ${error.message}`);
  revalidateSite();
  return ok({ id: data.id });
}

export async function saveBlock(
  id: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("site_blocks")
    .select("type")
    .eq("wedding_id", wedding.id)
    .eq("id", id)
    .maybeSingle();

  if (readError) return fail(readError.message);
  if (!existing || !isBlockType(existing.type)) return fail("That block no longer exists");

  const parsed = BLOCK_SCHEMAS[existing.type].safeParse(fields);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).flatMap(([key, messages]) =>
        messages ? [[key, messages]] : [],
      ),
    );
    return fail("Some fields need fixing", fieldErrors);
  }

  const { error } = await supabase
    .from("site_blocks")
    .update({ payload: compact(parsed.data as Record<string, unknown>) as never })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(`Could not save that block: ${error.message}`);
  revalidateSite();
  return ok(undefined);
}

export async function setBlockStyle(
  id: string,
  style: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = styleSchema.safeParse(style);
  if (!parsed.success) return fail("That isn't a style this block offers");

  const supabase = await createClient();

  // A Look is only valid for the kind of block it belongs to: a gallery cannot
  // be a timeline. The schema cannot see the block's type, so it is checked here.
  if (parsed.data.variant !== undefined) {
    const { data: existing } = await supabase
      .from("site_blocks")
      .select("type")
      .eq("wedding_id", wedding.id)
      .eq("id", id)
      .maybeSingle();
    if (!existing || !isBlockType(existing.type) || !isLook(existing.type, parsed.data.variant)) {
      return fail("That isn't a layout this block offers");
    }
  }

  const { error } = await supabase
    .from("site_blocks")
    .update({ style: compact(parsed.data) as never })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateSite();
  return ok(undefined);
}

export async function setBlockVisible(id: string, visible: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_blocks")
    .update({ visible })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateSite();
  return ok(undefined);
}

export async function setBlockAudience(id: string, audience: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.enum(BLOCK_AUDIENCES).safeParse(audience);
  if (!parsed.success) return fail("That isn't an audience");

  const supabase = await createClient();
  const { error } = await supabase
    .from("site_blocks")
    .update({ audience: parsed.data })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateSite();
  return ok(undefined);
}

export async function duplicateBlock(id: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: source, error } = await supabase
    .from("site_blocks")
    .select("type, payload, style, sort_order, audience")
    .eq("wedding_id", wedding.id)
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message);
  if (!source || !isBlockType(source.type)) return fail("That block no longer exists");

  const blocks = await listDraftBlocks(wedding.id);
  if (typesAtLimit(blocks).has(source.type)) {
    return fail(`Your page can only have one ${BLOCKS[source.type].label.toLowerCase()}.`);
  }

  const { data: copy, error: writeError } = await supabase
    .from("site_blocks")
    .insert({
      wedding_id: wedding.id,
      type: source.type,
      payload: source.payload,
      style: source.style,
      sort_order: source.sort_order + 5,
      audience: source.audience,
    })
    .select("id")
    .single();

  if (writeError) return fail(writeError.message);
  revalidateSite();
  return ok({ id: copy.id });
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // A real delete. The block is content the planner wrote and can add again,
  // and — unlike guest data — nothing downstream has to reconstruct it. Every
  // published version that carried it still carries it: a revision is a
  // snapshot, so deleting from the draft cannot rewrite what guests saw.
  const { error } = await supabase
    .from("site_blocks")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateSite();
  return ok(undefined);
}

/**
 * Renumber the page.
 *
 * Takes the whole order rather than a from/to pair, like `reorderLists`
 * (spec 12): the client already knows the order it wants, and reconstructing
 * it server-side from a move means rebuilding state the client has.
 */
export async function reorderBlocks(orderedIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.array(uuid).max(200).safeParse(orderedIds);
  if (!parsed.success) return fail("That isn't an order");
  if (new Set(parsed.data).size !== parsed.data.length) return fail("A block was listed twice");

  const supabase = await createClient();
  const blocks = await listDraftBlocks(wedding.id);
  const known = new Set(blocks.map((block) => block.id));
  if (parsed.data.some((id) => !known.has(id))) return fail("That block isn't on this page");

  // One statement per block. A page is a dozen rows, and an upsert here would
  // need every column of every row — which is how a reorder quietly resets a
  // payload.
  for (const [index, id] of parsed.data.entries()) {
    const { error } = await supabase
      .from("site_blocks")
      .update({ sort_order: index * 10 })
      .eq("wedding_id", wedding.id)
      .eq("id", id);
    if (error) return fail(error.message);
  }

  revalidateSite();
  return ok(undefined);
}

/**
 * Start from one of the three layouts (spec 23 §7).
 *
 * An empty builder is the worst first screen a builder can have: it asks
 * somebody with no design training to invent a page. This is refused once
 * there is anything to lose — "apply a layout" must never be a synonym for
 * "delete my site".
 */
export async function applyStarterLayout(layoutId: string): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const layout = STARTER_LAYOUTS.find((entry) => entry.id === layoutId);
  if (!layout) return fail("That isn't one of the layouts");

  const existing = await listDraftBlocks(wedding.id);
  if (existing.length > 0) {
    return fail("This page already has blocks on it. Delete them first, or add blocks one by one.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_blocks").insert(
    layout.types.map((type, index) => ({
      wedding_id: wedding.id,
      type,
      payload: starterPayload(type) as never,
      style: {},
      sort_order: index * 10,
      audience: BLOCKS[type].defaultAudience ?? "everyone",
    })),
  );

  if (error) return fail(error.message);
  revalidateSite();
  return ok({ added: layout.types.length });
}

/**
 * The FAQ starter library (spec 14 §10), now writing into a block.
 *
 * Appends rather than replaces, and skips anything already asked, so pressing
 * it twice is not destructive.
 */
export async function addStarterFaq(blockId: string): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: block } = await supabase
    .from("site_blocks")
    .select("payload, type")
    .eq("wedding_id", wedding.id)
    .eq("id", blockId)
    .maybeSingle();

  if (!block || block.type !== "faq") return fail("That isn't the questions block");

  const payload = (block.payload ?? {}) as Record<string, unknown>;
  const current = Array.isArray(payload["items"]) ? (payload["items"] as Record<string, unknown>[]) : [];
  const asked = new Set(
    current.map((item) => String(item["q"] ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const additions = FAQ_LIBRARY.filter((item) => !asked.has(item.q.trim().toLowerCase())).map(
    (item) => ({ q: item.q, a: item.a, featured: false, tags: item.tags }),
  );
  if (additions.length === 0) return ok({ added: 0 });

  const { error } = await supabase
    .from("site_blocks")
    .update({ payload: { ...payload, items: [...current, ...additions] } as never })
    .eq("wedding_id", wedding.id)
    .eq("id", blockId);

  if (error) return fail(error.message);
  revalidateSite();
  return ok({ added: additions.length });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Freeze the draft and hand it to the guests (spec 23 §4).
 *
 * The snapshot carries everything needed to render — type, payload, style,
 * visible, audience — because a revision has to keep rendering as it did
 * after the draft has moved on. Pruning to twenty is the database's job
 * (`site_revisions_prune`), so it happens however a revision arrives.
 */
export async function publishSite(note?: string): Promise<ActionResult<{ blocks: number }>> {
  const wedding = await requireWedding();
  const blocks = await listDraftBlocks(wedding.id);

  // A block still carrying the starter's sample text is refused, rather than
  // relying on anybody noticing "We met in a queue for coffee" on a live site
  // (spec 24 §5, answered in spec 27). Only `sample` blocks block publishing:
  // a `blank` one — a photo band with no photo — renders as nothing, which is
  // what it has always done, and refusing it would turn every existing site's
  // next publish into a chore. Hiding a block is the way out.
  const unfinished = blocksNeedingWork(blocks).filter((entry) => entry.status === "sample");
  if (unfinished.length > 0) {
    const names = [...new Set(unfinished.map((entry) => entry.label))].join(", ");
    return fail(
      `Not yet — ${unfinished.length === 1 ? "one block still has" : `${unfinished.length} blocks still have`} sample text: ${names}. Write your own, or hide ${unfinished.length === 1 ? "it" : "them"}, then publish.`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("site_revisions").insert({
    wedding_id: wedding.id,
    published_by: user?.id ?? null,
    note: note?.trim() || null,
    blocks: blocks.map((block) => ({
      id: block.id,
      type: block.type,
      payload: block.payload,
      style: block.style,
      visible: block.visible,
      audience: block.audience,
    })) as never,
  });

  if (error) return fail(`Could not publish: ${error.message}`);
  revalidateSite();
  return ok({ blocks: blocks.length });
}

/**
 * Put an old version back into the draft.
 *
 * It restores into the **draft**, not into the published slot: the planner
 * looks at it, then publishes, which is the same deliberate act as any other
 * change. Restoring straight to live would make an undo into a publish.
 */
export async function restoreRevision(id: string): Promise<ActionResult<{ blocks: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: revision, error } = await supabase
    .from("site_revisions")
    .select("blocks")
    .eq("wedding_id", wedding.id)
    .eq("id", id)
    .maybeSingle();

  if (error) return fail(error.message);
  if (!revision || !Array.isArray(revision.blocks)) return fail("That version is not there");

  const entries = (revision.blocks as unknown[]).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const type = row["type"];
    if (typeof type !== "string" || !isBlockType(type)) return [];
    return [
      {
        wedding_id: wedding.id,
        type,
        payload: (row["payload"] ?? {}) as never,
        style: (row["style"] ?? {}) as never,
        visible: row["visible"] !== false,
        audience: (row["audience"] === "invited" || row["audience"] === "public_only"
          ? row["audience"]
          : "everyone") as "everyone" | "invited" | "public_only",
      },
    ];
  });

  const { error: clearError } = await supabase
    .from("site_blocks")
    .delete()
    .eq("wedding_id", wedding.id);
  if (clearError) return fail(clearError.message);

  if (entries.length > 0) {
    const { error: writeError } = await supabase
      .from("site_blocks")
      .insert(entries.map((entry, index) => ({ ...entry, sort_order: index * 10 })));
    if (writeError) return fail(writeError.message);
  }

  revalidateSite();
  return ok({ blocks: entries.length });
}
