import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWedding, getSessionUser } from "@/server/queries/wedding";
import { encryptToken } from "@/lib/tokens";
import { exchangeCode, fetchAccount, pinterestConfig } from "@/server/pinterest/client";
import { absoluteUrl } from "@/lib/env";

/**
 * GET /api/pinterest/callback — the OAuth redirect target.
 *
 * Runs as the signed-in collaborator: connecting an account is something a
 * logged-in person does, so RLS decides which wedding the row lands against,
 * not this file.
 *
 * `state` is checked against a cookie set when the flow started. Without it,
 * anyone could hand the planner a link that connects THEIR Pinterest account
 * to this wedding.
 */

export const dynamic = "force-dynamic";

const STATE_COOKIE = "pinterest_oauth_state";

function back(message: string, ok = false): NextResponse {
  // absoluteUrl, not a raw env read: it completes a bare hostname and falls
  // back to Vercel's own URLs, which is the difference between this working
  // on a preview deployment and redirecting to localhost.
  const url = new URL(absoluteUrl("/settings"));
  url.searchParams.set(ok ? "pinterest" : "pinterest_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const config = pinterestConfig();
  if (!config) return back("Pinterest isn't configured on this deployment.");

  const wedding = await getCurrentWedding();
  if (!wedding) return back("No wedding to connect it to.");

  const error = request.nextUrl.searchParams.get("error");
  if (error) return back(`Pinterest said: ${error}`);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;

  if (!code) return back("Pinterest sent us back without a code.");
  if (!state || !expected || state !== expected) {
    return back("That connection link didn't match this browser. Start again from Settings.");
  }

  const tokens = await exchangeCode(config, code);
  if (!tokens) return back("Pinterest wouldn't exchange that code. Try connecting again.");

  const account = await fetchAccount(tokens.accessToken);

  const { error: writeError } = await supabase.from("pinterest_accounts").upsert(
    {
      wedding_id: wedding.id,
      external_user_id: account.id ?? "unknown",
      username: account.username,
      access_token_encrypted: encryptToken(tokens.accessToken),
      refresh_token_encrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      token_expires_at: tokens.expiresAt,
      scopes: tokens.scopes,
      connected_by: user.id,
    },
    { onConflict: "wedding_id" },
  );

  if (writeError) return back(writeError.message);

  const response = back("connected", true);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
