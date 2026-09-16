import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";
import { isPublicPath } from "@/lib/public-paths";
import type { CookieToSet } from "./cookies";

/**
 * Refreshes the auth cookie on every request and gates the planner routes.
 *
 * Calling the auth client here is what rotates an expiring session, and
 * middleware is the only place that can write the refreshed cookie back.
 * Removing it logs both collaborators out at unpredictable intervals.
 *
 * Uses getClaims() rather than getUser(): it verifies the JWT locally
 * against the project's cached JWKS instead of making a network round trip
 * to the Auth server on every single request (falling back to getUser()
 * automatically for older HS256 projects), which is what was making every
 * navigation and every server action pay for an extra network hop.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // If the auth call fails, treat the request as signed out rather than
  // letting middleware throw.
  //
  // This is not defensive padding. Middleware runs on EVERY request, so an
  // unhandled throw here takes the entire site down with "a server-side
  // exception has occurred" — the public site, the RSVP pages and the login
  // screen included, with nothing on screen to say why. The realistic causes
  // are all environmental: Supabase env vars that are absent or placeholder
  // (a build succeeds with either, because it only checks their shape), a
  // paused project, or a network blip.
  //
  // Failing closed-but-visible is the right trade: planner routes bounce to
  // /login, the public pages still render, and /api/health says what is
  // actually wrong.
  let user = null;
  try {
    const { data } = await supabase.auth.getClaims();
    user = data?.claims ?? null;
  } catch (error) {
    console.error("[middleware] auth check failed; treating as signed out:", error);
  }

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Come back to where they were aiming once they've signed in.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
