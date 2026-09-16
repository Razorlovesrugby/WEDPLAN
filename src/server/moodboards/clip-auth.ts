import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashClientIp, hashInviteToken, looksLikeToken } from "@/lib/tokens";

/**
 * Authenticating the Chrome extension.
 *
 * The supplied prototype spec had POST /api/clip take a JSON body and save
 * it, with no credential at all. Unauthenticated, that endpoint is an open
 * write into a metered storage bucket AND an SSRF proxy — see
 * docs/specs/09.1-pinterest-import-and-clipper.md section 3.
 *
 * So a clip carries a bearer token, one per browser, hashed at rest exactly
 * like an invitation. It resolves to ONE wedding, and every query downstream
 * is constrained to it; a board id in the payload is checked against that
 * wedding before anything is written, never trusted.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_WINDOW = 10;

export type ClipPrincipal = {
  tokenId: string;
  weddingId: string;
  defaultMoodboardId: string | null;
};

export type ClipAuthResult =
  | { ok: true; principal: ClipPrincipal }
  | { ok: false; status: 401 | 429; error: string };

/** `Authorization: Bearer <token>` — the shape /api/cron/reminders already uses. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

export function clientIpHashFrom(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return hashClientIp(ip);
}

export async function authenticateClip(headerList: Headers): Promise<ClipAuthResult> {
  const token = bearerToken(headerList.get("authorization"));
  const ipHash = clientIpHashFrom(headerList);
  const supabase = createAdminClient();

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error: throttleError } = await supabase
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("succeeded", false)
    .gte("attempted_at", since);

  // Fails open on an infrastructure error, same as the RSVP throttle: a
  // database hiccup must not stop the planner clipping, and the token is
  // what is really doing the work.
  if (!throttleError && (count ?? 0) >= MAX_FAILURES_PER_WINDOW) {
    return { ok: false, status: 429, error: "Too many attempts. Try again shortly." };
  }

  if (!token || !looksLikeToken(token)) {
    await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded: false });
    return { ok: false, status: 401, error: "This clipper isn't set up. Paste a clip token in its options." };
  }

  const { data: row } = await supabase
    .from("moodboard_clip_tokens")
    .select("id, wedding_id, default_moodboard_id, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (!row || row.revoked_at !== null) {
    await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded: false });
    return { ok: false, status: 401, error: "That clip token has been revoked. Create a new one in Settings." };
  }

  await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded: true });
  await supabase
    .from("moodboard_clip_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    ok: true,
    principal: {
      tokenId: row.id,
      weddingId: row.wedding_id,
      defaultMoodboardId: row.default_moodboard_id,
    },
  };
}
