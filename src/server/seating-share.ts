import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShareStatus } from "@/lib/seating/share";

/**
 * The server half of seating share links (spec 57 E.3). A token is shown to
 * the couple once and only its SHA-256 is stored; a passcode is stored as a
 * hash of the token and the passcode together, so the same passcode on two
 * links doesn't match. Whether a link opens is the database's answer
 * (`seating_share_check`), never this file's.
 */

export const newToken = () => randomBytes(32).toString("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashToken = (token: string) => sha(token);
export const hashPasscode = (token: string, passcode: string) => sha(`${token}:${passcode}`);

const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{40,64}$/.test(t);

/** The cookie that holds a passcode's hash for one link, so it isn't asked for on every page. */
const cookieName = (token: string) => `wp_share_${hashToken(token).slice(0, 12)}`;

export async function rememberPasscode(token: string, passcode: string): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(token), hashPasscode(token, passcode), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/p", maxAge: 12 * 60 * 60 });
}

export type ShareCheck = { status: ShareStatus; eventId: string | null; weddingId: string | null };

/** Asks the database whether this token (with the passcode this browser has given) opens, and for which event. */
export async function checkShare(token: string, passcode?: string): Promise<ShareCheck> {
  if (!looksLikeToken(token)) return { status: "gone", eventId: null, weddingId: null };
  let hash: string | null = passcode ? hashPasscode(token, passcode) : null;
  if (!hash) {
    const jar = await cookies();
    hash = jar.get(cookieName(token))?.value ?? null;
  }
  const { data, error } = await createAdminClient().rpc("seating_share_check", { p_token_hash: hashToken(token), p_passcode_hash: hash });
  const row = data?.[0];
  if (error || !row) return { status: "gone", eventId: null, weddingId: null };
  return { status: row.status as ShareStatus, eventId: row.event_id, weddingId: row.wedding_id };
}
