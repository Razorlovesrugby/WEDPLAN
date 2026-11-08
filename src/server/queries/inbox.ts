import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  fromClaim,
  fromNote,
  fromQuestion,
  fromSong,
  fromUnable,
  sortInbox,
  unableSince,
  type InboxItem,
} from "@/lib/inbox";
import { getGuestNotes, getGuestQuestions, getPlannerSongs } from "./site-extras";
import { getRegistryClaims, getRegistrySettings } from "./registry";

/**
 * The Inbox (spec 43): five sources merged. Each source fails soft, because
 * one missing table (a migration not yet applied) must not take the whole
 * Inbox, or the sidebar badge on every page, down with it.
 */

async function soft<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

type UnableRow = {
  id: string;
  first_name: string;
  preferred_name: string | null;
  household_id: string;
  unable_to_attend_at: string;
  households: { display_name: string } | null;
};

const getRecentUnable = cache(async (weddingId: string): Promise<UnableRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .select("id, first_name, preferred_name, household_id, unable_to_attend_at, households(display_name)")
    .eq("wedding_id", weddingId)
    .is("deleted_at", null)
    .gte("unable_to_attend_at", unableSince(new Date()))
    .order("unable_to_attend_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UnableRow[];
});

export const getInboxItems = cache(async (weddingId: string): Promise<InboxItem[]> => {
  const [questions, songs, notes, settings, claims, unable] = await Promise.all([
    soft(() => getGuestQuestions(weddingId), []),
    soft(() => getPlannerSongs(weddingId), []),
    soft(() => getGuestNotes(weddingId), []),
    soft(() => getRegistrySettings(weddingId), null),
    soft(() => getRegistryClaims(weddingId), []),
    soft(() => getRecentUnable(weddingId), []),
  ]);
  const since = settings?.last_viewed_claims_at ?? null;

  return sortInbox([
    ...questions.map(fromQuestion),
    ...songs.map(fromSong),
    ...notes.map(fromNote),
    ...claims.map((claim) => fromClaim(claim, since)),
    ...unable.map((row) =>
      fromUnable({
        guestId: row.id,
        guestName: row.preferred_name?.trim() || row.first_name,
        householdId: row.household_id,
        householdName: row.households?.display_name ?? "A household",
        at: row.unable_to_attend_at,
      }),
    ),
  ]);
});

/**
 * The sidebar badge: the same rule as the list's "Needs you", counted without
 * loading every row, since it runs on every page. Never throws.
 */
export const getInboxNeedsYouCount = cache(async (weddingId: string): Promise<number> => {
  const supabase = await createClient();
  const countNew = (table: "guest_questions" | "song_requests" | "guest_notes") =>
    soft(async () => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("wedding_id", weddingId)
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    }, 0);

  const claims = soft(async () => {
    const settings = await getRegistrySettings(weddingId);
    let query = supabase
      .from("registry_claims")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .is("released_at", null);
    if (settings.last_viewed_claims_at) query = query.gt("created_at", settings.last_viewed_claims_at);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }, 0);

  const unable = soft(async () => {
    const { count, error } = await supabase
      .from("guests")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .gte("unable_to_attend_at", unableSince(new Date()));
    if (error) throw error;
    return count ?? 0;
  }, 0);

  const counts = await Promise.all([countNew("guest_questions"), countNew("song_requests"), countNew("guest_notes"), claims, unable]);
  return counts.reduce((sum, count) => sum + count, 0);
});
