import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { signPaths } from "@/lib/supabase/storage";
import { hashClientIp, hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { shareIsLive } from "@/lib/moodboards";
import type { MoodboardItemRow, MoodboardRow, MoodboardShareRow } from "@/lib/types/database";

/**
 * Turning a token in a URL into exactly one moodboard.
 *
 * This is the second place in the app where an unauthenticated request
 * reaches data, and it follows src/server/rsvp/resolve.ts exactly, because
 * that file's rule is the whole defence:
 *
 *   The token resolves to one moodboard_id and one wedding_id, and every
 *   subsequent query is constrained to BOTH. Nothing downstream accepts a
 *   board id from the client, ever.
 *
 * The service role bypasses RLS, so nothing else is protecting this. The
 * composite foreign keys are the backstop: even a mistake here cannot reach
 * another wedding's rows.
 *
 * Throttling reuses rsvp_token_attempts, which holds an IP hash, a flag and a
 * timestamp and deliberately no wedding and no token — so it needs no schema
 * change to count a second kind of failed lookup. A scanner guessing share
 * tokens therefore also burns its RSVP budget, which is the right outcome.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_WINDOW = 10;

export type PublicItem = {
  id: string;
  caption: string | null;
  /** Only present when the share says show_notes. Absent, not empty. */
  note: string | null;
  credit: string | null;
  source_url: string | null;
  width: number | null;
  height: number | null;
  displayUrl: string | null;
  thumbUrl: string | null;
};

export type PublicBoard = {
  board: Pick<MoodboardRow, "id" | "title" | "description">;
  items: PublicItem[];
  showCredits: boolean;
};

export type ShareResolution =
  | { ok: true; share: MoodboardShareRow; board: PublicBoard }
  | { ok: false };

async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return hashClientIp(ip);
}

/** Fails open on a database error, same as the RSVP throttle and for the same reason. */
async function isThrottled(ipHash: string): Promise<boolean> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await supabase
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("succeeded", false)
    .gte("attempted_at", since);

  if (error) return false;
  return (count ?? 0) >= MAX_FAILURES_PER_WINDOW;
}

async function recordAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded });
}

/**
 * Builds what a viewer is allowed to see.
 *
 * `note` is dropped here rather than in the template. A private note that is
 * filtered out in JSX is a private note that ships to the browser in the RSC
 * payload and is one "view source" away; dropping it at the query boundary
 * means it never leaves the server.
 */
export async function buildPublicBoard(
  weddingId: string,
  moodboardId: string,
  options: { showNotes: boolean; showCredits: boolean },
): Promise<PublicBoard | null> {
  const supabase = createAdminClient();

  const { data: board } = await supabase
    .from("moodboards")
    .select("id, title, description")
    .eq("wedding_id", weddingId)
    .eq("id", moodboardId)
    .is("archived_at", null)
    .maybeSingle();

  if (!board) return null;

  const { data: rows } = await supabase
    .from("moodboard_items")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("moodboard_id", moodboardId)
    .not("uploaded_at", "is", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const items: MoodboardItemRow[] = rows ?? [];
  const signed = await signPaths(items.flatMap((item) => [item.storage_path, item.thumb_path]));

  return {
    board,
    showCredits: options.showCredits,
    items: items.map((item) => ({
      id: item.id,
      caption: item.caption,
      note: options.showNotes ? item.note : null,
      credit: options.showCredits ? item.credit : null,
      source_url: options.showCredits ? item.source_url : null,
      width: item.width,
      height: item.height,
      displayUrl: signed.get(item.storage_path) ?? null,
      thumbUrl: signed.get(item.thumb_path) ?? signed.get(item.storage_path) ?? null,
    })),
  };
}

/** /m/{token}. One failure page for every reason, so nothing is confirmed. */
export async function resolveShare(rawToken: string): Promise<ShareResolution> {
  if (!looksLikeToken(rawToken)) return { ok: false };

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) return { ok: false };

  const supabase = createAdminClient();
  const { data: share } = await supabase
    .from("moodboard_shares")
    .select("*")
    .eq("token_hash", hashInviteToken(rawToken))
    .eq("channel", "link")
    .maybeSingle();

  if (!share) {
    await recordAttempt(ipHash, false);
    return { ok: false };
  }

  // A revoked or expired share is not a "wrong token", but it renders the
  // same page and does not count against the throttle: the person holding it
  // was given it legitimately.
  if (!shareIsLive(share)) {
    await recordAttempt(ipHash, true);
    return { ok: false };
  }

  await recordAttempt(ipHash, true);

  const board = await buildPublicBoard(share.wedding_id, share.moodboard_id, {
    showNotes: share.show_notes,
    showCredits: share.show_credits,
  });
  if (!board) return { ok: false };

  // Two integers, and nothing else. No IP, no user agent, no per-view row —
  // the question worth answering is "did they open it" (spec 9 section 9).
  await supabase
    .from("moodboard_shares")
    .update({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", share.id);

  return { ok: true, share, board };
}

/**
 * Boards published to /w or to /rsvp/{token}.
 *
 * Neither channel carries a token of its own: the page they appear on has
 * already established who is looking — /w is public by definition, and an
 * RSVP page has already resolved a household's invitation token. Notes are
 * never shown on either, whatever the row says, because there is no labelled
 * recipient to trust.
 */
export async function listPublishedBoards(
  weddingId: string,
  channel: "public_site" | "rsvp",
): Promise<PublicBoard[]> {
  const supabase = createAdminClient();
  const { data: shares } = await supabase
    .from("moodboard_shares")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("channel", channel)
    .is("revoked_at", null);

  const live = (shares ?? []).filter((share) => shareIsLive(share));
  const boards: PublicBoard[] = [];

  for (const share of live) {
    const board = await buildPublicBoard(weddingId, share.moodboard_id, {
      showNotes: false,
      showCredits: share.show_credits,
    });
    if (board && board.items.length > 0) boards.push(board);
  }

  return boards;
}
