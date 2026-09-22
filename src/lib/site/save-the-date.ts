import { householdPath, type HouseholdAddress } from "./household-slug";
import type { SiteAssetKind } from "@/lib/types/database";

/**
 * The save-the-date page: `/w/<wedding>/<household>/save-the-date`.
 *
 * Per household, not one shared link, because the planner wants to see who
 * opened it — and a shared URL can only ever say how many times. It hangs off
 * the household's own address, so the five-character suffix is the credential
 * here exactly as it is for the invitation.
 */
export function saveTheDatePath(weddingSlug: string, address: HouseholdAddress): string {
  return `${householdPath(weddingSlug, address)}/save-the-date`;
}

/** How many photographs the page shows. One lead, then a row beneath it. */
export const SAVE_THE_DATE_PHOTO_LIMIT = 5;

type PhotoCandidate = {
  id: string;
  kind: SiteAssetKind;
  sort_order: number;
  uploaded_by_household: string | null;
};

const KIND_ORDER: Partial<Record<SiteAssetKind, number>> = { hero: 0, story: 1, gallery: 2 };

/**
 * Which of the site's photographs the save-the-date shows, in order.
 *
 * The couple's own only. A guest's upload to the gallery is theirs to share on
 * the wedding site after the fact; it is not something to put on the card that
 * announces the wedding to everyone else. The hero leads, because it is the
 * photograph the couple already chose to open with.
 */
export function pickSaveTheDatePhotos<T extends PhotoCandidate>(
  rows: readonly T[],
  limit = SAVE_THE_DATE_PHOTO_LIMIT,
): T[] {
  return rows
    .filter((row) => row.uploaded_by_household === null && KIND_ORDER[row.kind] !== undefined)
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.sort_order - b.sort_order,
    )
    .slice(0, limit);
}
