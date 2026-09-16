"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import {
  isAcceptedImageType,
  resequence,
  storageObjectPath,
  validateUpload,
} from "@/lib/moodboards";
import { encryptToken, generateInviteToken, hashInviteToken, moodboardShareUrl } from "@/lib/tokens";
import type {
  MoodboardItemOrigin,
  MoodboardItemRow,
  MoodboardRow,
  MoodboardShareChannel,
  MoodboardShareRow,
} from "@/lib/types/database";
import { fail, ok, type ActionResult } from "./result";

function revalidate(moodboardId?: string) {
  revalidatePath("/moodboards");
  if (moodboardId) revalidatePath(`/moodboards/${moodboardId}`);
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

const boardFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the board a name").max(200),
  description: z.string().trim().max(2000).optional(),
  eventId: z.string().uuid().nullish(),
});

export async function createMoodboard(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = boardFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboards")
    .insert({
      wedding_id: wedding.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      event_id: parsed.data.eventId ?? null,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);
  revalidate();
  return ok({ id: data.id });
}

export async function updateMoodboard(
  id: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = boardFieldsSchema.partial().safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  // "Blank form field means null; absent key means untouched" —
  // docs/HANDOFF.md section 8. Collapsing the two wipes columns silently.
  const patch: Partial<MoodboardRow> = {};
  if ("title" in fields && parsed.data.title) patch.title = parsed.data.title;
  if ("description" in fields) patch.description = parsed.data.description || null;
  if ("eventId" in fields) patch.event_id = parsed.data.eventId ?? null;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const { error } = await supabase
    .from("moodboards")
    .update(patch)
    .eq("id", id)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);
  revalidate(id);
  return ok(undefined);
}

export async function archiveMoodboard(id: string): Promise<ActionResult> {
  return setArchived(id, new Date().toISOString());
}

export async function restoreMoodboard(id: string): Promise<ActionResult> {
  return setArchived(id, null);
}

async function setArchived(id: string, value: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("moodboards")
    .update({ archived_at: value })
    .eq("id", id)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);
  revalidate(id);
  return ok(undefined);
}

/**
 * Deleting a board deletes its images from the bucket.
 *
 * Objects first, rows second, and the whole thing stops if the objects will
 * not go: the opposite order leaves bytes in a bucket with nothing pointing
 * at them and no way to find them again. The confirm in front of this names
 * the item count, the way removeQuestion counts answers first
 * (docs/HANDOFF.md section 5, rule 9).
 */
export async function deleteMoodboard(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: items, error: readError } = await supabase
    .from("moodboard_items")
    .select("storage_path, thumb_path")
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", id);

  if (readError) return fail(readError.message);

  const removal = await removePaths((items ?? []).flatMap((item) => [item.storage_path, item.thumb_path]));
  if (!removal.ok) {
    return fail(`The images couldn't be deleted, so the board hasn't been: ${removal.error ?? "unknown error"}`);
  }

  const { error } = await supabase.from("moodboards").delete().eq("id", id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidate();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

const uploadRequestSchema = z.object({
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  fileName: z.string().max(300).optional(),
  // Set by the Pinterest import; absent for an ordinary upload.
  origin: z.enum(["upload", "clip", "pinterest"]).optional(),
  externalId: z.string().max(100).optional(),
  caption: z.string().max(500).optional(),
  sourceUrl: z.string().max(2000).optional(),
  credit: z.string().max(200).optional(),
});

export type UploadSlot = {
  itemId: string;
  displayUrl: string;
  displayPath: string;
  thumbUrl: string;
  thumbPath: string;
};

/**
 * One row and two signed upload URLs per file, so the browser can PUT the
 * bytes straight to storage. The row lands with `uploaded_at` null and is
 * invisible everywhere except the board page that created it until
 * confirmUpload flips it.
 *
 * This is the single upload path for every source: the file picker, a drop, a
 * paste, and the Pinterest import — which differs only in the metadata it
 * passes here. One path means one set of caps and one set of checks.
 */
export async function requestUploadSlots(
  moodboardId: string,
  requests: unknown[],
): Promise<ActionResult<{ slots: UploadSlot[]; rejected: { fileName: string | null; reason: string }[] }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: board, error: boardError } = await supabase
    .from("moodboards")
    .select("id")
    .eq("id", moodboardId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();

  if (boardError) return fail(boardError.message);
  if (!board) return fail("That board doesn't exist.");

  const { count, error: countError } = await supabase
    .from("moodboard_items")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", moodboardId);
  if (countError) return fail(countError.message);

  const { data: sizes, error: sizeError } = await supabase
    .from("moodboard_items")
    .select("byte_size")
    .eq("wedding_id", wedding.id);
  if (sizeError) return fail(sizeError.message);

  let itemCount = count ?? 0;
  let weddingBytes = (sizes ?? []).reduce((total, row) => total + (row.byte_size ?? 0), 0);

  const { data: lastRow } = await supabase
    .from("moodboard_items")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", moodboardId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (lastRow?.sort_order ?? -1) + 1;

  const slots: UploadSlot[] = [];
  const rejected: { fileName: string | null; reason: string }[] = [];

  for (const raw of requests) {
    const parsed = uploadRequestSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ fileName: null, reason: "That file couldn't be read." });
      continue;
    }
    const request = parsed.data;

    const check = validateUpload({
      contentType: request.contentType,
      byteSize: request.byteSize,
      ...(request.fileName === undefined ? {} : { fileName: request.fileName }),
      itemCount,
      weddingBytes,
    });
    if (!check.ok) {
      rejected.push({ fileName: request.fileName ?? null, reason: check.reason });
      continue;
    }

    const itemId = crypto.randomUUID();
    // Derived from ids the server has checked. Nothing from the client
    // reaches this — not the filename, not the extension.
    const displayPath = storageObjectPath(wedding.id, moodboardId, itemId, "display", request.contentType);
    const thumbPath = storageObjectPath(wedding.id, moodboardId, itemId, "thumb", request.contentType);

    const [display, thumb] = await Promise.all([createUploadUrl(displayPath), createUploadUrl(thumbPath)]);
    if (!display || !thumb) {
      rejected.push({
        fileName: request.fileName ?? null,
        reason: "Storage isn't reachable. Has scripts/ensure-bucket.mjs been run for this environment?",
      });
      continue;
    }

    const { error: insertError } = await supabase.from("moodboard_items").insert({
      id: itemId,
      wedding_id: wedding.id,
      moodboard_id: moodboardId,
      storage_path: displayPath,
      thumb_path: thumbPath,
      content_type: request.contentType,
      byte_size: request.byteSize,
      sort_order: nextOrder,
      origin: (request.origin ?? "upload") as MoodboardItemOrigin,
      external_id: request.externalId ?? null,
      caption: request.caption ?? null,
      source_url: request.sourceUrl ?? null,
      credit: request.credit ?? null,
    });

    if (insertError) {
      // A duplicate external_id is the re-import case, and is not an error
      // worth showing: the pin is already on the board.
      rejected.push({
        fileName: request.fileName ?? null,
        reason: insertError.code === "23505" ? "Already on this board." : insertError.message,
      });
      continue;
    }

    slots.push({
      itemId,
      displayUrl: display.signedUrl,
      displayPath,
      thumbUrl: thumb.signedUrl,
      thumbPath,
    });
    itemCount += 1;
    weddingBytes += request.byteSize;
    nextOrder += 1;
  }

  return ok({ slots, rejected });
}

/** The bytes arrived. This is what makes an item visible. */
export async function confirmUpload(
  itemId: string,
  facts: { width: number; height: number; byteSize: number; contentType?: string },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const patch: Partial<MoodboardItemRow> = {
    uploaded_at: new Date().toISOString(),
    width: Math.max(1, Math.round(facts.width)),
    height: Math.max(1, Math.round(facts.height)),
    byte_size: Math.max(0, Math.round(facts.byteSize)),
  };
  if (facts.contentType && isAcceptedImageType(facts.contentType)) {
    patch.content_type = facts.contentType;
  }

  const { data, error } = await supabase
    .from("moodboard_items")
    .update(patch)
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .select("moodboard_id")
    .maybeSingle();

  if (error) return fail(error.message);
  revalidate(data?.moodboard_id);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const itemFieldsSchema = z.object({
  caption: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
  sourceUrl: z.string().trim().max(2000).optional(),
  credit: z.string().trim().max(200).optional(),
});

export async function updateMoodboardItem(
  itemId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = itemFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const patch: Partial<MoodboardItemRow> = {};
  if ("caption" in fields) patch.caption = parsed.data.caption || null;
  if ("note" in fields) patch.note = parsed.data.note || null;
  if ("sourceUrl" in fields) patch.source_url = parsed.data.sourceUrl || null;
  if ("credit" in fields) patch.credit = parsed.data.credit || null;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_items")
    .update(patch)
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .select("moodboard_id")
    .maybeSingle();

  if (error) return fail(error.message);
  revalidate(data?.moodboard_id);
  return ok(undefined);
}

/**
 * Two writes, in this order, because `moodboard_items_one_cover_idx` is a
 * partial unique index: setting the new cover first would collide with the
 * old one. Clearing first leaves a moment with no cover, which the view
 * handles by falling back to the first item.
 */
export async function setCoverItem(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: item, error: readError } = await supabase
    .from("moodboard_items")
    .select("moodboard_id")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();

  if (readError) return fail(readError.message);
  if (!item) return fail("That image isn't on this wedding's boards.");

  const { error: clearError } = await supabase
    .from("moodboard_items")
    .update({ is_cover: false })
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", item.moodboard_id)
    .eq("is_cover", true);
  if (clearError) return fail(clearError.message);

  const { error } = await supabase
    .from("moodboard_items")
    .update({ is_cover: true })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidate(item.moodboard_id);
  return ok(undefined);
}

/** Objects first, row second — same rule as deleteMoodboard, same reason. */
export async function deleteMoodboardItem(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: item, error: readError } = await supabase
    .from("moodboard_items")
    .select("moodboard_id, storage_path, thumb_path")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();

  if (readError) return fail(readError.message);
  if (!item) return ok(undefined); // already gone

  const removal = await removePaths([item.storage_path, item.thumb_path]);
  if (!removal.ok) {
    return fail(`The image couldn't be removed from storage, so it's still here: ${removal.error ?? ""}`);
  }

  const { error } = await supabase
    .from("moodboard_items")
    .delete()
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidate(item.moodboard_id);
  return ok(undefined);
}

export async function reorderMoodboardItems(
  moodboardId: string,
  movedId: string,
  toIndex: number,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: items, error: readError } = await supabase
    .from("moodboard_items")
    .select("id, sort_order")
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", moodboardId)
    .order("sort_order", { ascending: true });

  if (readError) return fail(readError.message);

  const changes = resequence(items ?? [], movedId, toIndex);
  for (const change of changes) {
    const { error } = await supabase
      .from("moodboard_items")
      .update({ sort_order: change.sort_order })
      .eq("id", change.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  revalidate(moodboardId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

const shareFieldsSchema = z.object({
  label: z.string().trim().max(200).optional(),
  showNotes: z.boolean().optional(),
  showCredits: z.boolean().optional(),
  expiresAt: z.string().trim().max(40).nullish(),
});

/**
 * A link share. The raw token is returned exactly once, here, because what is
 * stored is a hash of it — the encrypted copy is what lets the planner
 * re-read the link later without reissuing it.
 */
export async function createShare(
  moodboardId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string; url: string }>> {
  const wedding = await requireWedding();
  const parsed = shareFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const token = generateInviteToken();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_shares")
    .insert({
      wedding_id: wedding.id,
      moodboard_id: moodboardId,
      channel: "link" as MoodboardShareChannel,
      label: parsed.data.label || null,
      token_hash: hashInviteToken(token),
      token_encrypted: encryptToken(token),
      show_notes: parsed.data.showNotes ?? false,
      show_credits: parsed.data.showCredits ?? true,
      expires_at: parsed.data.expiresAt || null,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);
  revalidate(moodboardId);
  // The link is built here rather than in the browser: the client has no
  // business assembling a credential-bearing URL out of an origin string.
  return ok({ id: data.id, url: moodboardShareUrl(token) });
}

export async function updateShare(shareId: string, fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = shareFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const patch: Partial<MoodboardShareRow> = {};
  if ("label" in fields) patch.label = parsed.data.label || null;
  if ("showNotes" in fields) patch.show_notes = parsed.data.showNotes ?? false;
  if ("showCredits" in fields) patch.show_credits = parsed.data.showCredits ?? true;
  if ("expiresAt" in fields) patch.expires_at = parsed.data.expiresAt || null;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_shares")
    .update(patch)
    .eq("id", shareId)
    .eq("wedding_id", wedding.id)
    .select("moodboard_id")
    .maybeSingle();

  if (error) return fail(error.message);
  revalidate(data?.moodboard_id);
  return ok(undefined);
}

/**
 * Revoking keeps the row, so the label and the view count survive as a record
 * of what was sent to whom. It closes the page immediately; images already
 * signed stay reachable until their URLs expire — an hour at most, and the
 * reason SIGNED_URL_TTL_SECONDS is not longer.
 */
export async function revokeShare(shareId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .eq("wedding_id", wedding.id)
    .select("moodboard_id")
    .maybeSingle();

  if (error) return fail(error.message);
  revalidate(data?.moodboard_id);
  return ok(undefined);
}

/**
 * The public-site and RSVP channels, which carry no token: the page they
 * appear on has already established who is looking. At most one of each per
 * board, enforced by a partial unique index, so this un-revokes an existing
 * row rather than inserting a second one.
 */
export async function setChannelShare(
  moodboardId: string,
  channel: "public_site" | "rsvp",
  on: boolean,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("moodboard_shares")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("moodboard_id", moodboardId)
    .eq("channel", channel)
    .maybeSingle();
  if (readError) return fail(readError.message);

  if (existing) {
    const { error } = await supabase
      .from("moodboard_shares")
      .update({ revoked_at: on ? null : new Date().toISOString() })
      .eq("id", existing.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  } else if (on) {
    const { error } = await supabase.from("moodboard_shares").insert({
      wedding_id: wedding.id,
      moodboard_id: moodboardId,
      channel,
      // Notes are never shown on these two channels regardless (there is no
      // labelled recipient to trust), but the column is set false anyway so
      // nothing depends on the rendering layer remembering.
      show_notes: false,
    });
    if (error) return fail(error.message);
  }

  revalidate(moodboardId);
  revalidatePath("/w");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Clip tokens
// ---------------------------------------------------------------------------

export async function createClipToken(
  label: string,
  defaultMoodboardId?: string | null,
): Promise<ActionResult<{ id: string; token: string }>> {
  const wedding = await requireWedding();
  const user = await getSessionUser();
  const trimmed = label.trim();
  if (!trimmed) return fail("Give it a name, so you know which browser to revoke later", { label: ["Required"] });

  const token = generateInviteToken();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("moodboard_clip_tokens")
    .insert({
      wedding_id: wedding.id,
      label: trimmed.slice(0, 200),
      token_hash: hashInviteToken(token),
      token_encrypted: encryptToken(token),
      default_moodboard_id: defaultMoodboardId || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);
  revalidatePath("/settings");
  return ok({ id: data.id, token });
}

export async function revokeClipToken(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("moodboard_clip_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);
  revalidatePath("/settings");
  return ok(undefined);
}
