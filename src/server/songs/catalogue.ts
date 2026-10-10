import "server-only";
import { parseCatalogueResults, searchKey, type CatalogueSong } from "@/lib/site/song-catalogue";

/**
 * Asking Apple about songs (spec 31 §7a) — the network half.
 *
 * Only ever called from the server. The host is fixed here, never taken from
 * a request, so this is not the SSRF shape `src/lib/net/fetch-image.ts`
 * exists for: nobody can point it anywhere else.
 *
 * WHY THE CACHE MATTERS MORE THAN USUAL: Apple throttles the Search API at
 * roughly 20 requests a minute per calling IP, and on Vercel every guest's
 * search comes from our IPs. A busy evening of thirty households typing would
 * hit it. So results are cached per normalised query for a day, per server
 * instance, and every failure — a 403, a timeout, Apple being down — comes
 * back as `null`, which the page reads as "add it by hand". Search is a
 * nicety on top of a form that works without it.
 *
 * The store is New Zealand's: every wedding on this platform is (spec 18).
 */

const SEARCH = "https://itunes.apple.com/search";
const LOOKUP = "https://itunes.apple.com/lookup";
const COUNTRY = "NZ";
const TIMEOUT_MS = 4_000;
const TTL_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 500;

type Entry = { at: number; songs: CatalogueSong[] };
const searches = new Map<string, Entry>();
const lookups = new Map<string, Entry>();

function remember(map: Map<string, Entry>, key: string, songs: CatalogueSong[]) {
  // Oldest out first: a Map iterates in insertion order.
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value as string);
  map.set(key, { at: Date.now(), songs });
}

function recall(map: Map<string, Entry>, key: string): CatalogueSong[] | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    map.delete(key);
    return null;
  }
  return hit.songs;
}

async function ask(url: URL): Promise<CatalogueSong[] | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // No referrer, no cookies: this is our server asking, about nobody.
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseCatalogueResults(await response.json());
  } catch {
    return null;
  }
}

/** Up to six songs for what was typed, or null when Apple can't be asked. */
export async function searchCatalogue(query: string): Promise<CatalogueSong[] | null> {
  const key = searchKey(query);
  if (key.length < 2) return [];

  const cached = recall(searches, key);
  if (cached) return cached;

  const url = new URL(SEARCH);
  url.searchParams.set("term", key);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "6");
  url.searchParams.set("country", COUNTRY);

  const songs = await ask(url);
  if (songs) {
    remember(searches, key, songs);
    // A guest who picks one of these is about to ask for it by id. It came
    // from Apple through this server a moment ago, so the check needn't ask
    // again — one fewer request against the shared limit.
    for (const song of songs) remember(lookups, song.catalogueId, [song]);
  }
  return songs;
}

/**
 * One track by id — how a picked search result is checked before it is
 * stored. The title, artist and artwork a browser sends are never trusted:
 * otherwise a guest could post any title under any artwork address.
 */
export async function lookupCatalogue(catalogueId: string): Promise<CatalogueSong | null> {
  if (!/^[0-9]{1,20}$/.test(catalogueId)) return null;

  const cached = recall(lookups, catalogueId);
  if (cached) return cached[0] ?? null;

  const url = new URL(LOOKUP);
  url.searchParams.set("id", catalogueId);
  url.searchParams.set("entity", "song");
  url.searchParams.set("country", COUNTRY);

  const songs = await ask(url);
  const song = songs?.find((candidate) => candidate.catalogueId === catalogueId) ?? null;
  if (song) remember(lookups, catalogueId, [song]);
  return song;
}
