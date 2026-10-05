import { isSiteImageWidth, type SiteImageVariant } from "./assets";

/**
 * Who may be shown a photograph at `/api/photo/<id>` (spec 27 D3).
 *
 * The route is public and its answer is a redirect to a signed URL, so these
 * rules are the whole of its access control. They live here, pure, so the part
 * that decides what a stranger can reach is tested without a database.
 *
 *   A stranger may be shown a photograph only if
 *     - it has been approved (anything awaiting moderation is not public, whoever
 *       uploaded it), AND
 *     - either a guest uploaded it (and it was approved — the gallery), or the
 *       latest **published** revision refers to it.
 *
 *   A draft is therefore not reachable: a photograph the planner has chosen for
 *   a block they have not published is shown to *them* (their own session, which
 *   the route checks first) and to nobody else.
 */

type PublicFacts = {
  approved_at: string | null;
  uploaded_by_household: string | null;
};

/** Does the published revision's `blocks` mention this asset anywhere? */
export function revisionReferences(blocks: unknown, assetId: string): boolean {
  if (!assetId) return false;
  try {
    // The id appears wherever a block uses a photograph — `image_id`, a
    // photograph background in `style`, a row nested inside a payload — so look
    // for the id itself rather than enumerate every place it can be.
    return JSON.stringify(blocks ?? []).includes(assetId);
  } catch {
    return false;
  }
}

export function mayServePublicly(asset: PublicFacts, publishedReferences: boolean): boolean {
  if (!asset.approved_at) return false;
  return asset.uploaded_by_household !== null || publishedReferences;
}

/**
 * Which file to sign. A narrower copy is used only when it exists; asking for
 * one that does not falls back to the original rather than 404ing, so an older
 * `srcset` never becomes a broken image.
 */
export function chooseVariant(requested: number | null, available: number[] | null): SiteImageVariant {
  if (requested !== null && isSiteImageWidth(requested) && (available ?? []).includes(requested)) {
    return requested;
  }
  return "display";
}

/** `?w=` → a width, null for none, `undefined` for something that is not a valid request. */
export function parseWidth(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  const width = Number(raw);
  return isSiteImageWidth(width) ? width : undefined;
}
