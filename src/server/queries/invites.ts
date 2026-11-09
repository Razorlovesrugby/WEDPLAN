import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GuestEventInviteView } from "@/lib/types/database";

/** The API's row cap (`max_rows`). */
const PAGE = 1000;

/**
 * Who is invited to what (spec 22 §4).
 *
 * One read of `v_guest_event_invites`, which is the only place the
 * household-versus-override `coalesce` is written. Everything that needs to
 * know — the grid, the household screen, the public page, the senders — comes
 * through here rather than reading `invitation_events` and
 * `guest_event_overrides` and doing the arithmetic again.
 */
export const listInvites = cache(async (weddingId: string): Promise<GuestEventInviteView[]> => {
  const supabase = await createClient();
  // One row per guest per event, so a big wedding passes the API's 1000-row
  // cap (250 guests × 5 events). Read it in pages, in a fixed order.
  const rows: GuestEventInviteView[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("v_guest_event_invites")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("guest_id")
      .order("event_id")
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Could not load invitations: ${error.message}`);
    rows.push(...((data ?? []) as GuestEventInviteView[]));
    if (!data || data.length < PAGE) return rows;
  }
});

/** The same rows for one household, for its own screen and its own page. */
export const listHouseholdInvites = cache(
  async (weddingId: string, householdId: string): Promise<GuestEventInviteView[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_guest_event_invites")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId);

    if (error) throw new Error(`Could not load invitations: ${error.message}`);
    return (data ?? []) as GuestEventInviteView[];
  },
);
