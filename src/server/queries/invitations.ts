import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdRsvpView, HouseholdView } from "@/lib/types/database";
import type { UnableVia } from "@/lib/unable-to-attend";

export type InvitationListItem = {
  household: HouseholdView;
  summary: HouseholdRsvpView | null;
  invitationId: string | null;
  invitedEventIds: string[];
  remindersMuted: boolean;
  lastMessageAt: string | null;
  /** Guests who have said they can't come (spec 29), by first name. */
  unableGuests: { id: string; name: string; via: UnableVia }[];
};

export const listInvitations = cache(async (weddingId: string): Promise<InvitationListItem[]> => {
  const supabase = await createClient();

  const [households, summaries, invitations, messages, flagged] = await Promise.all([
    supabase.from("v_households").select("*").eq("wedding_id", weddingId).order("rank"),
    supabase.from("v_household_rsvp").select("*").eq("wedding_id", weddingId),
    supabase
      .from("invitations")
      .select("id, household_id, invitation_events(event_id)")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null),
    supabase
      .from("message_log")
      .select("household_id, created_at")
      .eq("wedding_id", weddingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("guests")
      .select("id, household_id, first_name, preferred_name, unable_to_attend_via")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .not("unable_to_attend_at", "is", null)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (households.error) throw new Error(households.error.message);
  // The chip is a nicety on a table that works without it: a failed read here
  // must not take /invitations down with it.
  const unableByHousehold = new Map<string, InvitationListItem["unableGuests"]>();
  for (const guest of flagged.data ?? []) {
    if (!guest.unable_to_attend_via) continue;
    const list = unableByHousehold.get(guest.household_id) ?? [];
    list.push({
      id: guest.id,
      name: guest.preferred_name?.trim() || guest.first_name,
      via: guest.unable_to_attend_via,
    });
    unableByHousehold.set(guest.household_id, list);
  }

  const summaryByHousehold = new Map(
    (summaries.data ?? []).map((row) => [row.household_id, row as HouseholdRsvpView]),
  );
  const invitationByHousehold = new Map(
    (invitations.data ?? []).map((row) => [row.household_id, row]),
  );

  // Ordered newest first, so the first hit per household is the latest.
  const lastMessageByHousehold = new Map<string, string>();
  for (const message of messages.data ?? []) {
    if (message.household_id && !lastMessageByHousehold.has(message.household_id)) {
      lastMessageByHousehold.set(message.household_id, message.created_at);
    }
  }

  return ((households.data ?? []) as HouseholdView[]).map((household) => {
    const invitation = invitationByHousehold.get(household.id);
    return {
      household,
      summary: summaryByHousehold.get(household.id) ?? null,
      invitationId: invitation?.id ?? null,
      invitedEventIds: (invitation?.invitation_events ?? []).map((e) => e.event_id),
      remindersMuted: household.reminders_muted,
      lastMessageAt: lastMessageByHousehold.get(household.id) ?? null,
      unableGuests: unableByHousehold.get(household.id) ?? [],
    };
  });
});
