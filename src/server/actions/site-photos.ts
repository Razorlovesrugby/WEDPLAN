"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import {
  MAX_UPLOAD_BYTES,
  SITE_IMAGE_WIDTHS,
  isAcceptedUploadType,
  isSiteImageWidth,
  siteAssetPath,
} from "@/lib/site/assets";
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
  // Which narrower copies the browser made (spec 27 D1). Only the widths the
  // schema knows; anything else is dropped rather than failing the upload.
  variants: z
    .array(z.coerce.number().int())
    .max(SITE_IMAGE_WIDTHS.length)
    .default([])
    .transform((widths) => [...new Set(widths)].filter(isSiteImageWidth)),
});

export async function requestSitePhotoUpload(
  fields: Record<string, unknown>,
): Promise<
  ActionResult<{
    assetId: string;
    uploadUrl: string;
    variantUploads: { edge: number; uploadUrl: string }[];
  }>
> {
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

  // One signed URL per narrower copy, built the same way: from ids the server
  // holds plus a width from a closed list, never from anything the client named.
  const variantUploads: { edge: number; uploadUrl: string }[] = [];
  for (const edge of parsed.data.variants) {
    const variantUpload = await createUploadUrl(siteAssetPath(wedding.id, assetId, edge));
    if (variantUpload) variantUploads.push({ edge, uploadUrl: variantUpload.signedUrl });
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

  return ok({ assetId, uploadUrl: upload.signedUrl, variantUploads });
}

const confirmSchema = z.object({
  asset_id: z.string().uuid(),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
  alt: z.string().trim().max(300).optional(),
  // Which narrower copies actually arrived — a copy whose PUT failed is simply
  // not listed, so a `srcset` can never name a file that is not there.
  variants: z
    .array(z.coerce.number().int())
    .max(SITE_IMAGE_WIDTHS.length)
    .default([])
    .transform((widths) => [...new Set(widths)].filter(isSiteImageWidth)),
  // Lower-case hex only: the database check says so, and it ends up in a style
  // attribute, so it is validated here rather than trusted from a form.
  colour: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .optional()
    .catch(undefined),
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
      variants: parsed.data.variants,
      colour: parsed.data.colour ?? null,
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
