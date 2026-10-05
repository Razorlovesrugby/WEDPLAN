/**
 * The order guests see the song list in (spec 28 §6.2).
 *
 * Most votes first. Within a tie, **newest first** — a guest who has just added
 * a song finds it at the top of its group instead of filed alphabetically among
 * strangers', which is most of what makes "it's on the list" believable. The id
 * settles two requests made in the same instant, so the order is the same on
 * every render rather than following whatever the database felt like.
 *
 * The list does not re-sort under a vote: the page keeps the order it loaded
 * with and the next load picks the new one up. This function is only ever asked
 * on the server.
 */
export function rankSongs<T extends { id: string; votes: number; createdAt: string }>(songs: readonly T[]): T[] {
  return [...songs].sort(
    (a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}
