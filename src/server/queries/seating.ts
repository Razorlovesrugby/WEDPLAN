import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ColourContext } from "@/lib/seating/colour";
import type {
  SeatingAssignment,
  SeatingFixture,
  SeatingGuest,
  SeatingPlan,
  SeatingRule,
  SeatingTable,
} from "@/lib/seating/model";
import type { BlockedChair } from "@/lib/seating/model";
import type { RsvpStatus } from "@/lib/types/database";
import { parseStyleCentre, parseStylePlace, type StoredCount, type TableStyle } from "@/lib/seating/items";
import { chooseLayout, type LayoutSummary } from "@/lib/seating/layouts";
import { parseDietaryNeeds, type DietaryNeed } from "@/lib/dietary";
import type { SeatingSpaceRow } from "@/lib/types/database";

export type SeatingPlanData = {
  plan: SeatingPlan | null;
  tables: SeatingTable[];
  fixtures: SeatingFixture[];
  assignments: SeatingAssignment[];
  rules: SeatingRule[];
  /** Every active guest of the wedding, as seen from this event. */
  guests: SeatingGuest[];
  /** Chairs taken out of use (spec 53 Part I). */
  blocked: BlockedChair[];
  colour: ColourContext;
  /** The wedding's table styles (spec 57 Part C), by name. */
  styles: TableStyle[];
  /** The layout shown (the one asked for, else the live one); null until anything is placed. */
  layoutId: string | null;
  /** Every layout of the event, deleted drafts included (the tabs and "Recently deleted" filter them). */
  layouts: LayoutSummary[];
  /** The shown layout's spaces, in order. */
  spaces: SeatingSpaceRow[];
  /** The couple's final item counts for that layout. */
  counts: StoredCount[];
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
export const getSeatingPlan = cache(async (weddingId: string, eventId: string, requestedLayoutId?: string): Promise<SeatingPlanData> => {
  const supabase = await createClient();

  // Which layout to show comes first: every table, fixture and seat read below is filtered to it.
  const layoutRows = await supabase
    .from("seating_layouts")
    .select("id, name, is_live, locked_at, locked_by, deleted_at")
    .eq("wedding_id", weddingId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (layoutRows.error) throw new Error(`Could not load the layouts: ${layoutRows.error.message}`);
  const summaries: LayoutSummary[] = (layoutRows.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    isLive: l.is_live,
    lockedAt: l.locked_at,
    lockedBy: l.locked_by,
    deletedAt: l.deleted_at,
    tables: 0,
    seated: 0,
  }));
  const shown = chooseLayout(summaries, requestedLayoutId);
  const layoutId = shown?.id ?? null;
  // A layout nobody has placed anything in yet has no id to filter on: the all-zero uuid matches nothing.
  const scope = layoutId ?? "00000000-0000-0000-0000-000000000000";

  const [event, plan, tables, fixtures, assignments, rules, guests, invites, tags, collaborators, questions, blocked, checkins, styles, spaces, counted, needs] =
    await Promise.all([
      supabase.from("events").select("asks_rsvp").eq("id", eventId).eq("wedding_id", weddingId).maybeSingle(),
      supabase.from("seating_plans").select("*").eq("event_id", eventId).eq("wedding_id", weddingId).maybeSingle(),
      supabase
        .from("seating_tables")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("event_id", eventId)
        .eq("layout_id", scope)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("seating_fixtures")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("event_id", eventId)
        .eq("layout_id", scope)
        .order("created_at", { ascending: true }),
      supabase.from("seat_assignments").select("guest_id, table_id, seat_index").eq("wedding_id", weddingId).eq("event_id", eventId).eq("layout_id", scope),
      supabase.from("seating_rules").select("*").eq("wedding_id", weddingId).order("created_at", { ascending: true }),
      supabase
        .from("guests")
        .select(
          "id, household_id, first_name, last_name, preferred_name, age_band, side, dietary, accessibility, plus_one_for, needs_highchair, uses_wheelchair, households(display_name), guest_tags(tag_id), rsvps(event_id, status)",
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
      supabase.from("seating_chairs_blocked").select("table_id, seat_index").eq("wedding_id", weddingId).eq("event_id", eventId),
      supabase.from("seating_checkins").select("guest_id, arrived_at, by_label").eq("wedding_id", weddingId).eq("event_id", eventId),
      supabase.from("seating_table_styles").select("id, name, place, centre").eq("wedding_id", weddingId).is("deleted_at", null).order("name"),
      supabase.from("seating_spaces").select("*").eq("wedding_id", weddingId).eq("layout_id", scope).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      // Counts for the tabs: how much each layout holds.
      Promise.all([
        supabase.from("seating_tables").select("layout_id").eq("wedding_id", weddingId).eq("event_id", eventId),
        supabase.from("seat_assignments").select("layout_id").eq("wedding_id", weddingId).eq("event_id", eventId),
      ]),
      supabase.from("guest_dietary_needs").select("guest_id, tag, is_allergy, other_text").eq("wedding_id", weddingId),
    ]);

  for (const [what, result] of [
    ["the event", event],
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
    ["blocked chairs", blocked],
    ["arrivals", checkins],
    ["table styles", styles],
    ["spaces", spaces],
    ["table counts", counted[0]],
    ["seat counts", counted[1]],
    ["dietary needs", needs],
  ] as const) {
    if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  }

  const tablesIn = new Map<string, number>();
  for (const t of counted[0].data ?? []) tablesIn.set(t.layout_id, (tablesIn.get(t.layout_id) ?? 0) + 1);
  const seatsIn = new Map<string, number>();
  for (const a of counted[1].data ?? []) seatsIn.set(a.layout_id, (seatsIn.get(a.layout_id) ?? 0) + 1);
  const layouts = summaries.map((l) => ({ ...l, tables: tablesIn.get(l.id) ?? 0, seated: seatsIn.get(l.id) ?? 0 }));

  let counts: StoredCount[] = [];
  if (layoutId) {
    const stored = await supabase
      .from("seating_item_counts")
      .select("item_key, final_count, suggested_chairs, suggested_guests, vendor_id, budget_item_id")
      .eq("wedding_id", weddingId)
      .eq("layout_id", layoutId);
    if (stored.error) throw new Error(`Could not load item counts: ${stored.error.message}`);
    counts = stored.data ?? [];
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

  // Spec 51 §4.4: an event with replies off has no yeses to seat from, so
  // everyone invited counts as coming.
  const asksRsvp = event.data?.asks_rsvp ?? true;
  const arrivedAt = new Map((checkins.data ?? []).map((c) => [c.guest_id, c.arrived_at]));
  const inviteByGuest = new Map((invites.data ?? []).map((i) => [i.guest_id, i]));

  const needsByGuest = new Map<string, DietaryNeed[]>();
  for (const n of needs.data ?? []) {
    const list = needsByGuest.get(n.guest_id) ?? [];
    list.push({ tag: n.tag, isAllergy: n.is_allergy, otherText: n.other_text });
    needsByGuest.set(n.guest_id, list);
  }

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
      dietaryNeeds: parseDietaryNeeds(needsByGuest.get(g.id) ?? []),
      accessibility: g.accessibility,
      plusOneFor: g.plus_one_for,
      tagIds: (g.guest_tags ?? []).map((t: { tag_id: string }) => t.tag_id),
      invited: invite?.invited ?? false,
      excluded: invite?.excluded_from_counts ?? false,
      rsvp: asksRsvp ? (rsvp?.status ?? null) : "yes",
      needsHighchair: g.needs_highchair,
      usesWheelchair: g.uses_wheelchair,
      arrivedAt: arrivedAt.get(g.id) ?? null,
    };
  });

  const tableIdsHere = new Set((tables.data ?? []).map((t) => t.id));

  // The room lives on the space now (migration 0059): the plan the screen sees
  // carries the shown layout's first space's room, whatever the plan row says.
  const firstSpace = (spaces.data ?? [])[0];
  const shownPlan = plan.data
    ? firstSpace
      ? {
          ...plan.data,
          room_width_cm: firstSpace.room_width_cm,
          room_depth_cm: firstSpace.room_depth_cm,
          background_path: firstSpace.background_path,
          background_w_px: firstSpace.background_w_px,
          background_h_px: firstSpace.background_h_px,
          calibrated: firstSpace.calibrated,
        }
      : plan.data
    : null;

  return {
    plan: shownPlan,
    tables: tables.data ?? [],
    fixtures: fixtures.data ?? [],
    assignments: (assignments.data ?? []).map((a) => ({
      guestId: a.guest_id,
      tableId: a.table_id,
      seatIndex: a.seat_index,
    })),
    rules: rules.data ?? [],
    guests: seatingGuests,
    // A blocked chair belongs to a table, so it is in this layout when its table is.
    blocked: (blocked.data ?? [])
      .filter((b) => tableIdsHere.has(b.table_id))
      .map((b) => ({ tableId: b.table_id, seatIndex: b.seat_index })),
    colour: {
      collaborators: collaborators.data ?? [],
      tags: tags.data ?? [],
      questions: questionRows,
      answers,
    },
    styles: (styles.data ?? []).map((st) => ({ id: st.id, name: st.name, place: parseStylePlace(st.place), centre: parseStyleCentre(st.centre) })),
    layoutId,
    layouts,
    spaces: spaces.data ?? [],
    counts,
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
  async (weddingId: string, eventId: string, layoutId?: string | null): Promise<SeatingSnapshotSummary[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("seating_snapshots")
      .select("id, name, automatic, created_at, created_by, payload")
      .eq("wedding_id", weddingId)
      .eq("event_id", eventId);
    // History is per layout (Part G); a screen with no layout yet has none.
    if (layoutId) query = query.eq("layout_id", layoutId);
    const { data, error } = await query.order("created_at", { ascending: false });
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

export type SeatingDayActivity = {
  id: string;
  kind: string;
  at: string;
  by: string;
  guestId: string | null;
  table: string | null;
  seat: number | null;
  note: string | null;
};

/** Day-of arrivals, moves and walk-ins sent from day links, newest first, with the link's label (spec 53 Part I). */
export const getSeatingDayActivity = cache(async (weddingId: string): Promise<SeatingDayActivity[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("day_activity")
    .select("id, kind, payload, tapped_at, link_id")
    .eq("wedding_id", weddingId)
    .in("kind", ["seat_arrived", "seat_unarrived", "seat_moved", "seat_walk_in"])
    .order("tapped_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(`Could not load day-of activity: ${error.message}`);
  const linkIds = [...new Set((data ?? []).map((a) => a.link_id).filter((x): x is string => !!x))];
  const links = linkIds.length ? await supabase.from("day_links").select("id, label").in("id", linkIds) : { data: [], error: null };
  if (links.error) throw new Error(`Could not load links: ${links.error.message}`);
  const label = new Map((links.data ?? []).map((l) => [l.id, l.label]));
  return (data ?? []).map((a) => {
    const p = (a.payload ?? {}) as { guest_id?: string; table?: string; seat?: number | null; note?: string };
    return {
      id: a.id,
      kind: a.kind,
      at: a.tapped_at,
      by: (a.link_id && label.get(a.link_id)) || "A day link",
      guestId: p.guest_id ?? null,
      table: p.table ?? null,
      seat: p.seat ?? null,
      note: p.note ?? null,
    };
  });
});
