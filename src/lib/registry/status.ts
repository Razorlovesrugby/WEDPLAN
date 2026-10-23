/**
 * What happens to a claim after it is made (spec 36 §7). The couple moves it
 * along; nothing expires on its own (Q5).
 */

export const CLAIM_STATUSES = ["claimed", "bought", "arrived", "thanked"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  claimed: "Claimed",
  bought: "Bought",
  arrived: "Arrived",
  thanked: "Thanked",
};

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function nextStatus(status: ClaimStatus): ClaimStatus | null {
  const index = CLAIM_STATUSES.indexOf(status);
  return CLAIM_STATUSES[index + 1] ?? null;
}

/** The timestamp column a status writes. `claimed` has none: it is `created_at`. */
export function statusColumn(status: ClaimStatus): "bought_at" | "arrived_at" | "thanked_at" | null {
  return status === "bought" ? "bought_at" : status === "arrived" ? "arrived_at" : status === "thanked" ? "thanked_at" : null;
}

/** A buyer may only undo before the gift exists (matches `release_registry_claim`). */
export function buyerMayRelease(status: ClaimStatus, releasedAt: string | null): boolean {
  return releasedAt === null && (status === "claimed" || status === "bought");
}

type ClaimLike = { status: ClaimStatus; released_at: string | null };

/** Live claims: not released. */
export const isLive = (claim: ClaimLike): boolean => claim.released_at === null;

/** "Needs a thank-you": it has arrived and the couple haven't thanked them yet. */
export const needsThanks = (claim: ClaimLike): boolean => isLive(claim) && claim.status === "arrived";

/** Dashboard: claimed but not yet arrived. */
export const awaitingArrival = (claim: ClaimLike): boolean =>
  isLive(claim) && (claim.status === "claimed" || claim.status === "bought");
