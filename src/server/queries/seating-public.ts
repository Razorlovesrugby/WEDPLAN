import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestName } from "@/lib/seating/model";

/** One event's answer to "where am I sitting?" for one household (spec 33 Part F). */
export type HouseholdSeating = {
  eventId: string;
  eventName: string;
  revealAt: string | null;
  /** True once the reveal date has passed. The preview shows it before then, labelled. */
  revealed: boolean;
  members: {
    guestId: string;
    name: string;
    table: string;
    /** 1-based, or null when no chair has been chosen. */
    seat: number | null;
    /** Other people at the same table, outside this household. Only drawn if the block asks. */
    tablemates: string[];
  }[];
};

/**
 * Where this household is sitting, event by event.
 *
 * The household's page has no signed-in user, so this reads with the service
 * role — and so it is narrowed by hand, the way every public loader here is:
 * this household's own active guests, the tables THEY sit at, and the names at
 * those tables. Nothing else about the plan leaves the database.
 *
 * Outside the preview, an event appears only once its `reveal_at` has passed
 * (Q11: before then the block draws nothing at all).
 */
export async function getHouseholdSeating(
  weddingId: string,
  householdId: string,
  options: { preview?: boolean } = {},
): Promise<HouseholdSeating[]> {
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from("guests")
    .select("id, first_name, last_name, preferred_name")
    .eq("wedding_id", weddingId)
    .eq("household_id", householdId)
    .is("deleted_at", null);
  if (!members || members.length === 0) return [];

  const { data: seats } = await supabase
    .from("seat_assignments")
    .select("guest_id, event_id, table_id, seat_index")
    .eq("wedding_id", weddingId)
    .in(
      "guest_id",
      members.map((m) => m.id),
    );
  if (!seats || seats.length === 0) return [];

  const eventIds = [...new Set(seats.map((s) => s.event_id))];
  const tableIds = [...new Set(seats.map((s) => s.table_id))];
  const [{ data: plans }, { data: events }, { data: tables }, { data: shared }] = await Promise.all([
    supabase.from("seating_plans").select("event_id, reveal_at").eq("wedding_id", weddingId).in("event_id", eventIds),
    supabase.from("events").select("id, name, sort_order").eq("wedding_id", weddingId).in("id", eventIds),
    supabase.from("seating_tables").select("id, label").eq("wedding_id", weddingId).in("id", tableIds),
    supabase
      .from("seat_assignments")
      .select("table_id, guests!inner(id, first_name, last_name, preferred_name, household_id, deleted_at)")
      .eq("wedding_id", weddingId)
      .in("table_id", tableIds),
  ]);

  const now = Date.now();
  const revealAt = new Map((plans ?? []).map((p) => [p.event_id, p.reveal_at]));
  const tableLabel = new Map((tables ?? []).map((t) => [t.id, t.label]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const matesByTable = new Map<string, string[]>();
  for (const row of shared ?? []) {
    const g = row.guests as unknown as {
      first_name: string;
      last_name: string | null;
      preferred_name: string | null;
      household_id: string;
      deleted_at: string | null;
    } | null;
    if (!g || g.deleted_at || g.household_id === householdId) continue;
    const list = matesByTable.get(row.table_id) ?? [];
    list.push(guestName({ firstName: g.first_name, lastName: g.last_name, preferredName: g.preferred_name }));
    matesByTable.set(row.table_id, list);
  }
  for (const list of matesByTable.values()) list.sort((a, b) => a.localeCompare(b, "en-GB"));

  return (events ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((event) => {
      const at = revealAt.get(event.id) ?? null;
      return {
        eventId: event.id,
        eventName: event.name,
        revealAt: at,
        revealed: at !== null && new Date(at).getTime() <= now,
        members: seats
          .filter((s) => s.event_id === event.id && memberById.has(s.guest_id))
          .map((s) => {
            const m = memberById.get(s.guest_id)!;
            return {
              guestId: s.guest_id,
              name: guestName({ firstName: m.first_name, lastName: m.last_name, preferredName: m.preferred_name }),
              table: tableLabel.get(s.table_id) ?? "",
              seat: s.seat_index === null ? null : s.seat_index + 1,
              tablemates: matesByTable.get(s.table_id) ?? [],
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "en-GB")),
      };
    })
    .filter((e) => e.members.length > 0 && (options.preview || e.revealed));
}
