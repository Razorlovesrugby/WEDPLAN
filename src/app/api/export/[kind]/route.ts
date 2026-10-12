import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCollaborators, getCurrentWedding } from "@/server/queries/wedding";
import { listGuests, listHouseholds } from "@/server/queries/guests";
import { listSaveTheDateOpens } from "@/server/queries/save-the-date";
import { absoluteUrl } from "@/lib/env";
import { saveTheDatePath } from "@/lib/site/save-the-date";
import { listInvites } from "@/server/queries/invites";
import { getItemsForExport } from "@/server/queries/lists";
import { parseGuestFilters } from "@/lib/filters";
import { csvDocument } from "@/lib/csv";
import { zip } from "@/lib/zip";
import { guestName, formatDateTime } from "@/lib/format";
import { getCoachManifest } from "@/server/queries/travel";
import type { ListItemStatus, WeddingRow } from "@/lib/types/database";

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

const KINDS = ["guests", "catering", "households", "tasks", "coach"] as const;
type Kind = (typeof KINDS)[number];

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

type Built = { filename: string; body: string };

/**
 * One export, as a filename and a CSV body. Pulled out of the route handler so
 * `/api/export/all` builds exactly the files the individual buttons do — the
 * zip can't drift from them, because there is only one place that makes them.
 */
async function buildExport(kind: Kind, wedding: WeddingRow, searchParams: URLSearchParams): Promise<Built> {
  const stamp = new Date().toISOString().slice(0, 10);
  let body: string;
  let filename: string;

  if (kind === "coach") {
    // The manifest: who is on which coach, from which stop. Ordered the way it
    // gets read aloud at a kerbside — run, then stop, then household.
    //
    // Returns here rather than falling through, like the tasks export above
    // it: everything below this point loads the guest list and ends in an
    // `else` that would overwrite whatever body was built.
    const manifest = await getCoachManifest(wedding.id);
    return {
      filename: `coach-manifest-${stamp}.csv`,
      body: csvDocument(
        ["Coach", "Direction", "Stop", "Pickup", "Household", "Seats"],
        manifest.map((row) => [
          row.run,
          row.direction === "to_venue" ? "To the venue" : "Back",
          row.stop,
          row.pickupAt ? formatDateTime(row.pickupAt, wedding.timezone) : "",
          row.household,
          row.seats,
        ]),
      ),
    };
  }

  if (kind === "tasks") {
    /*
     * Every task across every active list, not scoped to whatever smart
     * view happened to be open — "export all tasks" names the whole task
     * system, not a filtered slice of it (spec 17). "Assigned to" uses the
     * same role label the assign picker itself falls back to
     * (item-row.tsx) until spec 15 gives collaborators a real display name.
     */
    const [items, collaborators] = await Promise.all([getItemsForExport(wedding.id), getCollaborators(wedding.id)]);
    const roleLabel = new Map(collaborators.map((c) => [c.user_id, c.role === "owner" ? "Owner" : "Partner"]));
    const statusLabel: Record<ListItemStatus, string> = {
      not_started: "Not started",
      in_progress: "In progress",
      done: "Done",
    };

    body = csvDocument(
      ["List", "Section", "Task", "Status", "Due date", "Assigned to", "Flagged", "Priority", "Notes"],
      items.map((item) => [
        item.lists?.title ?? "",
        item.list_sections?.title ?? "",
        item.title,
        statusLabel[item.status],
        item.due_date ?? "",
        item.assigned_to ? (roleLabel.get(item.assigned_to) ?? "") : "",
        item.flagged ? "yes" : "no",
        item.priority > 0 ? item.priority : "",
        item.notes ?? "",
      ]),
    );
    return { filename: `tasks-${stamp}.csv`, body };
  }

  const filters = parseGuestFilters(Object.fromEntries(searchParams));
  const guests = await listGuests(wedding.id, filters);

  if (kind === "catering") {
    /*
     * What a caterer actually asks for: confirmed attendees only, with the
     * dietary and allergy notes attached and children separated out, because
     * children are charged and fed differently. Anyone who has not said yes
     * is not on this list — a caterer counting maybes will over-order.
     *
     * A yes only counts for an event they are still invited to (spec 22 §7):
     * an answer given before somebody was taken off an event survives in the
     * database on purpose, and it must not walk into the caterer's numbers.
     */
    const invites = await listInvites(wedding.id);
    const invitedPairs = new Set(
      invites.filter((row) => row.invited).map((row) => `${row.guest_id}:${row.event_id}`),
    );
    const attending = guests.filter((guest) =>
      guest.rsvps.some((r) => r.status === "yes" && invitedPairs.has(`${guest.id}:${r.event_id}`)),
    );
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
    // Each household's save-the-date link and when they last opened it, so
    // sending a hundred links is a mail merge rather than a hundred copies
    // from the Guests table.
    const [households, opens] = await Promise.all([
      listHouseholds(wedding.id),
      listSaveTheDateOpens(wedding.id),
    ]);
    const addressById = new Map(
      households.map((row) => [row.id, { slug: row.slug, suffix: row.slug_suffix }]),
    );
    const byHousehold = new Map<
      string,
      { id: string; name: string; address: string | null; members: string[] }
    >();
    for (const guest of guests) {
      const entry = byHousehold.get(guest.household_id) ?? {
        id: guest.household_id,
        name: guest.household_name,
        address: guest.household_address,
        members: [],
      };
      entry.members.push(guestName(guest));
      byHousehold.set(guest.household_id, entry);
    }
    body = csvDocument(
      ["Household", "Address", "People", "Members", "Save-the-date link", "Save-the-date last opened"],
      [...byHousehold.values()].map((entry) => {
        const address = addressById.get(entry.id);
        const lastOpened = opens[entry.id]?.lastViewedAt;
        return [
          entry.name,
          entry.address ?? "",
          entry.members.length,
          entry.members.join(", "),
          address ? absoluteUrl(saveTheDatePath(wedding.slug, address)) : "",
          lastOpened ? formatDateTime(lastOpened, wedding.timezone) : "",
        ];
      }),
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

  return { filename, body };
}

const csvResponse = ({ filename, body }: Built) =>
  new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });

const BUNDLE_README = `Your wedding data, downloaded from WEDPLAN.

These are spreadsheets (CSV) you can open in Excel, Numbers or Google Sheets:
  guests            every guest, with RSVP, dietary and accessibility notes
  households        every household and its save-the-date link
  catering-numbers  confirmed attendees only, for the caterer
  tasks             every task across every list
  coach-manifest    who is on which coach, from which stop

This is a copy of what you can read, not a full backup: it can't be loaded back
in automatically, and it doesn't include the budget, vendors, moodboards, the
website or images. Treat it as private - it contains your guests' details.
`;

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "all" && !isKind(kind)) {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wedding = await getCurrentWedding();
  if (!wedding) return NextResponse.json({ error: "No wedding" }, { status: 404 });

  if (kind === "all") {
    // Everything unfiltered: a bundle is a copy of the whole list, not of
    // whatever view happened to be open.
    const files = await Promise.all(KINDS.map((k) => buildExport(k, wedding, new URLSearchParams())));
    const encoder = new TextEncoder();
    const bytes = zip([
      { name: "README.txt", data: encoder.encode(BUNDLE_README) },
      ...files.map((f) => ({ name: f.filename, data: encoder.encode(f.body) })),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="wedding-data-${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return csvResponse(await buildExport(kind, wedding, request.nextUrl.searchParams));
}
