import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWedding } from "@/server/queries/wedding";
import { absoluteUrl } from "@/lib/env";
import { qrPng, qrSvg } from "@/lib/qr";

/**
 * The registry's QR code (spec 36 §8), for an invitation insert or a shower
 * card: PNG, or SVG with `?format=svg` for a printer.
 *
 * Planner-only, like the invitation QR route. The address it encodes isn't a
 * secret (it's meant to be forwarded), but there is no reason for this to be a
 * public image generator, and the middleware keeps `/api/registry` private.
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const wedding = await getCurrentWedding();
  if (!wedding) return NextResponse.json({ error: "No wedding" }, { status: 404 });

  const url = absoluteUrl(`/registry/${wedding.slug}`);
  if (request.nextUrl.searchParams.get("format") === "svg") {
    return new NextResponse(await qrSvg(url), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": 'inline; filename="registry-qr.svg"',
      },
    });
  }
  const png = await qrPng(url);
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="registry-qr.png"' },
  });
}
