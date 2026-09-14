import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { serverEnv } from "./env";

/**
 * Invitation tokens.
 *
 * The token is the only credential on the RSVP path — a household opens
 * /rsvp/{token} and can answer for itself, with no account to create. That
 * makes two properties load-bearing:
 *
 *   Entropy. 32 random bytes. Guessing one is not a realistic attack, which
 *   matters because the throttle can only slow an attacker down, not stop
 *   them enumerating forever.
 *
 *   Hashed at rest. What the database stores is sha256(token + pepper), so a
 *   dump of the invitations table is not a list of live RSVP links. The hash
 *   is deterministic, so lookup by token still works — this costs nothing.
 *
 * The pepper lives in the environment, not the database, so a SQL-injection
 * read of the table is not enough to reconstruct tokens offline. Rotating it
 * invalidates every outstanding invitation, which is the point: it is also
 * the break-glass if a dump leaks.
 */

/** A fresh token. Base64url, so it survives being pasted into WhatsApp. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The stored form of a token. Never store the token itself. */
export function hashInviteToken(token: string): string {
  return createHash("sha256")
    .update(`${token}${serverEnv().INVITE_TOKEN_PEPPER}`)
    .digest("hex");
}

/**
 * Tokens arrive from a URL segment, so reject anything that is not shaped
 * like one before it reaches the database. Cheap, and it keeps junk out of
 * the throttle table.
 */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/**
 * Client IPs are hashed before being stored for throttling. We need to count
 * attempts per origin, not to know who anyone is; storing raw addresses
 * against a wedding's guest list is data we have no reason to hold.
 */
export function hashClientIp(ip: string): string {
  return createHash("sha256")
    .update(`${ip}${serverEnv().INVITE_TOKEN_PEPPER}`)
    .digest("hex")
    .slice(0, 32);
}
