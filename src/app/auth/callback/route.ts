import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Exchanges the one-time code for a session cookie.
 *
 * `next` is validated as a same-origin path before being used: an open
 * redirect on the auth callback is how a phishing link borrows your domain's
 * credibility.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next");
  const next = requested && /^\/(?!\/)/.test(requested) ? requested : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
