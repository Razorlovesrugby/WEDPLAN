import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { signPath } from "@/lib/supabase/storage";
import type { ColourContext } from "@/lib/seating/colour";
import type {
  SeatingAssignment,
  SeatingFixture,
  SeatingGuest,
  SeatingPlan,
  SeatingRule,
  SeatingTable,
} from "@/lib/seating/model";
import type { RsvpStatus } from "@/lib/types/database";

export type SeatingPlanData = {
  plan: SeatingPlan | null;
  /** A signed URL for the venue image, good for an hour; null if none or storage is unreachable. */
  backgroundUrl: string | null;
  tables: SeatingTable[];
  fixtures: SeatingFixture[];
  assignments: SeatingAssignment[];
  rules: SeatingRule[];
  /** Every active guest of the wedding, as seen from this event. */
  guests: SeatingGuest[];
  colour: ColourContext;
};

/**
 * Everything one event's seating screen needs, in one pass.
 *
 * Every active guest is returned, not only the invited ones: a guest who was
 * seated and then un-invited must still be on the plan to be warned about
 * (spec 33 §B.2). The tray filters with `isAttending`; nothing here decides
 * who is coming. Invited-ness comes from `v_guest_event_invites` and nowhere
 * else (spec 22).
 */
export const getSeatingPlan = cache(async (weddingId: string, eventId: string): Promise<SeatingPlanData> => {
  const supabase = await createClient();

  const [plan, tables, fixtures, assignments, rules, guests, invites, tags, collaborators, questions] =
    await Promise.all([
      supabase.from("seating_plans").select("*").eq("event_id", eventId).eq("wedding_id", weddingId).maybeSingle(),
      supabase
        .from("seating_tables")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("seating_fixtures")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
      supabase.from("seat_assignments").select("guest_id, table_id, seat_index").eq("wedding_id", weddingId).eq("event_id", eventId),
      supabase.from("seating_rules").select("*").eq("wedding_id", weddingId).order("created_at", { ascending: true }),
      supabase
        .from("guests")
        .select(
          "id, household_id, first_name, last_name, preferred_name, age_band, side, dietary, accessibility, plus_one_for, households(display_name), guest_tags(tag_id), rsvps(event_id, status)",
        )
        .eq("wedding_id", weddingId)
        .is("deleted_at", null),
      supabase
        .from("v_guest_event_invites")
        .select("guest_id, invited, excluded_from_counts")
        .eq("wedding_id", weddingId)
        .eq("event_id", eventId),
      supabase.from("tags").select("id, name, colour").eq("wedding_id", weddingId).order("name"),
      supabase.from("collaborators").select("role, display_name").eq("wedding_id", weddingId),
      supabase
        .from("rsvp_questions")
        .select("id, label, options")
        .eq("wedding_id", weddingId)
        .eq("type", "single_select")
        .eq("scope", "guest")
        .eq("active", true)
        .order("sort_order"),
    ]);

  for (const [what, result] of [
    ["the room", plan],
    ["tables", tables],
    ["fixtures", fixtures],
    ["seats", assignments],
    ["seating rules", rules],
    ["guests", guests],
    ["invitations", invites],
    ["tags", tags],
    ["collaborators", collaborators],
    ["questions", questions],
  ] as const) {
    if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  }

  const questionRows = (questions.data ?? []).map((q) => ({
    id: q.id,
    label: q.label,
    options: Array.isArray(q.options) ? q.options.map(String) : [],
  }));

  const answers: Record<string, Record<string, string>> = {};
  if (questionRows.length > 0) {
    const { data, error } = await supabase
      .from("rsvp_answers")
      .select("question_id, guest_id, value")
      .eq("wedding_id", weddingId)
      .in(
        "question_id",
        questionRows.map((q) => q.id),
      )
      .not("guest_id", "is", null);
    if (error) throw new Error(`Could not load answers: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.guest_id || typeof row.value !== "string") continue;
      (answers[row.question_id] ??= {})[row.guest_id] = row.value;
    }
  }

  const inviteByGuest = new Map((invites.data ?? []).map((i) => [i.guest_id, i]));

  const seatingGuests: SeatingGuest[] = (guests.data ?? []).map((g) => {
    const invite = inviteByGuest.get(g.id);
    const rsvp = (g.rsvps ?? []).find((r: { event_id: string; status: RsvpStatus }) => r.event_id === eventId);
    return {
      id: g.id,
      householdId: g.household_id,
      householdName: g.households?.display_name ?? "—",
      firstName: g.first_name,
      lastName: g.last_name,
      preferredName: g.preferred_name,
      ageBand: g.age_band,
      side: g.side,
      dietary: g.dietary,
      accessibility: g.accessibility,
      plusOneFor: g.plus_one_for,
      tagIds: (g.guest_tags ?? []).map((t: { tag_id: string }) => t.tag_id),
      invited: invite?.invited ?? false,
      excluded: invite?.excluded_from_counts ?? false,
      rsvp: rsvp?.status ?? null,
    };
  });

  const planRow = plan.data ?? null;
  const backgroundUrl = planRow?.background_path ? await signPath(planRow.background_path) : null;

  return {
    plan: planRow,
    backgroundUrl,
    tables: tables.data ?? [],
    fixtures: fixtures.data ?? [],
    assignments: (assignments.data ?? []).map((a) => ({
      guestId: a.guest_id,
      tableId: a.table_id,
      seatIndex: a.seat_index,
    })),
    rules: rules.data ?? [],
    guests: seatingGuests,
    colour: {
      collaborators: collaborators.data ?? [],
      tags: tags.data ?? [],
      questions: questionRows,
      answers,
    },
  };
});

/** Which events have at least one table — for the /seating picker. */
export const getEventIdsWithSeating = cache(async (weddingId: string): Promise<Set<string>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("seating_tables").select("event_id").eq("wedding_id", weddingId);
  if (error) throw new Error(`Could not load seating plans: ${error.message}`);
  return new Set((data ?? []).map((row) => row.event_id));
});

export type SeatingSnapshotSummary = {
  id: string;
  name: string;
  automatic: boolean;
  createdAt: string;
  createdBy: string | null;
  tables: number;
  seated: number;
};

/** An event's saved copies, newest first, with enough to tell them apart. */
export const listSeatingSnapshots = cache(
  async (weddingId: string, eventId: string): Promise<SeatingSnapshotSummary[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seating_snapshots")
      .select("id, name, automatic, created_at, created_by, payload")
      .eq("wedding_id", weddingId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load saved copies: ${error.message}`);
    return (data ?? []).map((s) => {
      const payload = (s.payload ?? {}) as { tables?: unknown[]; assignments?: unknown[] };
      return {
        id: s.id,
        name: s.name,
        automatic: s.automatic,
        createdAt: s.created_at,
        createdBy: s.created_by,
        tables: Array.isArray(payload.tables) ? payload.tables.length : 0,
        seated: Array.isArray(payload.assignments) ? payload.assignments.length : 0,
      };
    });
  },
);
