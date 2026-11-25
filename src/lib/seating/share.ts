/**
 * Seating share links (spec 57 E.3): the rules for a passcode and an expiry,
 * and the text a couple sees. The hashing lives on the server
 * (`src/server/seating-share.ts`); nothing here touches a secret. Pure.
 */

export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 12;

/** What the Share dialog says, and what the public page says first. */
export const SHARE_WARNING = "Anyone with this link sees guests' names and dietary needs.";

export type ShareInput = { passcode: string | null; expiresAt: string | null; label: string | null };

/** Reads what the form sent. Blank is "none". Says what's wrong rather than guessing. */
export function parseShareInput(raw: { passcode?: unknown; expires?: unknown; label?: unknown }, now: Date = new Date()): { ok: true; value: ShareInput } | { ok: false; error: string } {
  const passcode = typeof raw.passcode === "string" ? raw.passcode.trim() : "";
  if (passcode !== "" && (passcode.length < PASSCODE_MIN || passcode.length > PASSCODE_MAX)) {
    return { ok: false, error: `A passcode is ${PASSCODE_MIN} to ${PASSCODE_MAX} characters, or leave it empty.` };
  }
  let expiresAt: string | null = null;
  const expires = typeof raw.expires === "string" ? raw.expires.trim() : "";
  if (expires !== "") {
    // A date: the link works through the end of that day (UTC; a day either way hardly matters for an expiry).
    const t = Date.parse(`${expires}T23:59:59Z`);
    if (!Number.isFinite(t)) return { ok: false, error: "That isn't a date." };
    if (t <= now.getTime()) return { ok: false, error: "Pick a day that hasn't passed." };
    expiresAt = new Date(t).toISOString();
  }
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  return { ok: true, value: { passcode: passcode === "" ? null : passcode, expiresAt, label: label === "" ? null : label } };
}

export type ShareStatus = "ok" | "passcode_required" | "wrong_passcode" | "locked" | "gone";

/** What the public page tells someone whose link doesn't open. Never says whether a link ever existed. */
export function shareRefusal(status: ShareStatus): string {
  switch (status) {
    case "passcode_required":
      return "This plan needs a passcode.";
    case "wrong_passcode":
      return "That passcode isn't right.";
    case "locked":
      return "Too many tries. Wait a few minutes and try again.";
    default:
      return "This link isn't working. Ask the couple for a new one.";
  }
}

/** A link's state for the list: live, expired or revoked. */
export function shareLinkState(link: { revoked_at: string | null; expires_at: string | null }, now: Date = new Date()): "live" | "expired" | "revoked" {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && Date.parse(link.expires_at) <= now.getTime()) return "expired";
  return "live";
}
