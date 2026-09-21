"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import { MAX_UPLOAD_BYTES, isAcceptedUploadType, siteAssetPath } from "@/lib/site/assets";
import { fail, ok, type ActionResult } from "./result";

/**
 * The planner's own photo uploads (spec 23 §8, build step 3).
 *
 * Spec 14 left this as the gap that mattered most: `site_assets` existed and
 * only guests could write to it, so the hero asked for a storage path typed by
 * hand. This is the other half.
 *
 * **The bytes never pass through a server action.** `next.config.mjs` caps
 * action payloads at 4MB deliberately, and routing photographs through one
 * would mean raising that ceiling for every action in the app. The browser
 * that has the file gets a signed URL and PUTs to storage directly — the same
 * arrangement spec 9 built for moodboards, and the same one guest uploads use.
 *
 * The row is written first and confirmed second, so a half-finished upload is
 * a row with no dimensions rather than a block pointing at nothing.
 */

const requestSchema = z.object({
  kind: z.enum(["hero", "gallery", "story", "party", "stay"]).default("hero"),
  content_type: z.string().trim().max(100),
  byte_size: z.coerce.number().int().min(1),
});

export async function requestSitePhotoUpload(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ assetId: string; uploadUrl: string }>> {
  const parsed = requestSchema.safeParse(fields);
  if (!parsed.success) return fail("That file can't be uploaded");

  if (!isAcceptedUploadType(parsed.data.content_type)) {
    return fail("Photos only — JPEG, PNG, WebP or HEIC.");
  }
  if (parsed.data.byte_size > MAX_UPLOAD_BYTES) {
    return fail("That photo's too big. Anything under 12MB is fine.");
  }

  const wedding = await requireWedding();
  const assetId = crypto.randomUUID();
  // Built from ids the server already holds. Never from anything the client
  // sent — that is what keeps a signed upload URL from being a way to write
  // anywhere in the bucket.
  const path = siteAssetPath(wedding.id, assetId);

  const upload = await createUploadUrl(path);
  if (!upload) {
    return fail("Storage isn't reachable. Has scripts/ensure-bucket.mjs been run here?");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_assets").insert({
    id: assetId,
    wedding_id: wedding.id,
    kind: parsed.data.kind,
    storage_path: path,
    // The planner's own photographs need no moderation — the approval queue
    // exists for what guests send in.
    approved_at: new Date().toISOString(),
  });
  if (error) return fail(error.message);

  return ok({ assetId, uploadUrl: upload.signedUrl });
}

const confirmSchema = z.object({
  asset_id: z.string().uuid(),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
  alt: z.string().trim().max(300).optional(),
});

export async function confirmSitePhotoUpload(
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = confirmSchema.safeParse(fields);
  if (!parsed.success) return fail("That upload couldn't be finished");

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("site_assets")
    .update({
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      alt: parsed.data.alt || null,
    })
    .eq("wedding_id", wedding.id)
    .eq("id", parsed.data.asset_id);

  if (error) return fail(error.message);

  revalidatePath("/site");
  revalidatePath("/w", "layout");
  return ok(undefined);
}

/** Remove a photograph the planner uploaded, object and row together. */
export async function deleteSitePhoto(assetId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("site_assets")
    .select("storage_path")
    .eq("wedding_id", wedding.id)
    .eq("id", assetId)
    .maybeSingle();

  const { error } = await supabase
    .from("site_assets")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", assetId);
  if (error) return fail(error.message);

  // After the row, so a storage failure cannot leave a row pointing at
  // nothing — the same order the gallery's own delete uses.
  if (asset?.storage_path) await removePaths([asset.storage_path]);

  revalidatePath("/site");
  return ok(undefined);
}
