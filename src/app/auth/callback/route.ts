import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInviteLinkType } from "@/lib/planner-invite";

/**
 * Auth landing route, used by password-reset links. Exchanges the one-time
 * code for a session cookie.
 *
 * It also accepts `token_hash` + `type` (invite or recovery), which is how the
 * planner's invite link works (spec 39): an admin-generated link has no PKCE
 * code to exchange, so the hash is verified directly.
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

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && isInviteLinkType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return NextResponse.redirect(`${origin}/login?error=expired`);
    return NextResponse.redirect(`${origin}${next}`);
  }

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
