import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdRsvpView, HouseholdView } from "@/lib/types/database";

export type InvitationListItem = {
  household: HouseholdView;
  summary: HouseholdRsvpView | null;
  invitationId: string | null;
  invitedEventIds: string[];
  remindersMuted: boolean;
  lastMessageAt: string | null;
};

export const listInvitations = cache(async (weddingId: string): Promise<InvitationListItem[]> => {
  const supabase = await createClient();

  const [households, summaries, invitations, messages] = await Promise.all([
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
  ]);

  if (households.error) throw new Error(households.error.message);

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
    };
  });
});
