import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/tokens";
import { absoluteUrl, serverEnv } from "@/lib/env";
import {
  PINTEREST_API_BASE,
  PINTEREST_TOKEN_URL,
  parseAccount,
  parseBoards,
  parsePage,
  parsePins,
  parseTokens,
  tokenNeedsRefresh,
  type PinterestBoard,
  type PinterestPin,
  type PinterestTokens,
} from "@/lib/pinterest";
import type { PinterestAccountRow } from "@/lib/types/database";

/**
 * The network half of the Pinterest integration. Everything it decides comes
 * from src/lib/pinterest.ts, which is pure and tested; this file only makes
 * calls and stores what comes back.
 *
 * READ docs/specs/09.1-pinterest-import-and-clipper.md section 4 first. Access
 * tiers, scopes, token lifetimes and redirect-URI rules are Pinterest's to
 * change and have changed before. In particular a new developer app usually
 * starts limited to its owner's own account, which for this app is exactly
 * what is wanted — and is also why there is one connection per wedding.
 */

export type PinterestConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Null when the app has no Pinterest credentials, which is a supported state. */
export function pinterestConfig(): PinterestConfig | null {
  const env = serverEnv();
  if (!env.PINTEREST_APP_ID || !env.PINTEREST_APP_SECRET) return null;
  return {
    clientId: env.PINTEREST_APP_ID,
    clientSecret: env.PINTEREST_APP_SECRET,
    redirectUri: absoluteUrl("/api/pinterest/callback"),
  };
}

function basicAuth(config: PinterestConfig): string {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
}

async function postForm(config: PinterestConfig, body: URLSearchParams): Promise<unknown | null> {
  const response = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth(config)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function exchangeCode(config: PinterestConfig, code: string): Promise<PinterestTokens | null> {
  const json = await postForm(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  );
  return json ? parseTokens(json) : null;
}

async function refresh(config: PinterestConfig, refreshToken: string): Promise<PinterestTokens | null> {
  const json = await postForm(
    config,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
  return json ? parseTokens(json) : null;
}

export type AccessResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" | "expired" | "misconfigured" };

/**
 * A usable access token, refreshing first when the stored one is close to
 * expiring. A v5 token is short-lived — this is the difference between an
 * import that works in March and one that fails in April with a 401 that
 * looks like a bug.
 */
export async function accessTokenFor(account: PinterestAccountRow | null): Promise<AccessResult> {
  const config = pinterestConfig();
  if (!config) return { ok: false, reason: "misconfigured" };
  if (!account) return { ok: false, reason: "not_connected" };

  const current = decryptToken(account.access_token_encrypted);
  // decryptToken returns null after a pepper rotation. "Reconnect Pinterest"
  // is the honest answer, not a crash.
  if (!current) return { ok: false, reason: "expired" };

  if (!tokenNeedsRefresh(account.token_expires_at)) return { ok: true, accessToken: current };

  const refreshTokenValue = account.refresh_token_encrypted
    ? decryptToken(account.refresh_token_encrypted)
    : null;
  if (!refreshTokenValue) return { ok: false, reason: "expired" };

  const refreshed = await refresh(config, refreshTokenValue);
  if (!refreshed) return { ok: false, reason: "expired" };

  const supabase = await createClient();
  await supabase
    .from("pinterest_accounts")
    .update({
      access_token_encrypted: encryptToken(refreshed.accessToken),
      // Pinterest may or may not rotate the refresh token; keep the old one
      // when it does not rather than blanking a working credential.
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptToken(refreshed.refreshToken)
        : account.refresh_token_encrypted,
      token_expires_at: refreshed.expiresAt,
    })
    .eq("id", account.id)
    .eq("wedding_id", account.wedding_id);

  return { ok: true, accessToken: refreshed.accessToken };
}

async function apiGet(accessToken: string, path: string, params?: Record<string, string>): Promise<unknown | null> {
  const url = new URL(`${PINTEREST_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function fetchAccount(accessToken: string): Promise<{ id: string | null; username: string | null }> {
  return parseAccount(await apiGet(accessToken, "/user_account"));
}

/**
 * Every board, following the cursor. Capped, because "every board" is
 * somebody else's number and an unbounded loop against a third party's API is
 * how a page hangs.
 */
export async function fetchBoards(accessToken: string, maxPages = 10): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const json = await apiGet(accessToken, "/boards", {
      page_size: "100",
      ...(bookmark ? { bookmark } : {}),
    });
    if (!json) break;

    const { items, bookmark: next } = parsePage(json);
    boards.push(...parseBoards(items));
    if (!next) break;
    bookmark = next;
  }

  return boards;
}

/** One board's pins, paginated the same way. A 400-pin board is several calls. */
export async function fetchPins(
  accessToken: string,
  boardId: string,
  maxPages = 10,
): Promise<{ pins: PinterestPin[]; truncated: boolean }> {
  const pins: PinterestPin[] = [];
  let bookmark: string | null = null;
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const json = await apiGet(accessToken, `/boards/${encodeURIComponent(boardId)}/pins`, {
      page_size: "100",
      ...(bookmark ? { bookmark } : {}),
    });
    if (!json) break;

    const { items, bookmark: next } = parsePage(json);
    pins.push(...parsePins(items));
    if (!next) break;
    bookmark = next;
    // Ran out of pages before running out of pins: say so rather than
    // quietly showing a partial board as if it were the whole thing.
    if (page === maxPages - 1) truncated = true;
  }

  return { pins, truncated };
}
