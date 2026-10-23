"use server";

import { requireWedding } from "@/server/queries/wedding";
import { fetchPage } from "@/lib/net/fetch-page";
import { extractMetadata } from "@/lib/registry/metadata";
import { isWebUrl, storeFromUrl } from "@/lib/registry/items";
import { fail, ok, type ActionResult } from "./result";

export type LinkPreview = {
  title: string | null;
  description: string | null;
  store: string | null;
  /** NZD cents, only when the page said NZD (or didn't say). */
  priceMinor: number | null;
  /** Candidate hero images, absolute https URLs. Suggestions only; nothing is stored. */
  images: string[];
  finalUrl: string;
};

/**
 * "Paste a link" autofill (spec 36 §5.3). Planner-only (`requireWedding`),
 * because it makes the server fetch an address a person typed.
 *
 * Writes nothing. The form is pre-filled for the owner to correct, and a
 * picture is only stored after they tap it (see `/api/registry/import-image`).
 * When the shop blocks us this returns a plain failure and the form stays empty
 * — the feature is allowed to fail, and nothing depends on it.
 */
export async function previewRegistryLink(rawUrl: string): Promise<ActionResult<LinkPreview>> {
  await requireWedding();
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!isWebUrl(url)) return fail("That doesn't look like a web address.");

  const page = await fetchPage(url);
  if (!page.ok) return fail(`${page.reason} You can type the details in instead.`);

  const meta = extractMetadata(page.html, page.finalUrl);
  if (!meta.title && meta.images.length === 0 && meta.priceMinor === null) {
    return fail("That shop didn't tell us anything about the item. You can type the details in instead.");
  }
  return ok({
    title: meta.title,
    description: meta.description,
    store: meta.siteName ?? storeFromUrl(page.finalUrl),
    priceMinor: meta.priceMinor,
    images: meta.images,
    finalUrl: page.finalUrl,
  });
}
