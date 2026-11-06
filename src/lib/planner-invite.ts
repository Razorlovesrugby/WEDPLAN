/**
 * The planner's invite link (spec 39 part C). Pure, so the shape of the one
 * URL that lets a stranger set a password on a new account is unit-tested.
 *
 * `token_hash` comes from Supabase's admin `generateLink`; `/auth/callback`
 * verifies it and starts a session, then sends them to `/reset-password` to
 * choose a password. "invite" is for an address with no account yet,
 * "recovery" for one that already has one.
 */

export type InviteLinkType = "invite" | "recovery";

export function isInviteLinkType(value: unknown): value is InviteLinkType {
  return value === "invite" || value === "recovery";
}

/** A path (not an absolute URL) so the caller decides the origin. */
export function plannerInvitePath(tokenHash: string, type: InviteLinkType): string {
  const query = new URLSearchParams({ token_hash: tokenHash, type, next: "/reset-password" });
  return `/auth/callback?${query.toString()}`;
}

/** Deliberately loose: the provider is the real validator. This only catches typos before an admin call is spent. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
