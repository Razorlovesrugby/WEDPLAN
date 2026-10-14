"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWedding } from "@/server/queries/wedding";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { clientIpHash, isThrottled, recordAttempt } from "@/server/rsvp/resolve";
import { arrivalStatus, canVote } from "@/lib/site/participation";
import { doNotPlayFrom, findDuplicate, isBanned, refusalLine } from "@/lib/site/song-match";
import { songArtPath } from "@/lib/site/song-catalogue";
import { lookupCatalogue, searchCatalogue } from "@/server/songs/catalogue";
import { loadPublishedBlocks } from "@/server/queries/site-blocks";
import { getPublicSongs, type PublicSong } from "@/server/queries/site-extras";
import type { SongRequestRow } from "@/lib/types/database";
import { fail, ok, type ActionResult } from "./result";

/**
 * Song requests (spec 23 §8, Q2).
 *
 * The planner chose to let anyone with the site address ask for a song, which
 * puts a write behind a URL that is not a credential. Three things make that
 * safe enough to be worth it:
 *
 *   **Rate limiting.** Shares the counter the RSVP path already uses, so a
 *   script filling the DJ's list stops being free.
 *   **Nothing unapproved is echoed.** Spec 25 §11 reopened Q2's "the list is
 *   planner-facing", but only under one rule: a request from a household's own
 *   page is published on arrival because the reader holds a credential spec 21
 *   minted for them; one from the shared address waits. `arrivalStatus()` is
 *   that rule, and it is the same function the guestbook calls.
 *   **Attribution, not identity.** `asked_by` is an optional name. A request
 *   from a household's own page is attributed from its token instead, so the
 *   common case has a real name on it without anybody typing one.
 */

// ---------------------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------------------

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * The wedding behind a slug, and the household behind a token — the only two
 * things any guest-side song action takes from the caller. Nothing
 * downstream takes an id from the client except a song id, and every song id
 * is checked against this wedding before it is used.
 */
async function resolveVisitor(
  supabase: Supabase,
  weddingSlug: string,
  token: string | null | undefined,
): Promise<{ weddingId: string; householdId: string | null } | null> {
  const { data: wedding } = await supabase.from("weddings").select("id").eq("slug", weddingSlug).maybeSingle();
  if (!wedding) return null;

  let householdId: string | null = null;
  if (token && looksLikeToken(token)) {
    const { data: invitation } = await supabase
      .from("invitations")
      .select("household_id")
      .eq("wedding_id", wedding.id)
      .eq("token_hash", hashInviteToken(token))
      .is("deleted_at", null)
      .maybeSingle();
    householdId = invitation?.household_id ?? null;
  }
  return { weddingId: wedding.id, householdId };
}

/**
 * The published Song requests block's payload — where the do-not-play list
 * lives. The PUBLISHED one, not the draft: a ban the couple typed and never
 * published is not one their guests can see, so it must not refuse anybody.
 */
async function publishedSongBlock(weddingId: string): Promise<unknown> {
  const blocks = await loadPublishedBlocks(weddingId);
  return blocks.find((block) => block.type === "song_requests")?.payload ?? null;
}

/** Their vote on a song, if they have a household and have not voted yet. */
async function addVote(supabase: Supabase, weddingId: string, songId: string, householdId: string | null) {
  if (!householdId || !canVote(householdId)) return;
  // The unique constraint turns a second vote into an error, which is the
  // answer we want: they had already voted, and nothing changes.
  await supabase.from("song_votes").insert({
    wedding_id: weddingId,
    song_request_id: songId,
    household_id: householdId,
  });
}

// ---------------------------------------------------------------------------
// Asking for a song
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().nullable().optional(),
  title: z.string().trim().min(1, "Which song?").max(200),
  artist: z.string().trim().max(200).optional(),
  askedBy: z.string().trim().max(80).optional(),
  /** A search result's iTunes trackId. Re-checked with Apple, never trusted. */
  catalogueId: z.string().regex(/^[0-9]{1,20}$/).nullable().optional(),
  /** "No, mine's different" — skip the fuzzy duplicate check, not the exact one. */
  force: z.boolean().optional(),
});

export type RequestSongOutcome =
  /** On the list, with their vote on it. */
  | { outcome: "added" }
  /** It was already there — the same track — so their vote went on that one. */
  | { outcome: "voted"; title: string }
  /** Something very like it is already there; the guest decides (spec 31 §6.2). */
  | { outcome: "duplicate"; songId: string; title: string; artist: string | null }
  /** On the do-not-play list. `line` is the couple's refusal, in their words. */
  | { outcome: "banned"; line: string };

export async function requestSong(payload: unknown): Promise<ActionResult<RequestSongOutcome>> {
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return fail("That didn't look right — a song needs a name at least.");

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) {
    return fail("That's a lot of songs at once. Give it a few minutes.");
  }

  const supabase = createAdminClient();
  const visitor = await resolveVisitor(supabase, parsed.data.weddingSlug, parsed.data.token);
  if (!visitor) {
    await recordAttempt(ipHash, false);
    return fail("We couldn't find that wedding.");
  }
  const { weddingId, householdId } = visitor;

  // A picked search result is looked up again here, so the title, artist and
  // artwork stored are Apple's and not whatever the browser sent. If Apple
  // can't be asked right now the song still goes on the list — as typed, with
  // no artwork and no catalogue id — because the form has to work without it.
  let song = {
    title: parsed.data.title,
    artist: parsed.data.artist || null,
    catalogueId: null as string | null,
    artworkUrl: null as string | null,
  };
  if (parsed.data.catalogueId) {
    const found = await lookupCatalogue(parsed.data.catalogueId);
    if (found) {
      song = { title: found.title, artist: found.artist, catalogueId: found.catalogueId, artworkUrl: found.artworkUrl };
    }
  }

  const [block, existingRows] = await Promise.all([
    publishedSongBlock(weddingId),
    supabase.from("song_requests").select("id, title, artist, status, catalogue_id").eq("wedding_id", weddingId),
  ]);

  // The do-not-play list (spec 31 §6.1). Refused with the couple's own line —
  // an answer, not an error: it is the joke the couple wrote for this moment.
  if (isBanned(song, doNotPlayFrom(block))) {
    await recordAttempt(ipHash, true);
    return ok({ outcome: "banned", line: refusalLine(block) });
  }

  const existing = (existingRows.data ?? []) as Pick<
    SongRequestRow,
    "id" | "title" | "artist" | "status" | "catalogue_id"
  >[];
  const listed = (row: { status: string }) => row.status === "approved" || row.status === "played";

  // The same track: their vote goes on the one already there. Exact, so it is
  // not a question (spec 31 §7a.3).
  const sameTrack = song.catalogueId ? existing.find((row) => row.catalogue_id === song.catalogueId) : undefined;
  // Very like one already there: asked, unless they have said it's different.
  const alike = sameTrack ?? (parsed.data.force ? undefined : findDuplicate(song, existing.filter(listed)) ?? undefined);

  if (alike) {
    await recordAttempt(ipHash, true);
    if (!listed(alike)) {
      // The couple hid it, or it is waiting from the old shared page. Either
      // way it is theirs already, and saying "hidden" would be telling.
      return ok({ outcome: "added" });
    }
    if (sameTrack) {
      await addVote(supabase, weddingId, alike.id, householdId);
      revalidatePath("/site/songs");
      return ok({ outcome: "voted", title: alike.title });
    }
    return ok({ outcome: "duplicate", songId: alike.id, title: alike.title, artist: alike.artist });
  }

  const { data: created, error } = await supabase
    .from("song_requests")
    .insert({
      wedding_id: weddingId,
      household_id: householdId,
      title: song.title,
      artist: song.artist,
      asked_by: parsed.data.askedBy || null,
      catalogue_id: song.catalogueId,
      artwork_url: song.artworkUrl,
      // Published straight away when they came from their own link; queued when
      // they came from the shared address (spec 25 §10).
      status: arrivalStatus(householdId),
    })
    .select("id")
    .single();

  if (error?.code === "23505" && song.catalogueId) {
    // Two households picked the same track in the same moment and the other
    // got there first. The index is what made that one row (0035).
    const { data: winner } = await supabase
      .from("song_requests")
      .select("id, title, status")
      .eq("wedding_id", weddingId)
      .eq("catalogue_id", song.catalogueId)
      .maybeSingle();
    if (winner && listed(winner)) {
      await addVote(supabase, weddingId, winner.id, householdId);
      await recordAttempt(ipHash, true);
      revalidatePath("/site/songs");
      return ok({ outcome: "voted", title: winner.title });
    }
  }
  if (error || !created) return fail("We couldn't add that one. Try again in a moment.");

  // Asking for a song is asking for it: their vote is on it already (spec 28
  // §6.2), so it does not arrive at zero and a household is not left to find
  // the button on its own suggestion. Not worth failing the request over — the
  // song is on the list either way and they can vote for it themselves.
  await addVote(supabase, weddingId, created.id, householdId);

  await recordAttempt(ipHash, true);
  revalidatePath("/site/songs");
  return ok({ outcome: "added" });
}

// ---------------------------------------------------------------------------
// Searching for one (spec 31 §7a)
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().min(1),
  query: z.string().trim().min(2).max(100),
});

export type SongSearchResult = {
  catalogueId: string;
  title: string;
  artist: string;
  /** Our proxied address, never Apple's. */
  art: string | null;
};

/**
 * Up to six songs from Apple's catalogue, asked by our server so the guest's
 * browser never is (spec 23 Q1). A token is required: only an invited
 * household can make this server talk to Apple, and a stranger cannot spend
 * the shared rate limit. `null` data means search is unavailable just now —
 * the page offers the by-hand fields instead.
 */
export async function searchSongs(payload: unknown): Promise<ActionResult<SongSearchResult[] | null>> {
  const parsed = searchSchema.safeParse(payload);
  if (!parsed.success) return ok([]);
  if (!looksLikeToken(parsed.data.token)) return fail("Searching needs your own invitation link.");

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) return fail("That's a lot of searching. Give it a few minutes.");

  const supabase = createAdminClient();
  const visitor = await resolveVisitor(supabase, parsed.data.weddingSlug, parsed.data.token);
  if (!visitor?.householdId) {
    await recordAttempt(ipHash, false);
    return fail("Searching needs your own invitation link.");
  }

  const songs = await searchCatalogue(parsed.data.query);
  if (songs === null) return ok(null);
  return ok(
    songs.map((song) => ({
      catalogueId: song.catalogueId,
      title: song.title,
      artist: song.artist,
      art: songArtPath(song.artworkUrl, 100),
    })),
  );
}

// ---------------------------------------------------------------------------
// The live chart (spec 31 §4)
// ---------------------------------------------------------------------------

const chartSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().min(1),
});

/**
 * The chart as it is now, for the page to poll every fifteen seconds.
 *
 * A server action rather than a Realtime channel (spec 31 Q1): it reads
 * through the same service-role path the page loaded with, so nothing was
 * opened to `anon` to make the list live. Needs the household's token — the
 * page it runs on is theirs, and a stranger has no business watching.
 */
export async function refreshSongChart(payload: unknown): Promise<ActionResult<PublicSong[]>> {
  const parsed = chartSchema.safeParse(payload);
  if (!parsed.success || !looksLikeToken(parsed.data.token)) return fail("No chart for that link.");

  const supabase = createAdminClient();
  const visitor = await resolveVisitor(supabase, parsed.data.weddingSlug, parsed.data.token);
  if (!visitor?.householdId) {
    // Counted as a failed token attempt, like the RSVP path: a poll is a
    // request like any other, and a script guessing tokens through it should
    // hit the same wall.
    const ipHash = await clientIpHash();
    await recordAttempt(ipHash, false);
    return fail("No chart for that link.");
  }

  return ok(await getPublicSongs(visitor.weddingId, visitor.householdId));
}

const voteSchema = z.object({
  weddingSlug: z.string().min(1).max(64),
  token: z.string().min(1),
  songId: z.string().uuid(),
});

/**
 * One household, one vote, and no vote at all without a household.
 *
 * Voting needs a token because without identity "one vote each" is a cookie,
 * and a cookie is a suggestion (spec 25 Answered, question 4). The database
 * agrees — `song_votes.household_id` is NOT NULL — so a bug here fails loudly
 * rather than silently recording anonymous ballots.
 *
 * Voting twice removes the vote, because a button that only ever goes one way
 * is a trap on a page with no undo.
 */
export async function voteForSong(payload: unknown): Promise<ActionResult<{ voted: boolean }>> {
  const parsed = voteSchema.safeParse(payload);
  if (!parsed.success) return fail("We couldn't record that vote.");

  if (!looksLikeToken(parsed.data.token)) return fail("Voting needs your own invitation link.");

  const supabase = createAdminClient();
  const visitor = await resolveVisitor(supabase, parsed.data.weddingSlug, parsed.data.token);
  if (!visitor) return fail("We couldn't find that wedding.");
  const { weddingId, householdId } = visitor;
  if (!canVote(householdId)) return fail("Voting needs your own invitation link.");

  // The song has to be one this wedding is actually showing. Without this
  // check a valid token for wedding A could vote on a song id from wedding B.
  const { data: song } = await supabase
    .from("song_requests")
    .select("id, status")
    .eq("wedding_id", weddingId)
    .eq("id", parsed.data.songId)
    .maybeSingle();
  if (!song || !["approved", "played"].includes(song.status)) {
    return fail("That song isn't on the list.");
  }

  const { data: existing } = await supabase
    .from("song_votes")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("song_request_id", song.id)
    .eq("household_id", householdId!)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("song_votes").delete().eq("id", existing.id);
    if (error) return fail("We couldn't change that vote.");
    return ok({ voted: false });
  }

  const { error } = await supabase.from("song_votes").insert({
    wedding_id: weddingId,
    song_request_id: song.id,
    household_id: householdId!,
  });
  if (error) return fail("We couldn't record that vote.");
  return ok({ voted: true });
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

export async function setSongStatus(
  id: string,
  status: "new" | "approved" | "played" | "ignored",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("song_requests")
    .update({ status })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/songs");
  return ok(undefined);
}

/** How many songs the couple may ♥. A badge loses its meaning on every row. */
const MAX_COUPLES_PICKS = 3;

/**
 * The couple's pick (spec 31 §6.3) — a ♥ badge on up to three songs. It never
 * changes the order: the chart is the guests', the badge is the couple's voice
 * on it.
 */
export async function setCouplesPick(id: string, on: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  if (on) {
    const { count } = await supabase
      .from("song_requests")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", wedding.id)
      .eq("couples_pick", true)
      .neq("id", id);
    if ((count ?? 0) >= MAX_COUPLES_PICKS) {
      return fail(`You can pick ${MAX_COUPLES_PICKS} — take the ♥ off one first.`);
    }
  }

  const { error } = await supabase
    .from("song_requests")
    .update({ couples_pick: on })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/songs");
  return ok(undefined);
}

/**
 * Two rows that are the same song, made one (spec 31 §7). The votes on the
 * one going move to the one staying — a household that voted for both keeps
 * one vote, by the unique constraint — and then it is deleted, like any other
 * song request (see `deleteSongRequest` for why that delete is a real one).
 */
export async function mergeSongs(keepId: string, dropId: string): Promise<ActionResult> {
  if (keepId === dropId) return fail("Pick two different songs to merge.");
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: both } = await supabase
    .from("song_requests")
    .select("id")
    .eq("wedding_id", wedding.id)
    .in("id", [keepId, dropId]);
  if ((both ?? []).length !== 2) return fail("Those songs aren't both on your list.");

  const { data: votes } = await supabase
    .from("song_votes")
    .select("household_id")
    .eq("wedding_id", wedding.id)
    .eq("song_request_id", dropId);

  if (votes && votes.length > 0) {
    const { error } = await supabase.from("song_votes").upsert(
      votes.map((vote) => ({
        wedding_id: wedding.id,
        song_request_id: keepId,
        household_id: vote.household_id,
      })),
      { onConflict: "song_request_id,household_id", ignoreDuplicates: true },
    );
    if (error) return fail(error.message);
  }

  const { error } = await supabase
    .from("song_requests")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", dropId);
  if (error) return fail(error.message);

  revalidatePath("/site/songs");
  return ok(undefined);
}

export async function deleteSongRequest(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // A genuine delete, not a soft one: a song request is not guest data in the
  // sense the platform rule protects — nothing is reconstructed from it later
  // and a spam row should leave no trace.
  const { error } = await supabase
    .from("song_requests")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/songs");
  return ok(undefined);
}
