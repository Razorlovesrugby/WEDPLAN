import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GuestEventInviteView } from "@/lib/types/database";

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
  const { data, error } = await supabase
    .from("v_guest_event_invites")
    .select("*")
    .eq("wedding_id", weddingId);

  if (error) throw new Error(`Could not load invitations: ${error.message}`);
  return (data ?? []) as GuestEventInviteView[];
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
