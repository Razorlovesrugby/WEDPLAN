/**
 * Reading Apple's song catalogue (spec 31 §7a) — the pure half.
 *
 * The network half is `src/server/songs/catalogue.ts`. This file only turns
 * what Apple sends into what we keep, and decides which artwork addresses the
 * proxy may fetch, so all of it can be tested against a saved response rather
 * than the live API.
 *
 * THE RULE THIS SERVES: a guest's browser never talks to Apple. The page URL
 * is the household's credential (spec 23 Q1), and an image request to a third
 * party hands it over along with the guest's IP. So the server searches, and
 * artwork is loaded through `/api/public/song-art` — which will fetch only from
 * Apple's image host, at only the sizes below.
 */

export type CatalogueSong = {
  /** iTunes trackId, as digits. */
  catalogueId: string;
  title: string;
  artist: string;
  /** Apple's artwork address (100×100), or null. Never shown to a browser. */
  artworkUrl: string | null;
};

/** The two sizes the page ever asks for. Anything else is refused. */
export const ARTWORK_SIZES = [100, 160] as const;
export type ArtworkSize = (typeof ARTWORK_SIZES)[number];

/**
 * Apple's image host and nothing else: https, no port, no credentials, a
 * hostname that ends in `.mzstatic.com` at a dot boundary. Mirrors the check
 * constraint in 0035, so a row and a request fail in the same direction.
 */
export function isAppleArtworkUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)*\.mzstatic\.com$/.test(url.hostname)
  );
}

/**
 * The same artwork at another size. Apple's thumbnail addresses end in
 * `/100x100bb.jpg`; the size is part of the path. One that does not look like
 * that is returned unchanged rather than guessed at.
 */
export function artworkAt(url: string, size: ArtworkSize): string {
  return url.replace(/\/\d{2,4}x\d{2,4}(bb)?\.(jpg|png|webp)$/i, `/${size}x${size}bb.jpg`);
}

/** Our address for a piece of artwork — the only one a page ever renders. */
export function songArtPath(artworkUrl: string | null | undefined, size: ArtworkSize): string | null {
  if (!isAppleArtworkUrl(artworkUrl)) return null;
  return `/api/public/song-art?s=${size}&u=${encodeURIComponent(artworkUrl)}`;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
}

/**
 * Apple's `results` array, as songs. Anything that is not a song with a
 * numeric id, a title and an artist is dropped; nothing is trusted to be the
 * shape the documentation says.
 */
export function parseCatalogueResults(body: unknown): CatalogueSong[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];

  const songs: CatalogueSong[] = [];
  const seen = new Set<string>();
  for (const entry of results) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    if (row.wrapperType !== undefined && row.wrapperType !== "track") continue;
    if (row.kind !== undefined && row.kind !== "song") continue;

    const id = typeof row.trackId === "number" || typeof row.trackId === "string" ? String(row.trackId) : "";
    if (!/^[0-9]{1,20}$/.test(id) || seen.has(id)) continue;

    const title = str(row.trackName, 200);
    const artist = str(row.artistName, 200);
    if (!title || !artist) continue;

    const artwork = row.artworkUrl100;
    seen.add(id);
    songs.push({
      catalogueId: id,
      title,
      artist,
      artworkUrl: isAppleArtworkUrl(artwork) ? artwork : null,
    });
  }
  return songs;
}

/** How a query is keyed in the cache: what was typed, minus what doesn't matter. */
export function searchKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
}
