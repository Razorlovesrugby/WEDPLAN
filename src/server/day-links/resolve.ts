import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { clientIpHash, isThrottled, recordAttempt } from "@/server/rsvp/resolve";
import type { DayLinkRow } from "@/lib/types/database";

/**
 * Token → link, wedding and assignee (spec 54 §12), through the same
 * failed-lookup throttle as the RSVP path. A link is live while it is not
 * revoked and has not expired.
 */

export type DayAssignee =
  | { type: "vendor"; id: string }
  | { type: "guest"; id: string }
  | { type: "person"; id: string };

export type ResolvedDayLink = {
  link: DayLinkRow;
  assignee: DayAssignee;
  wedding: { id: string; name: string; timezone: string; wedding_date: string | null };
};

export type ResolveDayLinkResult =
  | { ok: true; context: ResolvedDayLink }
  | { ok: false; reason: "malformed" | "not_found" | "throttled" | "off" | "expired" };

export function assigneeOfLink(link: Pick<DayLinkRow, "vendor_id" | "guest_id" | "person_id">): DayAssignee {
  if (link.vendor_id) return { type: "vendor", id: link.vendor_id };
  if (link.guest_id) return { type: "guest", id: link.guest_id };
  return { type: "person", id: link.person_id! };
}

/** The assignee column a link's rows are keyed by on `run_sheet_item_assignees`. */
export function assigneeColumn(assignee: DayAssignee): "vendor_id" | "guest_id" | "person_id" {
  return `${assignee.type}_id`;
}

export async function resolveDayLink(rawToken: string): Promise<ResolveDayLinkResult> {
  if (!looksLikeToken(rawToken)) return { ok: false, reason: "malformed" };

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) return { ok: false, reason: "throttled" };

  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from("day_links")
    .select("*")
    .eq("token_hash", hashInviteToken(rawToken))
    .maybeSingle();

  if (!link) {
    await recordAttempt(ipHash, false);
    return { ok: false, reason: "not_found" };
  }
  // Successes aren't recorded: the throttle counts failures only, and a row per tap and per poll would grow without bound.

  if (link.revoked_at) return { ok: false, reason: "off" };
  if (new Date(link.expires_at) <= new Date()) return { ok: false, reason: "expired" };

  const { data: wedding } = await supabase
    .from("weddings")
    .select("id, name, timezone, wedding_date")
    .eq("id", link.wedding_id)
    .maybeSingle();
  if (!wedding) return { ok: false, reason: "not_found" };

  return { ok: true, context: { link, assignee: assigneeOfLink(link), wedding } };
}
