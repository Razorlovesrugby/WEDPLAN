import "server-only";
import { rankSongs } from "@/lib/site/song-rank";
import { HOT_WINDOW_MS, hotSongId } from "@/lib/site/song-chart";
import { songArtPath } from "@/lib/site/song-catalogue";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDressCodes, type ResolvedDressCode } from "@/lib/site/dress-codes";
import { toPublicBank, toPublicFund, type PublicBank, type PublicFund } from "@/lib/site/gift-funds";
import type { ArrivalPoint } from "@/lib/site/travel";
import type {
  ArrivalPointRow,
  DressCodeNoteRow,
  DressCodeRow,
  GiftBankDetailsRow,
  GiftFundRow,
  GuestNoteRow,
  SongRequestRow,
} from "@/lib/types/database";

/**
 * The things spec 25's blocks read.
 *
 * Two readers per thing, the same split the rest of this directory uses: the
 * planner's goes through `createClient()` so RLS scopes it, the public one
 * uses the service role because a guest has no session and scopes itself to
 * the single wedding the caller already resolved from a slug or a token.
 *
 * **Everything public here filters on `status = 'approved'` in the query, not
 * in the component.** A filter in a component is one somebody moves while
 * refactoring, and the failure is silent: nothing breaks, strangers' words
 * just start appearing on a wedding site.
 */

export type PublicSong = {
  id: string;
  title: string;
  artist: string | null;
  askedBy: string | null;
  votes: number;
  /** True when the household reading the page has already voted for it. */
  votedByViewer: boolean;
  /** True when the household reading the page is the one that asked for it. */
  askedByViewer: boolean;
  /** Our proxied artwork address (`/api/public/song-art?…`), never Apple's (spec 31 §7a). */
  art: string | null;
  /** The couple's ♥ — a badge only. */
  couplesPick: boolean;
  /** When it was played on the night, or null. */
  playedAt: string | null;
  /** The one song with the most votes in the last 48 hours (spec 31 §4.3). */
  hot: boolean;
};

export type PublicNote = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
};

export type SiteExtras = {
  dressCodes: ResolvedDressCode[];
  arrivals: ArrivalPoint[];
  songs: PublicSong[];
  notes: PublicNote[];
  giftFunds: PublicFund[];
  /** Where to send a gift. Null until the couple have written it down. */
  giftBank: PublicBank | null;
};

type EventLike = { id: string; name: string; dress_code_id?: string | null };

/**
 * Dress codes, with their notes and the events wearing them.
 *
 * `events` comes from the caller rather than being read here, because the
 * caller already knows which events this reader may see — a household's page
 * has been filtered by spec 22's rules long before this runs, and reading the
 * full list here would quietly undo that.
 */
async function readDressCodes(
  supabase: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  events: EventLike[],
): Promise<ResolvedDressCode[]> {
  const [codes, notes] = await Promise.all([
    supabase.from("dress_codes").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("dress_code_notes").select("*").eq("wedding_id", weddingId).order("sort_order"),
  ]);

  return resolveDressCodes(
    (codes.data ?? []) as DressCodeRow[],
    (notes.data ?? []) as DressCodeNoteRow[],
    events,
  );
}

/**
 * The song chart, ranked, as one household sees it (spec 25 §11, spec 31).
 *
 * Its own function because two callers need exactly this and nothing else:
 * the page as it loads, and the chart polling for fresh counts every fifteen
 * seconds (`refreshSongChart`). One reader, so the polled list can never be
 * filtered differently from the one the page drew first.
 *
 * Not wrapped in `cache()`: the poll's whole point is a fresh read, and the
 * page calls it once.
 */
export async function getPublicSongs(
  weddingId: string,
  viewerHouseholdId: string | null,
): Promise<PublicSong[]> {
  const supabase = createAdminClient();
  const [songRows, voteRows] = await Promise.all([
    supabase
      .from("song_requests")
      .select("*")
      .eq("wedding_id", weddingId)
      // Approved OR played: a song the DJ has already played is still part of
      // the list guests built, and hiding it mid-reception would look like it
      // had been rejected.
      .in("status", ["approved", "played"])
      .order("created_at"),
    supabase
      .from("song_votes")
      .select("song_request_id, household_id, created_at")
      .eq("wedding_id", weddingId),
  ]);

  const votes = (voteRows.data ?? []) as { song_request_id: string; household_id: string; created_at: string }[];
  const counts = new Map<string, number>();
  const recent = new Map<string, number>();
  const mine = new Set<string>();
  const since = Date.now() - HOT_WINDOW_MS;
  for (const vote of votes) {
    counts.set(vote.song_request_id, (counts.get(vote.song_request_id) ?? 0) + 1);
    if (Date.parse(vote.created_at) >= since) {
      recent.set(vote.song_request_id, (recent.get(vote.song_request_id) ?? 0) + 1);
    }
    if (viewerHouseholdId && vote.household_id === viewerHouseholdId) mine.add(vote.song_request_id);
  }

  const ranked = rankSongs(
    ((songRows.data ?? []) as SongRequestRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      askedBy: row.asked_by,
      votes: counts.get(row.id) ?? 0,
      votedByViewer: mine.has(row.id),
      askedByViewer: viewerHouseholdId !== null && row.household_id === viewerHouseholdId,
      art: songArtPath(row.artwork_url, 160),
      couplesPick: row.couples_pick === true,
      playedAt: row.played_at ?? null,
      hot: false,
      recentVotes: recent.get(row.id) ?? 0,
      createdAt: row.created_at,
    })),
  );
  const hot = hotSongId(ranked);

  return ranked.map(({ createdAt: _createdAt, recentVotes: _recentVotes, ...song }) => ({
    ...song,
    hot: song.id === hot,
  }));
}

/** Everything the public page needs, in one pass. */
export async function getPublicSiteExtras(
  weddingId: string,
  events: EventLike[],
  viewerHouseholdId: string | null,
): Promise<SiteExtras> {
  const supabase = createAdminClient();

  const [dressCodes, arrivals, songs, noteRows, fundRows, bankRow] = await Promise.all([
    readDressCodes(supabase, weddingId, events),
    supabase.from("arrival_points").select("*").eq("wedding_id", weddingId).order("sort_order"),
    getPublicSongs(weddingId, viewerHouseholdId),
    supabase
      .from("guest_notes")
      .select("id, body, author_name, created_at")
      .eq("wedding_id", weddingId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100),
    // No status ladder: a fund exists or it does not. Nothing a guest writes
    // reaches this table, so there is nothing here to moderate.
    supabase
      .from("gift_funds")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("created_at"),
    // Where to send a gift (0033). An error here — the migration not applied
    // yet, say — reads as "no details", which hides the Contribute button
    // rather than costing a guest their whole page.
    supabase.from("gift_bank_details").select("*").eq("wedding_id", weddingId).maybeSingle(),
  ]);

  const notes: PublicNote[] = (
    (noteRows.data ?? []) as Pick<GuestNoteRow, "id" | "body" | "author_name" | "created_at">[]
  ).map((row) => ({
    id: row.id,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
  }));

  return {
    dressCodes,
    arrivals: (arrivals.data ?? []) as ArrivalPointRow[],
    songs,
    notes,
    giftFunds: ((fundRows.data ?? []) as GiftFundRow[]).map(toPublicFund),
    giftBank: toPublicBank(bankRow.data as GiftBankDetailsRow | null),
  };
}

// ---------------------------------------------------------------------------
// The planner's side
// ---------------------------------------------------------------------------

/** Every code with its notes and events, for `/events` and the attire editor. */
export const getDressCodes = cache(
  async (weddingId: string): Promise<ResolvedDressCode[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("events")
      .select("id, name, dress_code_id")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("starts_at");
    return readDressCodes(supabase, weddingId, (data ?? []) as EventLike[]);
  },
);

export const getArrivalPoints = cache(async (weddingId: string): Promise<ArrivalPointRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("arrival_points")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order");
  return (data ?? []) as ArrivalPointRow[];
});

export type PlannerNote = GuestNoteRow & { householdName: string | null };

/**
 * The guestbook queue.
 *
 * Everything, in every state — this is the screen where the planner decides.
 * Newest first, because the thing you want is the one that just arrived.
 */
export const getGuestNotes = cache(async (weddingId: string): Promise<PlannerNote[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("guest_notes")
    .select("*, households(display_name)")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as (GuestNoteRow & { households: { display_name: string } | null })[]).map(
    (row) => ({ ...row, householdName: row.households?.display_name ?? null }),
  );
});

/** The couple's account details, for the planner's own screen. Null before they have any. */
export const getGiftBankDetails = cache(async (weddingId: string): Promise<GiftBankDetailsRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gift_bank_details")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();
  return (data ?? null) as GiftBankDetailsRow | null;
});

/** The funds, for the planner's own screen. Every one, in their own order. */
export const getGiftFunds = cache(async (weddingId: string): Promise<GiftFundRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gift_funds")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as GiftFundRow[];
});

// ---------------------------------------------------------------------------
// The couple's song list (spec 31 §7)
// ---------------------------------------------------------------------------

export type PlannerSong = {
  id: string;
  title: string;
  artist: string | null;
  status: SongRequestRow["status"];
  createdAt: string;
  /** The household that asked, else whatever name was typed, else null. */
  askedBy: string | null;
  votes: number;
  /** Which households voted — the couple's to see, never a guest's (spec 31 Q6). */
  voters: string[];
  couplesPick: boolean;
  playedAt: string | null;
  art: string | null;
};

/**
 * Every request, ranked the way guests see the chart — most votes, ties newest
 * — whatever its status, with who voted. Read as the collaborator, so RLS
 * decides; the guest page's service-role reader is the other function above.
 */
export const getPlannerSongs = cache(async (weddingId: string): Promise<PlannerSong[]> => {
  const supabase = await createClient();
  const [songRows, voteRows] = await Promise.all([
    supabase
      .from("song_requests")
      .select("*, households(display_name)")
      .eq("wedding_id", weddingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("song_votes")
      .select("song_request_id, households(display_name)")
      .eq("wedding_id", weddingId),
  ]);

  const voters = new Map<string, string[]>();
  for (const vote of (voteRows.data ?? []) as unknown as {
    song_request_id: string;
    households: { display_name: string } | null;
  }[]) {
    const list = voters.get(vote.song_request_id) ?? [];
    list.push(vote.households?.display_name ?? "A household");
    voters.set(vote.song_request_id, list);
  }

  const rows = (songRows.data ?? []) as unknown as (SongRequestRow & {
    households: { display_name: string } | null;
  })[];

  return rankSongs(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      status: row.status,
      createdAt: row.created_at,
      // A request from a household's own page is attributed automatically;
      // one from the old shared site carries whatever name was typed, or none.
      askedBy: row.households?.display_name ?? row.asked_by,
      votes: voters.get(row.id)?.length ?? 0,
      voters: (voters.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
      couplesPick: row.couples_pick === true,
      playedAt: row.played_at ?? null,
      art: songArtPath(row.artwork_url, 100),
    })),
  );
});
