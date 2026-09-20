import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { parseAddress, type HouseholdAddress } from "@/lib/site/household-slug";
import { clientIpHash, isThrottled, recordAttempt } from "./resolve";

/**
 * Turning `/w/<wedding>/<slug>-<suffix>` into exactly one household (spec 21).
 *
 * This is the second unauthenticated path into a wedding's data, alongside
 * `resolveInvitation()`, and it obeys the same rule that one does:
 *
 *   The address resolves to one household_id and one wedding_id, and every
 *   subsequent query is constrained to BOTH. Nothing downstream accepts a
 *   household id from the client, ever.
 *
 * Two things are worth being explicit about.
 *
 * **The suffix is the credential.** The readable half is a surname anyone
 * could guess; the five random characters are what stands between a guess and
 * a household's guest list, dietary notes and RSVP form (spec 21 §3). That is
 * why a failed lookup here costs a throttle slot on the same
 * `rsvp_token_attempts` counter the token path uses — enumerating addresses
 * must not be cheaper than enumerating tokens.
 *
 * **What it returns is a household and a token, not a context.** The RSVP
 * context — guests, invited events, questions, existing answers, the
 * opened_at stamp — is loaded by `resolveInvitation()` exactly as it was
 * before this feature existed. One credential, two spellings; the page hands
 * the token to the same form and the same actions, none of which changed.
 */

export type AddressResolution =
  | {
      kind: "ok";
      household: { id: string; display_name: string };
      address: HouseholdAddress;
      /**
       * The household's live invitation token, or null when nothing has been
       * issued yet. Every household has an address from the moment it exists
       * (Q8), so the address can be opened before an invitation is created —
       * the page renders without the RSVP form rather than 404ing on a link
       * the planner just copied.
       */
      token: string | null;
    }
  /** A retired address. The page 301s to `to` (Q4). */
  | { kind: "redirect"; to: HouseholdAddress }
  | { kind: "not_found" }
  | { kind: "throttled" };

export async function resolveHouseholdAddress(
  weddingId: string,
  segment: string,
): Promise<AddressResolution> {
  const address = parseAddress(segment);
  // Shaped wrong, so it cannot be anyone's address. Refused before the
  // database and before it costs a throttle slot, like a malformed token.
  if (!address) return { kind: "not_found" };

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) return { kind: "throttled" };

  const supabase = createAdminClient();

  const { data: household } = await supabase
    .from("households")
    .select("id, display_name")
    .eq("wedding_id", weddingId)
    .eq("slug", address.slug)
    .eq("slug_suffix", address.suffix)
    .is("deleted_at", null)
    .maybeSingle();

  if (!household) {
    // Not a live address. It may still be one this household used to have,
    // in a message sent months ago — that redirects rather than 404ing.
    const { data: alias } = await supabase
      .from("household_slug_aliases")
      .select("household_id")
      .eq("wedding_id", weddingId)
      .eq("slug", address.slug)
      .eq("slug_suffix", address.suffix)
      .maybeSingle();

    if (alias) {
      const { data: current } = await supabase
        .from("households")
        .select("slug, slug_suffix")
        .eq("wedding_id", weddingId)
        .eq("id", alias.household_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (current) {
        await recordAttempt(ipHash, true);
        return {
          kind: "redirect",
          to: { slug: current.slug, suffix: current.slug_suffix },
        };
      }
    }

    // A cut household lands here too: the row survives (guest data is never
    // hard-deleted) but its page does not, and the answer is the same one a
    // wrong address gets. Distinguishing them would confirm which households
    // exist.
    await recordAttempt(ipHash, false);
    return { kind: "not_found" };
  }

  await recordAttempt(ipHash, true);

  const { data: invitation } = await supabase
    .from("invitations")
    .select("token_encrypted")
    .eq("wedding_id", weddingId)
    .eq("household_id", household.id)
    .is("deleted_at", null)
    .maybeSingle();

  // A token that will not decrypt means the pepper was rotated. The page is
  // still theirs to read; it just cannot take an RSVP until the invitation is
  // reissued, which is the same outcome `/rsvp/<token>` has always had.
  const token = invitation ? decryptToken(invitation.token_encrypted) : null;

  return { kind: "ok", household, address, token };
}

/**
 * The address a token belongs to (Q6).
 *
 * Every invitation sent before this feature existed points at `/i/<token>` or
 * `/rsvp/<token>`, and a printed QR code cannot be reissued. Those routes are
 * now permanent redirects, and this is what they redirect to.
 *
 * No throttle slot is spent: the token has already done the authenticating,
 * and a redirect that fails closed would strand a guest holding a perfectly
 * good invitation.
 */
export async function addressForToken(
  rawToken: string,
): Promise<{ weddingSlug: string; address: HouseholdAddress } | null> {
  if (!looksLikeToken(rawToken)) return null;

  const supabase = createAdminClient();
  const { data: invitation } = await supabase
    .from("invitations")
    .select("wedding_id, household_id")
    .eq("token_hash", hashInviteToken(rawToken))
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitation) return null;

  const [{ data: wedding }, { data: household }] = await Promise.all([
    supabase.from("weddings").select("slug").eq("id", invitation.wedding_id).maybeSingle(),
    supabase
      .from("households")
      .select("slug, slug_suffix")
      .eq("wedding_id", invitation.wedding_id)
      .eq("id", invitation.household_id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!wedding || !household) return null;

  return {
    weddingSlug: wedding.slug,
    address: { slug: household.slug, suffix: household.slug_suffix },
  };
}
