import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWedding } from "@/server/queries/wedding";
import { listGuests } from "@/server/queries/guests";
import { parseGuestFilters } from "@/lib/filters";
import { csvDocument } from "@/lib/csv";
import { guestName } from "@/lib/format";

/**
 * CSV exports.
 *
 * Runs as the signed-in collaborator, not the service role, so RLS still
 * decides what can leave the building. An export endpoint is exactly the kind
 * of thing that quietly becomes a data leak when someone reaches for the
 * admin client to "make it simpler".
 *
 * The guest export honours the filters in the query string, so "everyone who
 * hasn't answered" is an export rather than a spreadsheet you then have to
 * filter again.
 */

const KINDS = ["guests", "catering", "households"] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isKind(kind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wedding = await getCurrentWedding();
  if (!wedding) return NextResponse.json({ error: "No wedding" }, { status: 404 });

  const filters = parseGuestFilters(Object.fromEntries(request.nextUrl.searchParams));
  const guests = await listGuests(wedding.id, filters);

  const stamp = new Date().toISOString().slice(0, 10);
  let body: string;
  let filename: string;

  if (kind === "catering") {
    /*
     * What a caterer actually asks for: confirmed attendees only, with the
     * dietary and allergy notes attached and children separated out, because
     * children are charged and fed differently. Anyone who has not said yes
     * is not on this list — a caterer counting maybes will over-order.
     */
    const attending = guests.filter((guest) => guest.rsvps.some((r) => r.status === "yes"));
    body = csvDocument(
      ["Name", "Household", "Age band", "Needs a seat", "Dietary", "Accessibility"],
      attending.map((guest) => [
        guestName(guest),
        guest.household_name,
        guest.age_band,
        guest.age_band === "infant" ? "no" : "yes",
        guest.dietary ?? "",
        guest.accessibility ?? "",
      ]),
    );
    filename = `catering-numbers-${stamp}.csv`;
  } else if (kind === "households") {
    const byHousehold = new Map<string, { name: string; address: string | null; members: string[] }>();
    for (const guest of guests) {
      const entry = byHousehold.get(guest.household_id) ?? {
        name: guest.household_name,
        address: guest.household_address,
        members: [],
      };
      entry.members.push(guestName(guest));
      byHousehold.set(guest.household_id, entry);
    }
    body = csvDocument(
      ["Household", "Address", "People", "Members"],
      [...byHousehold.values()].map((entry) => [
        entry.name,
        entry.address ?? "",
        entry.members.length,
        entry.members.join(", "),
      ]),
    );
    filename = `households-${stamp}.csv`;
  } else {
    body = csvDocument(
      [
        "First name",
        "Last name",
        "Goes by",
        "Household",
        "Tier",
        "Age band",
        "Email",
        "Phone",
        "Dietary",
        "Accessibility",
        "RSVP",
      ],
      guests.map((guest) => [
        guest.first_name,
        guest.last_name ?? "",
        guest.preferred_name ?? "",
        guest.household_name,
        guest.tier,
        guest.age_band,
        guest.email ?? "",
        guest.phone ?? "",
        guest.dietary ?? "",
        guest.accessibility ?? "",
        guest.rsvps.some((r) => r.status === "yes")
          ? "yes"
          : guest.rsvps.some((r) => r.status === "maybe")
            ? "maybe"
            : guest.rsvps.every((r) => r.status === "no") && guest.rsvps.length > 0
              ? "no"
              : "pending",
      ]),
    );
    filename = `guests-${stamp}.csv`;
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
