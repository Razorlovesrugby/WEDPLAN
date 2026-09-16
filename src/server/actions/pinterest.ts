"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { getPinterestAccount } from "@/server/queries/moodboards";
import { accessTokenFor, fetchBoards, fetchPins, pinterestConfig } from "@/server/pinterest/client";
import { authorizeUrl, pinToItem, type ImportableePin } from "@/lib/pinterest";
import { fail, ok, type ActionResult } from "./result";

const STATE_COOKIE = "pinterest_oauth_state";

/**
 * Starts the OAuth dance. The state goes into an httpOnly cookie and is
 * checked in the callback, so a connect link cannot be handed to the planner
 * by somebody else.
 */
export async function beginPinterestConnect(): Promise<ActionResult<{ url: string }>> {
  await requireWedding();
  const config = pinterestConfig();
  if (!config) {
    return fail(
      "Pinterest isn't configured on this deployment. Set PINTEREST_APP_ID and PINTEREST_APP_SECRET.",
    );
  }

  const state = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 600,
  });

  return ok({
    url: authorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state }),
  });
}

export async function disconnectPinterest(): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("pinterest_accounts").delete().eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  // Imported items are untouched: they are images on a board now, not a view
  // of somebody's Pinterest account.
  revalidatePath("/settings");
  return ok(undefined);
}

export type PinterestBoardSummary = {
  id: string;
  name: string;
  pinCount: number | null;
  coverUrl: string | null;
  privacy: string | null;
};

export async function listPinterestBoards(): Promise<ActionResult<PinterestBoardSummary[]>> {
  const wedding = await requireWedding();
  const account = await getPinterestAccount(wedding.id);
  const access = await accessTokenFor(account);
  if (!access.ok) return fail(reasonText(access.reason));

  const boards = await fetchBoards(access.accessToken);
  return ok(
    boards.map((board) => ({
      id: board.id,
      name: board.name,
      pinCount: board.pin_count ?? null,
      coverUrl: board.media?.image_cover_url ?? null,
      privacy: board.privacy ?? null,
    })),
  );
}

export async function listPinterestPins(
  boardId: string,
): Promise<ActionResult<{ pins: ImportableePin[]; skipped: number; truncated: boolean }>> {
  const wedding = await requireWedding();
  const account = await getPinterestAccount(wedding.id);
  const access = await accessTokenFor(account);
  if (!access.ok) return fail(reasonText(access.reason));

  const { pins, truncated } = await fetchPins(access.accessToken, boardId);

  const importable: ImportableePin[] = [];
  let skipped = 0;
  for (const pin of pins) {
    const mapped = pinToItem(pin);
    // A video pin, or a media payload in a shape this does not recognise.
    // Counted and reported, never guessed at.
    if (mapped) importable.push(mapped);
    else skipped += 1;
  }

  return ok({ pins: importable, skipped, truncated });
}

function reasonText(reason: "not_connected" | "expired" | "misconfigured"): string {
  if (reason === "misconfigured") return "Pinterest isn't configured on this deployment.";
  if (reason === "not_connected") return "Connect a Pinterest account in Settings first.";
  return "That Pinterest connection has expired. Reconnect it in Settings.";
}
