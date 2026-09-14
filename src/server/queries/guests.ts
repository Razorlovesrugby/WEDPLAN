import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GuestFilters } from "@/lib/filters";
import type { GuestRow, HouseholdTier, HouseholdView, RsvpStatus } from "@/lib/types/database";

export type GuestListItem = GuestRow & {
  household_name: string;
  household_rank: string;
  household_address: string | null;
  tier: HouseholdTier;
  tag_ids: string[];
  rsvps: { event_id: string; status: RsvpStatus }[];
};

/**
 * Everything about the guests of one wedding, shaped for the table.
 *
 * Tier and the derived RSVP predicates are applied in TypeScript rather than
 * in the query. Tier lives in a view that PostgREST cannot embed into a guest
 * select, and "has any yes for any event" is awkward to express as a filter
 * without a second round trip.
 *
 * This is a deliberate ceiling, not an oversight: a wedding is hundreds of
 * guests, so one query plus an in-memory pass is faster than the alternatives
 * and far easier to read. If this ever needs to serve thousands, the fix is a
 * `v_guests` view with tier and response state already joined — the shape
 * returned here would not change.
 */
export const listGuests = cache(
  async (weddingId: string, filters: GuestFilters): Promise<GuestListItem[]> => {
    const supabase = await createClient();

    const [{ data: guests, error }, { data: households, error: householdError }] = await Promise.all([
      supabase
        .from("guests")
        .select(
          "*, households(display_name, rank, address), guest_tags(tag_id), rsvps(event_id, status)",
        )
        .eq("wedding_id", weddingId)
        .is("deleted_at", null),
      supabase.from("v_households").select("*").eq("wedding_id", weddingId),
    ]);

    if (error) throw new Error(`Could not load guests: ${error.message}`);
    if (householdError) throw new Error(`Could not load tiers: ${householdError.message}`);

    const tierByHousehold = new Map<string, HouseholdTier>(
      ((households ?? []) as HouseholdView[]).map((h) => [h.id, h.tier]),
    );

    const rows: GuestListItem[] = (guests ?? []).map((guest) => ({
      ...guest,
      household_name: guest.households?.display_name ?? "—",
      household_rank: guest.households?.rank ?? "",
      household_address: guest.households?.address ?? null,
      tier: tierByHousehold.get(guest.household_id) ?? "C",
      tag_ids: (guest.guest_tags ?? []).map((t) => t.tag_id),
      rsvps: guest.rsvps ?? [],
    }));

    return sortGuests(rows.filter((guest) => matches(guest, filters)), filters.sort);
  },
);

function matches(guest: GuestListItem, filters: GuestFilters): boolean {
  if (filters.tier && guest.tier !== filters.tier) return false;
  if (filters.age && guest.age_band !== filters.age) return false;
  if (filters.side && guest.side !== filters.side) return false;
  if (filters.tag && !guest.tag_ids.includes(filters.tag)) return false;

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      guest.first_name,
      guest.last_name,
      guest.preferred_name,
      guest.email,
      guest.household_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (filters.missing === "email" && guest.email) return false;
  if (filters.missing === "dietary" && guest.dietary) return false;
  if (filters.missing === "address" && guest.household_address) return false;

  if (filters.rsvp) {
    const relevant = filters.event
      ? guest.rsvps.filter((r) => r.event_id === filters.event)
      : guest.rsvps;

    if (filters.rsvp === "pending") {
      // Pending means "no answer yet", which includes a guest who has no rsvp
      // row at all — an invitation that has not been sent for this event.
      if (relevant.length > 0 && relevant.every((r) => r.status !== "pending")) return false;
    } else if (!relevant.some((r) => r.status === filters.rsvp)) {
      return false;
    }
  }

  return true;
}

function sortGuests(guests: GuestListItem[], sort: GuestFilters["sort"]): GuestListItem[] {
  const byName = (a: GuestListItem, b: GuestListItem) =>
    `${a.last_name ?? ""} ${a.first_name}`.localeCompare(`${b.last_name ?? ""} ${b.first_name}`, "en-GB");

  return [...guests].sort((a, b) => {
    if (sort === "household") return a.household_name.localeCompare(b.household_name, "en-GB") || byName(a, b);
    // Rank is byte-ordered to match Postgres — plain comparison, not locale.
    if (sort === "rank") return (a.household_rank < b.household_rank ? -1 : a.household_rank > b.household_rank ? 1 : 0) || byName(a, b);
    return byName(a, b);
  });
}

export const getGuest = cache(async (weddingId: string, guestId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .select(
      "*, households(id, display_name, address, rank), guest_tags(tag_id), rsvps(id, event_id, status, responded_at)",
    )
    .eq("wedding_id", weddingId)
    .eq("id", guestId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Could not load guest: ${error.message}`);
  return data;
});

export const getHousehold = cache(async (weddingId: string, householdId: string) => {
  const supabase = await createClient();

  const [household, guests, invitation, summary] = await Promise.all([
    supabase
      .from("v_households")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("id", householdId)
      .maybeSingle(),
    supabase
      .from("guests")
      .select("*, rsvps(event_id, status, responded_at)")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("invitations")
      .select("*, invitation_events(event_id)")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("v_household_rsvp")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId)
      .maybeSingle(),
  ]);

  if (household.error) throw new Error(`Could not load household: ${household.error.message}`);
  if (guests.error) throw new Error(`Could not load household guests: ${guests.error.message}`);

  return {
    household: household.data as HouseholdView | null,
    guests: guests.data ?? [],
    invitation: invitation.data ?? null,
    summary: summary.data ?? null,
  };
});

/** The ranked list for the drag screen and the waitlist suggestions. */
export const listHouseholds = cache(async (weddingId: string): Promise<HouseholdView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_households")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("rank", { ascending: true });

  if (error) throw new Error(`Could not load households: ${error.message}`);
  return (data ?? []) as HouseholdView[];
});
