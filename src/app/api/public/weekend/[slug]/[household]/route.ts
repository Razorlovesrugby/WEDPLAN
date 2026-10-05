import { buildIcsCalendar } from "@/lib/ics";
import { weekendIcsEvents } from "@/lib/site/weekend";
import { findWeddingBySlug } from "@/server/queries/site";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { resolveInvitation } from "@/server/rsvp/resolve";

/**
 * A household's weekend as one .ics (spec 27 §7).
 *
 *     /api/public/weekend/ray-and-olivia/okonkwo-4f7ak
 *
 * Keyed by the household's own address, **not** by the wedding: unlike the
 * save-the-date's file, which carries only what the public site already shows,
 * this carries the events *this household* is invited to — including any
 * private ones, such as the family breakfast, that are on nobody else's page.
 * So the five-character suffix is the credential here exactly as it is for the
 * page, a wrong one costs a throttle slot on the same counter, and every
 * failure is the same bare 404.
 *
 * The events come from `resolveInvitation`, which is where spec 22's per-person
 * rule is applied: an event nobody in the household is invited to is not in the
 * context, and so cannot be in the file.
 */

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; household: string }> },
) {
  const { slug, household } = await params;

  const wedding = await findWeddingBySlug(slug);
  if (!wedding) return notFound();

  const resolved = await resolveHouseholdAddress(wedding.id, household);
  if (resolved.kind !== "ok" || !resolved.token) return notFound();

  const invitation = await resolveInvitation(resolved.token);
  if (!invitation.ok) return notFound();

  const events = weekendIcsEvents(invitation.context.events, wedding.name);
  if (events.length === 0) return notFound();

  return new Response(buildIcsCalendar(events), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Inline, as for the save-the-date: iOS Safari only offers "Add to
      // Calendar" for a calendar it is allowed to open, and desktop browsers
      // still download it.
      "content-disposition": `inline; filename="weekend.ics"`,
      // It carries a household's own events, and the link is a credential.
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
