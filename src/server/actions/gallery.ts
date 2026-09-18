"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWedding } from "@/server/queries/wedding";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import {
  MAX_UPLOADS_PER_HOUSEHOLD,
  MAX_UPLOAD_BYTES,
  isAcceptedUploadType,
  siteAssetPath,
} from "@/lib/site/assets";
import { flag } from "@/lib/site/sections";
import { fail, ok, type ActionResult } from "./result";

/**
 * Guest photo uploads, and the queue that moderates them (spec 14 §9).
 *
 * **Uploads are gated to `/rsvp/[token]`, never to the public site.** A guest
 * uploads from the link they already hold, so every photo is attributable to a
 * household and the open internet cannot post into the wedding's gallery. This
 * is the one place where insisting on the token instead of a public form pays
 * for itself immediately.
 *
 * Two phases, like the moodboard uploader: a row plus a signed URL, then a
 * confirmation once the bytes have landed. A row with no confirmation is a
 * failed upload rather than a broken tile.
 */

async function galleryPolicy(weddingId: string): Promise<{ open: boolean; auto: boolean }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", weddingId)
    .eq("block_key", "gallery")
    .maybeSingle();

  const payload = data?.payload ?? null;
  return {
    open: flag(payload, "uploads_open"),
    // Anything other than an explicit 'auto' means review. Defaulting the
    // other way would publish a stranger's photo on a mis-typed value.
    auto:
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)["moderation"] === "auto"
        : false,
  };
}

const requestSchema = z.object({
  token: z.string(),
  content_type: z.string().trim().max(100),
  byte_size: z.coerce.number().int().min(1),
});

export async function requestGuestUpload(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ assetId: string; uploadUrl: string }>> {
  const parsed = requestSchema.safeParse(fields);
  if (!parsed.success) return fail("That file can't be uploaded");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) return fail("That link isn't valid");
  const { wedding, household } = resolved.context;

  const policy = await galleryPolicy(wedding.id);
  if (!policy.open) return fail("Photo uploads aren't open yet.");

  if (!isAcceptedUploadType(parsed.data.content_type)) {
    return fail("Photos only, please — JPEG, PNG, WebP or HEIC.");
  }
  if (parsed.data.byte_size > MAX_UPLOAD_BYTES) {
    return fail("That photo's too big. Anything under 12MB is fine.");
  }

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("site_assets")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", wedding.id)
    .eq("uploaded_by_household", household.id);

  if ((count ?? 0) >= MAX_UPLOADS_PER_HOUSEHOLD) {
    return fail(`That's ${MAX_UPLOADS_PER_HOUSEHOLD} photos from your household — thank you!`);
  }

  const assetId = crypto.randomUUID();
  // Derived from ids the server has already checked. Never from the client.
  const path = siteAssetPath(wedding.id, assetId);

  const upload = await createUploadUrl(path);
  if (!upload) {
    return fail("Storage isn't reachable. Has scripts/ensure-bucket.mjs been run here?");
  }

  const { error } = await supabase.from("site_assets").insert({
    id: assetId,
    wedding_id: wedding.id,
    kind: "gallery",
    storage_path: path,
    uploaded_by_household: household.id,
    // Even on 'auto', approval waits for the bytes to land — see confirm.
    approved_at: null,
  });
  if (error) return fail(error.message);

  return ok({ assetId, uploadUrl: upload.signedUrl });
}

const confirmSchema = z.object({
  token: z.string(),
  asset_id: z.string().uuid(),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
});

export async function confirmGuestUpload(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ approved: boolean }>> {
  const parsed = confirmSchema.safeParse(fields);
  if (!parsed.success) return fail("That upload couldn't be finished");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) return fail("That link isn't valid");
  const { wedding, household } = resolved.context;

  const policy = await galleryPolicy(wedding.id);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("site_assets")
    .update({
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      // On 'auto' it appears now; on 'review' it waits. Set here rather than
      // at request time so a half-finished upload never becomes a live photo.
      approved_at: policy.auto ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.asset_id)
    .eq("wedding_id", wedding.id)
    // Scoped to the household that created it: a token cannot confirm
    // somebody else's row.
    .eq("uploaded_by_household", household.id);

  if (error) return fail(error.message);

  revalidatePath(`/rsvp/${parsed.data.token}`);
  revalidatePath("/gallery");
  return ok({ approved: policy.auto });
}

/**
 * A household removing its own photo.
 *
 * A hard delete of the object as well as the row, not a flag: somebody will
 * want a photo gone the same evening, and "hidden" is not what they asked for.
 */
export async function deleteGuestUpload(
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = z.object({ token: z.string(), asset_id: z.string().uuid() }).safeParse(fields);
  if (!parsed.success) return fail("That photo couldn't be removed");

  const resolved = await resolveInvitation(parsed.data.token);
  if (!resolved.ok) return fail("That link isn't valid");
  const { wedding, household } = resolved.context;

  const supabase = createAdminClient();
  const { data: asset } = await supabase
    .from("site_assets")
    .select("storage_path")
    .eq("id", parsed.data.asset_id)
    .eq("wedding_id", wedding.id)
    .eq("uploaded_by_household", household.id)
    .maybeSingle();

  if (!asset) return fail("That photo isn't yours to remove");

  await removePaths([asset.storage_path]);
  await supabase
    .from("site_assets")
    .delete()
    .eq("id", parsed.data.asset_id)
    .eq("wedding_id", wedding.id)
    .eq("uploaded_by_household", household.id);

  revalidatePath(`/rsvp/${parsed.data.token}`);
  revalidatePath("/gallery");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

export async function approveSiteAsset(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_assets")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateGallery();
  return ok(undefined);
}

export async function deleteSiteAsset(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("site_assets")
    .select("storage_path")
    .eq("id", id)
    .eq("wedding_id", wedding.id)
    .maybeSingle();

  const { error } = await supabase
    .from("site_assets")
    .delete()
    .eq("id", id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  // After the row, so a storage failure cannot leave a row pointing at
  // nothing — the row going first would strand the object instead, which is
  // the cheaper of the two to clean up but the harder one to notice.
  if (asset?.storage_path) await removePaths([asset.storage_path]);

  revalidateGallery();
  return ok(undefined);
}

function revalidateGallery() {
  revalidatePath("/gallery");
  revalidatePath("/w");
  revalidatePath("/w/[slug]", "page");
}
