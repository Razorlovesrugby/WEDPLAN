/**
 * When two songs are the same song, and when one is on the do-not-play list
 * (spec 31 §6, items 1 and 2).
 *
 * Both are the same question — "does what this guest typed name that song?" —
 * so both go through one normaliser. Two normalisers is how "Mr. Brightside"
 * gets refused as a duplicate and then accepted past the ban list.
 *
 * The normaliser is deliberately forgiving about the things people vary
 * without meaning a different song (case, punctuation, accents, a leading
 * "The", "&" for "and", "(Remastered 2011)", "feat. somebody") and strict
 * about everything else. A false "that's already on the list" costs a guest
 * one tap on "No, mine's different"; a false ban costs them their song, so the
 * ban match is the stricter of the two (see `isBanned`).
 */

/** Bracketed or dashed tails that name a version rather than a song. */
const VERSION_TAIL =
  /\s*(?:[([][^)\]]*(?:feat|ft\.|with |remaster|version|edit|mix|live|mono|stereo|acoustic|deluxe|anniversary|single)[^)\]]*[)\]]|\s-\s.*(?:remaster|version|edit|mix|live|mono|stereo|acoustic|deluxe|single).*)$/i;

/** "feat. X" / "ft. X" / "featuring X" outside brackets. */
const FEATURING = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

function base(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

export function normaliseTitle(title: string): string {
  let value = title.trim();
  // Strip repeatedly: "Song (feat. X) [Remastered 2011]" has two tails.
  for (let i = 0; i < 3; i += 1) {
    const next = value.replace(VERSION_TAIL, "").replace(FEATURING, "");
    if (next === value) break;
    value = next;
  }
  return base(value);
}

export function normaliseArtist(artist: string | null | undefined): string {
  if (!artist) return "";
  return base(artist.replace(FEATURING, "").split(/\s*,\s*/)[0] ?? "");
}

export type SongLike = { title: string; artist?: string | null };

/**
 * The same song: the titles agree, and the artists agree — or one side did
 * not say. A typed-in "Valerie" with no artist matches the searched "Valerie ·
 * Amy Winehouse", which is almost always what the guest meant, and the button
 * it produces ("Already on the list — vote for it?") has a "No, mine's
 * different" beside it for when it is not.
 */
export function sameSong(a: SongLike, b: SongLike): boolean {
  const titleA = normaliseTitle(a.title);
  if (titleA === "" || titleA !== normaliseTitle(b.title)) return false;
  const artistA = normaliseArtist(a.artist);
  const artistB = normaliseArtist(b.artist);
  return artistA === "" || artistB === "" || artistA === artistB;
}

/** The first existing song this one duplicates, or null. */
export function findDuplicate<T extends SongLike>(candidate: SongLike, existing: readonly T[]): T | null {
  return existing.find((song) => sameSong(candidate, song)) ?? null;
}

// ---------------------------------------------------------------------------
// The do-not-play list
// ---------------------------------------------------------------------------

export type Ban =
  /** "Wonderwall", or "Wonderwall - Oasis" */
  | { kind: "song"; line: string; title: string; artist: string }
  /** "anything by Nickelback" */
  | { kind: "artist"; line: string; artist: string };

export const DEFAULT_REFUSAL = "Nice try. That one's on the do-not-play list.";

/**
 * The couple's list, one entry per line, as typed in the block inspector.
 *
 *   Wonderwall                 that title, whoever sings it
 *   Wonderwall - Oasis         that title by that artist (" - ", " — " or " · ")
 *   anything by Nickelback     everything by that artist ("everything by", "any songs by")
 *
 * `line` keeps what they wrote, for showing to guests: the list is theirs and
 * reads in their words, not ours.
 */
export function parseDoNotPlay(raw: unknown): Ban[] {
  if (typeof raw !== "string") return [];
  const bans: Ban[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    // The prefix word is required: a bare "By the Way" is a song.
    const everything = /^(?:anything|everything|any songs?|all songs?)\s+by\s+(.+)$/i.exec(line);
    if (everything) {
      const artist = normaliseArtist(everything[1]);
      if (artist) bans.push({ kind: "artist", line, artist });
      continue;
    }
    // Not " by ": "Stand by Me" is a title.
    const [title, artist] = line.split(/\s+(?:-|—|–|·)\s+/);
    const normalisedTitle = normaliseTitle(title ?? "");
    if (normalisedTitle) bans.push({ kind: "song", line, title: normalisedTitle, artist: normaliseArtist(artist) });
  }
  return bans.slice(0, 50);
}

/**
 * The ban this song falls under, or null.
 *
 * Stricter than `sameSong`: a ban written with an artist matches only that
 * artist, and a song typed with no artist is caught only by a title-only
 * ban. Refusing somebody's song by guesswork is worse than letting one
 * Wonderwall through.
 */
export function isBanned(song: SongLike, bans: readonly Ban[]): Ban | null {
  const title = normaliseTitle(song.title);
  const artist = normaliseArtist(song.artist);
  for (const ban of bans) {
    if (ban.kind === "artist") {
      if (artist !== "" && artist === ban.artist) return ban;
      continue;
    }
    if (ban.title !== title) continue;
    if (ban.artist === "" || ban.artist === artist) return ban;
  }
  return null;
}

/** The couple's refusal line, or the default. */
export function refusalLine(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const value = (payload as Record<string, unknown>)["do_not_play_line"];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return DEFAULT_REFUSAL;
}

/** The do-not-play list from a block payload. */
export function doNotPlayFrom(payload: unknown): Ban[] {
  if (typeof payload !== "object" || payload === null) return [];
  return parseDoNotPlay((payload as Record<string, unknown>)["do_not_play"]);
}
