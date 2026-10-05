import { z } from "zod";
import type { NextRequest } from "next/server";
import { buildIcsCalendar } from "@/lib/ics";
import { createClient } from "@/lib/supabase/server";
import { weekendIcsEvents } from "@/lib/site/weekend";
import { getCurrentWedding } from "@/server/queries/wedding";
import { loadRsvpData } from "@/server/rsvp/resolve";

/**
 * A household's weekend as one .ics, for the editor's preview (spec 28 §4.1).
 *
 *     /site/preview/weekend.ics?as=<household id>
 *
 * The live route (`/api/public/weekend/<wedding>/<household address>`) is keyed
 * by the household's own credential and answers 404 for one that has never been
 * sent an invitation — which is exactly what the planner saw when they pressed
 * "Add to calendar" in the preview. This one is behind the planner's sign-in
 * and keyed by the household's id, so the button in the preview downloads the
 * real file for the household being previewed, and the planner can open it in
 * their calendar and check it.
 *
 * The events come from `loadRsvpData`, the same function a guest's own link
 * goes through, so the file holds exactly what that household's page lists.
 */

export const dynamic = "force-dynamic";

const plain = (message: string, status: number) => new Response(message, { status });

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return plain("Unauthorised", 401);

  const wedding = await getCurrentWedding();
  if (!wedding) return plain("No wedding", 404);

  const householdId = z.string().uuid().safeParse(request.nextUrl.searchParams.get("as"));
  if (!householdId.success) return plain("Not found", 404);

  // Through the planner's own session, so RLS says whether this household is
  // theirs before the service role is asked for its data.
  const { data: household } = await supabase
    .from("households")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("id", householdId.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!household) return plain("Not found", 404);

  const data = await loadRsvpData(wedding.id, household.id);
  const events = data ? weekendIcsEvents(data.events, wedding.name) : [];
  if (events.length === 0) return plain("This household is not invited to any dated events.", 404);

  return new Response(buildIcsCalendar(events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="weekend.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
