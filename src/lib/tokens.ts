import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { absoluteUrl, serverEnv } from "./env";

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

// ---------------------------------------------------------------------------
// Recovering a token
// ---------------------------------------------------------------------------
// Hashing alone would be a dead end. The planner needs the token back — to
// paste a link into WhatsApp for the relatives who don't do email, and to
// reprint a QR code without invalidating the invitation already in the post.
//
// So the token is also stored encrypted, under a key derived from the same
// pepper. The key never touches the database, so a dump still yields nothing;
// the difference from a plain hash is only that the application, holding the
// environment, can read it back.

import { createCipheriv, createDecipheriv } from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

/** 32 bytes from the pepper, domain-separated so it is not the hashing input. */
function encryptionKey(): Buffer {
  return createHash("sha256").update(`${serverEnv().INVITE_TOKEN_PEPPER}:token-encryption`).digest();
}

/** `iv.ciphertext.tag`, all base64url. */
export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()]
    .map((part) => part.toString("base64url"))
    .join(".");
}

/**
 * Returns null rather than throwing when the payload will not decrypt. That
 * happens for one foreseeable reason — the pepper was rotated — and the UI
 * should say "this link can't be recovered, reissue it" rather than crash.
 */
export function decryptToken(payload: string): string | null {
  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  const [ivPart, ciphertextPart, tagPart] = parts as [string, string, string];

  try {
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** The link a household actually follows. */
export function invitationUrl(token: string): string {
  return absoluteUrl(`/rsvp/${token}`);
}

// ---------------------------------------------------------------------------
// Moodboard shares and clip tokens
// ---------------------------------------------------------------------------
// Both reuse everything above — the same 32 bytes, the same hash-at-rest, the
// same encrypted copy so a link can be re-read without reissuing it. Three
// kinds of credential, one piece of machinery.
//
// ONE CONSEQUENCE, written down because it stops being obvious the moment it
// is not: INVITE_TOKEN_PEPPER now peppers all three. Rotating it invalidates
// every outstanding share link and every installed clipper as well as every
// outstanding invitation. Rotation was always break-glass; it is now slightly
// more glass.

/** The link a photographer or a guest follows to see a board. */
export function moodboardShareUrl(token: string): string {
  return absoluteUrl(`/m/${token}`);
}
