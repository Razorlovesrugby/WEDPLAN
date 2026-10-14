/**
 * The small rules that make the song list read as a chart (spec 31 §4.3, §6).
 *
 * All pure and all here, so the guest's component only draws: which song is
 * hot, which one is playing, how far each moved since this guest last looked,
 * and when a fresh ranking may be shown without moving a row under a thumb.
 */

/** A vote this recent counts towards "hot". */
export const HOT_WINDOW_MS = 48 * 60 * 60_000;
/** And a song needs at least this many of them. */
export const HOT_MIN_VOTES = 3;
/** "Now playing" lasts about a song's length after the couple tap Played. */
export const NOW_PLAYING_MS = 5 * 60_000;
/** No re-order within this long of the guest's own tap or scroll in the list. */
export const HOLD_MS = 3_000;
/** How many rows show before "Show all". */
export const CHART_TOP = 10;

/**
 * The one song with the most votes in the last 48 hours, if it has at least
 * three. One, not several: a chart where everything is on fire has no fire.
 * A tie goes to the song higher in the chart (the earlier in `songs`).
 */
export function hotSongId(songs: readonly { id: string; recentVotes: number }[]): string | null {
  let best: { id: string; recentVotes: number } | null = null;
  for (const song of songs) {
    if (song.recentVotes < HOT_MIN_VOTES) continue;
    if (!best || song.recentVotes > best.recentVotes) best = song;
  }
  return best?.id ?? null;
}

/** The most recently played song, if it was played in the last five minutes. */
export function nowPlayingId(
  songs: readonly { id: string; playedAt: string | null }[],
  now: number = Date.now(),
): string | null {
  let latest: { id: string; at: number } | null = null;
  for (const song of songs) {
    if (!song.playedAt) continue;
    const at = Date.parse(song.playedAt);
    if (Number.isNaN(at) || now - at > NOW_PLAYING_MS || at > now + 60_000) continue;
    if (!latest || at > latest.at) latest = { id: song.id, at };
  }
  return latest?.id ?? null;
}

export type Movement = { kind: "up" | "down"; by: number } | { kind: "new" } | null;

/**
 * How each song moved since the ranking this guest last saw.
 *
 * `previous` is null on a first visit (or a new phone), and then nothing is
 * marked — "everything is NEW" on the first look is noise, not news.
 */
export function movementSince(previous: readonly string[] | null, current: readonly string[]): Map<string, Movement> {
  const moves = new Map<string, Movement>();
  if (!previous) return moves;
  const before = new Map(previous.map((id, index) => [id, index]));
  current.forEach((id, index) => {
    const was = before.get(id);
    if (was === undefined) moves.set(id, { kind: "new" });
    else if (was > index) moves.set(id, { kind: "up", by: was - index });
    else if (was < index) moves.set(id, { kind: "down", by: index - was });
    else moves.set(id, null);
  });
  return moves;
}

/**
 * May a newly arrived ranking be shown now?
 *
 * Counts always update at once; ORDER waits until the guest has not touched
 * the list for `HOLD_MS`. A row sliding away as a thumb comes down is how
 * somebody votes for the wrong song (spec 28 §6.2), and this is the rule that
 * lets the list be live without reopening that.
 */
export function mayReorder(lastTouchedAt: number | null, now: number = Date.now()): boolean {
  return lastTouchedAt === null || now - lastTouchedAt >= HOLD_MS;
}

/**
 * The order to draw: `shown` (what is on screen) kept as it is, with songs
 * that have since disappeared removed and new ones appended at the bottom,
 * until a re-order is allowed. Counts come from the fresh data either way.
 */
export function heldOrder(shown: readonly string[], fresh: readonly string[]): string[] {
  const freshSet = new Set(fresh);
  const kept = shown.filter((id) => freshSet.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...fresh.filter((id) => !keptSet.has(id))];
}
