import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AccommodationRow,
  CoachRunView,
  CoachSeatRow,
  CoachStopRow,
  TransportOptionRow,
} from "@/lib/types/database";

/**
 * Getting there (spec 14 §7).
 *
 * Two readers, on purpose. The planner's goes through `createClient()` so RLS
 * scopes it; the public one uses the service role because a guest has no
 * session, and scopes itself to the single wedding the caller already resolved
 * from a slug or a token.
 */

export type CoachRun = CoachRunView & { stops: CoachStopRow[] };

export type TravelData = {
  transport: TransportOptionRow[];
  runs: CoachRun[];
  stays: AccommodationRow[];
};

function attachStops(runs: CoachRunView[], stops: CoachStopRow[]): CoachRun[] {
  const byRun = new Map<string, CoachStopRow[]>();
  for (const stop of stops) {
    const list = byRun.get(stop.coach_run_id) ?? [];
    list.push(stop);
    byRun.set(stop.coach_run_id, list);
  }
  return runs.map((run) => ({ ...run, stops: byRun.get(run.id) ?? [] }));
}

async function readTravel(
  supabase: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
): Promise<TravelData> {
  const [transport, runs, stops, stays] = await Promise.all([
    supabase
      .from("transport_options")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("v_coach_runs")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("departs_at"),
    supabase.from("coach_stops").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase
      .from("accommodations")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("created_at"),
  ]);

  return {
    transport: (transport.data ?? []) as TransportOptionRow[],
    runs: attachStops((runs.data ?? []) as CoachRunView[], (stops.data ?? []) as CoachStopRow[]),
    stays: (stays.data ?? []) as AccommodationRow[],
  };
}

/** For `/travel`. RLS scopes it. */
export const getTravel = cache(async (weddingId: string): Promise<TravelData> => {
  const supabase = await createClient();
  return readTravel(supabase, weddingId);
});

/** For `/w/[slug]` and `/rsvp/[token]`. No session exists; the caller scopes. */
export async function getPublicTravel(weddingId: string): Promise<TravelData> {
  return readTravel(createAdminClient(), weddingId);
}

/** What one household already holds, keyed by run. */
export async function getHouseholdSeats(
  weddingId: string,
  householdId: string,
): Promise<Map<string, CoachSeatRow>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("coach_seats")
    .select("*")
    .eq("wedding_id", weddingId)
    .eq("household_id", householdId);
  return new Map(((data ?? []) as CoachSeatRow[]).map((seat) => [seat.coach_run_id, seat]));
}

export type ManifestRow = {
  run: string;
  direction: string;
  stop: string;
  pickupAt: string | null;
  household: string;
  seats: number;
};

/**
 * The thing the planner is actually holding at 2pm on the day.
 *
 * Ordered by run, then stop, then household, because that is the order it gets
 * read aloud at a kerbside.
 */
export async function getCoachManifest(weddingId: string): Promise<ManifestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("coach_seats")
    .select(
      "seats, coach_runs(label, direction, sort_order), coach_stops(name, pickup_at, sort_order), households(display_name)",
    )
    .eq("wedding_id", weddingId);

  const rows = (data ?? []).map((row) => ({
    run: row.coach_runs?.label ?? "",
    direction: row.coach_runs?.direction ?? "",
    runOrder: row.coach_runs?.sort_order ?? 0,
    stop: row.coach_stops?.name ?? "",
    stopOrder: row.coach_stops?.sort_order ?? 0,
    pickupAt: row.coach_stops?.pickup_at ?? null,
    household: row.households?.display_name ?? "",
    seats: row.seats,
  }));

  rows.sort(
    (a, b) =>
      a.runOrder - b.runOrder ||
      a.run.localeCompare(b.run) ||
      a.stopOrder - b.stopOrder ||
      a.household.localeCompare(b.household),
  );

  return rows.map(({ runOrder: _runOrder, stopOrder: _stopOrder, ...rest }) => rest);
}
