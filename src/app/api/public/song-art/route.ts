import { NextResponse, type NextRequest } from "next/server";
import { fetchImage } from "@/lib/net/fetch-image";
import { ARTWORK_SIZES, artworkAt, isAppleArtworkUrl, type ArtworkSize } from "@/lib/site/song-catalogue";

/**
 * GET /api/public/song-art?s=160&u=<Apple artwork URL> — album covers on the song
 * chart (spec 31 §7a).
 *
 * The reason it exists: a guest's page is their household's credential (spec
 * 23 Q1), and an <img> pointing at Apple would hand Apple the guest's IP and,
 * by referrer, that private address. Through here the browser only ever
 * talks to us.
 *
 * Unlike /api/proxy-image it needs no sign-in — guests have no session — so
 * what keeps it from being an open proxy is narrower:
 *
 *   1. Apple's image host only (`isAppleArtworkUrl`), the same rule the 0035
 *      check constraint holds the stored column to.
 *   2. Two sizes only. The size is rewritten into Apple's path here, so a
 *      request cannot ask for a 3000-pixel original.
 *   3. Through the hardened fetcher anyway: a hostname that resolves
 *      somewhere private is exactly the case it exists for. If Apple
 *      redirects off its own host, the result is refused rather than served.
 *   4. A long public cache, so the CDN answers repeats and Apple sees one
 *      request per cover, not one per guest.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u") ?? "";
  const size = Number(request.nextUrl.searchParams.get("s"));

  if (!isAppleArtworkUrl(target) || !ARTWORK_SIZES.includes(size as ArtworkSize)) {
    return new NextResponse(null, { status: 404 });
  }

  const result = await fetchImage(artworkAt(target, size as ArtworkSize), {
    maxBytes: MAX_BYTES,
    timeoutMs: 6_000,
  });
  if (!result.ok || !isAppleArtworkUrl(result.image.finalUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.image.bytes), {
    headers: {
      "Content-Type": result.image.contentType,
      // A cover does not change. A week in the browser and the CDN.
      "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      // Nothing on this response should send a referrer anywhere either.
      "Referrer-Policy": "no-referrer",
    },
  });
}
