import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";

/**
 * One event as an .ics file (spec 14 §6).
 *
 * Public and unauthenticated, like the site it is linked from: the event is
 * already on a page anyone with the link can read, and requiring a token to
 * add it to a calendar would mean guests typing the time in by hand.
 *
 * Only `is_public` events are served. A private event — a supplier setup slot,
 * the family-only breakfast — is not on the site and must not be reachable by
 * guessing an id.
 */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, starts_at, ends_at, venue, address, is_public, wedding_id")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (!event || !event.starts_at) {
    return new Response("Not found", { status: 404 });
  }

  const { data: wedding } = await supabase
    .from("weddings")
    .select("name")
    .eq("id", event.wedding_id)
    .maybeSingle();

  const location = [event.venue, event.address].filter(Boolean).join(", ") || null;

  const ics = buildIcs({
    id: event.id,
    name: event.name,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location,
    description: wedding?.name ?? null,
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.id}.ics"`,
      "cache-control": "no-store",
    },
  });
}
