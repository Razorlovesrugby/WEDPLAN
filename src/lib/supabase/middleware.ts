import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";
import type { CookieToSet } from "./cookies";

/** Paths reachable without a session. Everything else requires one. */
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/auth", "/rsvp", "/w", "/api/cron"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
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
