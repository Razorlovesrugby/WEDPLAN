/**
 * Who may publish without being read first (spec 25 §10, Answered question 3).
 *
 * ONE function, called by both write paths — the song form and the guestbook.
 * Two copies of this rule is how one of them quietly stops gating, and the
 * failure is silent: nothing breaks, a queue just stops filling and strangers'
 * words start appearing on a wedding site.
 *
 * The rule, and why it is not a compromise:
 *
 *   Spec 21 minted `households.slug_suffix` as a credential — five random
 *   characters, never changed by a rename, redrawn only by reissueInvitation.
 *   Somebody reading /w/ray-and-olivia/okonkwo-4f7ak was sent that address.
 *   They are an invited guest. Somebody on /w/ray-and-olivia is the internet.
 *
 * So the review queue only ever holds submissions from people who found the
 * public address, which is exactly the set worth looking at, and the common
 * case costs the couple nothing. Spec 23 cut both of these features BECAUSE
 * of the moderation load; this is the answer to that objection, and if it is
 * ever weakened both features should go back out with it.
 */

export type ContributionStatus = "new" | "approved" | "ignored";

/**
 * `householdId` is the household whose private page the contribution came
 * from, or null when it came from the shared site address.
 */
export function canPublishImmediately(householdId: string | null | undefined): boolean {
  return typeof householdId === "string" && householdId.length > 0;
}

/** The status a new contribution is born with. */
export function arrivalStatus(householdId: string | null | undefined): ContributionStatus {
  return canPublishImmediately(householdId) ? "approved" : "new";
}

/**
 * Whether a vote may be cast at all.
 *
 * Voting needs a household, always — without identity "one vote each" is a
 * cookie, and a cookie is a suggestion (Answered question 4). The database
 * agrees: `song_votes.household_id` is NOT NULL, so this function and the
 * schema fail in the same direction.
 */
export function canVote(householdId: string | null | undefined): boolean {
  return canPublishImmediately(householdId);
}

/**
 * What a reader is shown.
 *
 * Approved only, for everyone — including the household that wrote the thing
 * still sitting in the queue. Showing somebody their own unapproved note would
 * read as published, and they would tell people to go and look at it.
 */
export function isPublic(status: string): boolean {
  return status === "approved";
}
