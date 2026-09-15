import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWedding } from "@/server/queries/wedding";
import { decryptToken, invitationUrl } from "@/lib/tokens";
import { qrPng, qrSvg } from "@/lib/qr";

/**
 * One invitation's QR code, as a PNG or an SVG (`?format=svg`).
 *
 * Runs as the signed-in collaborator so RLS decides what is readable —
 * the same rule as the CSV exports, and for the same reason: this endpoint
 * hands out a household's RSVP credential in visual form, so reaching for the
 * service role "to make it simpler" would turn it into an open door.
 *
 * Nothing about the response may be cached. The image *is* the token, and a
 * CDN or a browser cache holding it under a guessable URL outlives the
 * invitation it belongs to — reissue an invitation and a cached code would
 * still open the old link until the cache expired.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wedding = await getCurrentWedding();
  if (!wedding) return NextResponse.json({ error: "No wedding" }, { status: 404 });

  const { data, error } = await supabase
    .from("invitations")
    .select("id, token_encrypted, households(display_name)")
    .eq("wedding_id", wedding.id)
    .eq("id", invitationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No such invitation" }, { status: 404 });

  const token = decryptToken(data.token_encrypted);
  if (!token) {
    // The pepper was rotated, so this token cannot be reconstructed. Say so
    // rather than rendering a QR code that leads nowhere — a dead code
    // printed onto 90 cards is discovered by a guest, not by the planner.
    return NextResponse.json(
      { error: "This invitation's link can't be recovered. Reissue it, then print again." },
      { status: 409 },
    );
  }

  const url = invitationUrl(token);
  const wantsSvg = request.nextUrl.searchParams.get("format") === "svg";

  // A filename the stationer can work with, rather than a row of uuids.
  const name = (data.households?.display_name ?? "invitation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  if (wantsSvg) {
    return new NextResponse(await qrSvg(url), {
      headers: {
        ...NO_STORE,
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `inline; filename="rsvp-${name}.svg"`,
      },
    });
  }

  const png = await qrPng(url);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      ...NO_STORE,
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="rsvp-${name}.png"`,
    },
  });
}
