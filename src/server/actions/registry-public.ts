"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken, hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { claimSchema, isHoneypotTripped, outcomeMessage, type ClaimOutcome } from "@/lib/registry/claim";
import { addressLines } from "@/lib/registry/address";
import { buyerMayRelease, isClaimStatus } from "@/lib/registry/status";
import { fail, ok, type ActionResult } from "./result";

/**
 * The visitor's side of the registry (spec 36 §6) — the only place a stranger
 * can write anything.
 *
 * No session, so the service role; scoping comes from resolving the wedding by
 * its public slug and passing `wedding_id` AND `item_id` to
 * `claim_registry_item()`, which refuses an item that isn't that wedding's.
 *
 * **What comes back is the caller's own claim and nothing else.** The result
 * carries the buyer's private token (their undo link), the delivery address and
 * the couple's thanks — never another claim, never a count of claims, never a
 * name. `registry-public.test.ts` pins that.
 *
 * The write is a button press, never a page load: a mail scanner or link
 * previewer that fetches the registry URL must not be able to claim anything.
 */

export type ClaimReceipt = {
  /** The buyer's private undo link is `/registry/claim/<token>`. Shown once. */
  token: string;
  itemTitle: string;
  buyUrl: string;
  address: string[];
  courierNote: string | null;
  thanksText: string | null;
  thanksImageUrl: string | null;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export async function claimRegistryItem(fields: Record<string, unknown>): Promise<ActionResult<ClaimReceipt>> {
  const slug = typeof fields.slug === "string" ? fields.slug : "";
  if (!SLUG.test(slug)) return fail(outcomeMessage("unavailable") as string);

  const parsed = claimSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  // A bot filled the hidden field. Say nothing useful.
  if (isHoneypotTripped(parsed.data)) return fail(outcomeMessage("unavailable") as string);

  const admin = createAdminClient();
  const { data: wedding } = await admin.from("weddings").select("id").eq("slug", slug).maybeSingle();
  if (!wedding) return fail(outcomeMessage("unavailable") as string);

  const token = generateInviteToken();
  const { data, error } = await admin.rpc("claim_registry_item", {
    p_wedding_id: wedding.id,
    p_item_id: parsed.data.item_id,
    p_name: parsed.data.name,
    p_message: parsed.data.message,
    p_quantity: parsed.data.quantity,
    p_token_hash: hashInviteToken(token),
  });
  if (error) return fail("That didn't go through. Please try again.");

  const result = Array.isArray(data) ? data[0] : data;
  const outcome = (result?.outcome ?? "unavailable") as ClaimOutcome;
  if (outcome !== "ok") return fail(outcomeMessage(outcome, result?.remaining ?? 0) as string);

  revalidatePath("/gifts", "layout");
  revalidatePath("/");
  return ok(await buildReceipt(wedding.id, parsed.data.item_id, token));
}

async function buildReceipt(weddingId: string, itemId: string, token: string): Promise<ClaimReceipt> {
  const admin = createAdminClient();
  const [item, settings, shipping] = await Promise.all([
    admin.from("registry_items").select("title, url").eq("wedding_id", weddingId).eq("id", itemId).maybeSingle(),
    admin.from("registry_settings").select("thanks_text, thanks_asset_id").eq("wedding_id", weddingId).maybeSingle(),
    admin.from("registry_shipping").select("*").eq("wedding_id", weddingId).maybeSingle(),
  ]);
  return {
    token,
    itemTitle: item.data?.title ?? "your gift",
    buyUrl: item.data?.url ?? "",
    address: addressLines(shipping.data),
    courierNote: shipping.data?.courier_note ?? null,
    thanksText: settings.data?.thanks_text ?? null,
    thanksImageUrl: settings.data?.thanks_asset_id ? `/api/photo/${settings.data.thanks_asset_id}?w=960` : null,
  };
}

/** What the private claim page shows its owner. */
export type OwnClaim = {
  receipt: Omit<ClaimReceipt, "token">;
  name: string;
  message: string | null;
  quantity: number;
  released: boolean;
  canRelease: boolean;
  slug: string;
};

/** Resolve a buyer's private token. Null for anything unknown or malformed — no oracle. */
export async function loadOwnClaim(token: string): Promise<OwnClaim | null> {
  if (!looksLikeToken(token)) return null;
  const admin = createAdminClient();
  const { data: claim } = await admin
    .from("registry_claims")
    .select("wedding_id, item_id, name, message, quantity, status, released_at")
    .eq("claim_token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!claim || !isClaimStatus(claim.status)) return null;

  const [receipt, wedding] = await Promise.all([
    buildReceipt(claim.wedding_id, claim.item_id, token),
    admin.from("weddings").select("slug").eq("id", claim.wedding_id).maybeSingle(),
  ]);
  const { token: _token, ...rest } = receipt;
  void _token;
  return {
    receipt: rest,
    name: claim.name,
    message: claim.message,
    quantity: claim.quantity,
    released: claim.released_at !== null,
    canRelease: buyerMayRelease(claim.status, claim.released_at),
    slug: wedding.data?.slug ?? "",
  };
}

/** A buyer undoing their own claim, by the token only they hold. */
export async function releaseOwnClaim(token: string): Promise<ActionResult<{ slug: string }>> {
  if (!looksLikeToken(token)) return fail("That link isn't valid");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("release_registry_claim", { p_token_hash: hashInviteToken(token) });
  if (error) return fail("That didn't go through. Please try again.");
  if (data !== true) return fail("This one can't be released any more — the couple have already marked it as arrived.");

  const own = await loadOwnClaim(token);
  revalidatePath("/gifts", "layout");
  revalidatePath("/");
  return ok({ slug: own?.slug ?? "" });
}
