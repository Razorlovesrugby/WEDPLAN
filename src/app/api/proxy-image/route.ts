import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchImage } from "@/lib/net/fetch-image";

/**
 * GET /api/proxy-image?url=… — the CORS fallback for the Pinterest import.
 *
 * The import downscales in the planner's own browser, which means reading a
 * cross-origin image into a canvas. If Pinterest's CDN does not send
 * permissive CORS headers, the canvas is tainted and toBlob() throws. This
 * route is the way round that: same-origin bytes, so nothing is tainted.
 *
 * It writes nothing. It is not an upload path and never touches storage.
 *
 * Two things keep it from being an open proxy:
 *
 *   1. It requires a signed-in collaborator, like the CSV exports and for the
 *      same reason — an endpoint that fetches on your behalf is exactly the
 *      kind of thing that quietly becomes one when somebody reaches for the
 *      service role to "make it simpler".
 *
 *   2. It only fetches Pinterest's image CDN. Its one caller imports pins;
 *      an authenticated open proxy is still an open proxy.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Pinterest serves pin images from i.pinimg.com and its siblings. */
function isPinterestCdn(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)pinimg\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const target = request.nextUrl.searchParams.get("url") ?? "";
  if (!isPinterestCdn(target)) {
    return NextResponse.json({ error: "This only proxies Pinterest images." }, { status: 400 });
  }

  // Still through the hardened fetcher, host allowlist or not: a CDN hostname
  // that resolves somewhere private is exactly the case that module exists for.
  const result = await fetchImage(target);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });

  return new NextResponse(new Uint8Array(result.image.bytes), {
    headers: {
      "Content-Type": result.image.contentType,
      // Private and short: this is a pass-through of somebody else's image,
      // fetched on one collaborator's authority.
      "Cache-Control": "private, max-age=300",
    },
  });
}
