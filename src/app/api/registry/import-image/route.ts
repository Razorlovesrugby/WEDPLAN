import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchImage } from "@/lib/net/fetch-image";

/**
 * GET /api/registry/import-image?url=… — bring a shop's picture into the
 * planner's browser so it can be re-encoded and uploaded (spec 36 §5.3).
 *
 * Re-encoding happens in the browser (there is no image library on the
 * server; `encode-image.ts` explains why that is a feature — it strips EXIF),
 * and a browser can't read another site's pixels into a canvas, so the bytes
 * come through here, same-origin.
 *
 * It writes nothing and never touches storage. Not an open proxy:
 *   - signed-in collaborators only, like the CSV exports and `proxy-image`;
 *   - `fetchImage` only: https, public addresses (checked inside the socket's
 *     own DNS lookup), image content types only, capped size, no cookies;
 *   - the response is the image bytes and nothing else.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) return new NextResponse(null, { status: 401 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse(null, { status: 400 });

  const result = await fetchImage(url);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });

  return new NextResponse(new Uint8Array(result.image.bytes), {
    status: 200,
    headers: {
      "content-type": result.image.contentType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
