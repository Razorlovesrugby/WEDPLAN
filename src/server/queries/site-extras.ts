import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDressCodes, type ResolvedDressCode } from "@/lib/site/dress-codes";
import type { ArrivalPoint } from "@/lib/site/travel";
import type {
  ArrivalPointRow,
  DressCodeNoteRow,
  DressCodeRow,
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

/** Everything the public page needs, in one pass. */
export async function getPublicSiteExtras(
  weddingId: string,
  events: EventLike[],
  viewerHouseholdId: string | null,
): Promise<SiteExtras> {
  const supabase = createAdminClient();

  const [dressCodes, arrivals, songRows, voteRows, noteRows] = await Promise.all([
    readDressCodes(supabase, weddingId, events),
    supabase.from("arrival_points").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase
      .from("song_requests")
      .select("*")
      .eq("wedding_id", weddingId)
      // Approved OR played: a song the DJ has already played is still part of
      // the list guests built, and hiding it mid-reception would look like it
      // had been rejected.
      .in("status", ["approved", "played"])
      .order("created_at"),
    supabase.from("song_votes").select("song_request_id, household_id").eq("wedding_id", weddingId),
    supabase
      .from("guest_notes")
      .select("id, body, author_name, created_at")
      .eq("wedding_id", weddingId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const votes = (voteRows.data ?? []) as { song_request_id: string; household_id: string }[];
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const vote of votes) {
    counts.set(vote.song_request_id, (counts.get(vote.song_request_id) ?? 0) + 1);
    if (viewerHouseholdId && vote.household_id === viewerHouseholdId) mine.add(vote.song_request_id);
  }

  const songs: PublicSong[] = ((songRows.data ?? []) as SongRequestRow[])
    .map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      askedBy: row.asked_by,
      votes: counts.get(row.id) ?? 0,
      votedByViewer: mine.has(row.id),
    }))
    // Most-wanted first, and alphabetical within a tie so the order is stable
    // between renders rather than following whatever the database felt like.
    .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));

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
