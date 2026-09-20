/**
 * Household addresses — the readable half, the credential half, and the
 * single URL segment they make together (spec 21).
 *
 *     /w/ray-and-olivia/okonkwo-4f7ak
 *                       ^^^^^^^ ^^^^^
 *                       slug    suffix
 *
 * Pure, because everything here is decided by a string: the server action
 * that renames one and the route that resolves one both go through this file,
 * and neither wants a database round trip to find out that "The Smiths" is
 * `smiths` or that `okonkwo-4f7ak` splits where it does.
 *
 * **This mirrors `household_slugify()` in `0022`, deliberately.** The database
 * derives the address on insert (so a household created by any path has one);
 * this derives the suggestion the planner sees in the editor. They have to
 * agree, so `household-slug.test.ts` carries the same cases as
 * `supabase/tests/08_household_slugs.sql`, and a change to one is a change to
 * both.
 */

/**
 * Crockford base32: no `i`, `l`, `o` or `u`. Nothing to misread as a zero
 * when somebody reads a link down the phone, and far fewer accidental words
 * than a full alphabet would throw up.
 */
export const SUFFIX_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const SUFFIX_LENGTH = 5;

const SUFFIX_RE = new RegExp(`^[${SUFFIX_ALPHABET}]{${SUFFIX_LENGTH}}$`);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SLUG_MIN = 2;
export const SLUG_MAX = 64;

/** What `household_slugify()` falls back to, and what the shape check allows. */
export const SLUG_FALLBACK = "household";

/**
 * Reserved at the second segment.
 *
 * Strictly speaking the suffix already makes this unreachable — a real
 * address is `rsvp-4f7ak`, never `rsvp` — so this is a guard against a future
 * change that drops or shortens the suffix rather than against anything
 * reachable today. Cheap, and the failure it prevents is a route silently
 * shadowing another one.
 */
export const RESERVED_SLUGS = new Set([
  "api",
  "i",
  "m",
  "opengraph-image",
  "privacy",
  "rsvp",
  "site",
  "w",
]);

/**
 * The Latin-1 transliteration `slugify()` does in SQL. Kept as the same table
 * rather than `String.normalize("NFD")` so the two implementations cannot
 * disagree about an edge case: the migration cannot use `unaccent` (an
 * extension that may not exist on the cluster), so this is the shape the
 * database will actually produce.
 */
const TRANSLITERATE_FROM =
  "àáâãäåāăąçćĉċčðďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňŉòóôõöøōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżžæœßñ";
const TRANSLITERATE_TO =
  "aaaaaaaaacccccdddeeeeeeeeegggghhiiiiiiiiijklllllnnnnnoooooooooRrrsssstttuuuuuuuuuuwyyyzzzaosn";

/** `slugify()` from `0015`, in TypeScript. Empty string for nothing usable. */
export function slugify(input: string): string {
  const transliterated = [...input.toLowerCase()]
    .map((char) => {
      const index = TRANSLITERATE_FROM.indexOf(char);
      return index === -1 ? char : TRANSLITERATE_TO[index];
    })
    .join("");

  return transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The filler strip (Q7): a leading "The", a trailing "family" / "household" /
 * "whānau".
 *
 * "The Okonkwo family" → "Okonkwo". "Theodore Blake" is untouched — the
 * pattern needs whitespace after "the", or every name beginning with those
 * three letters would lose them.
 */
export function stripHouseholdFiller(name: string): string {
  return name
    .replace(/^\s*the\s+/i, "")
    .replace(/\s*(family|household|wh[āa]nau)\s*$/i, "");
}

/**
 * The readable half of an address, derived from a household's display name.
 *
 * Never empty, and never shorter than the shape check allows — a household
 * called "J" gets `household` rather than an address the database will
 * reject. Two fallbacks in order, matching `household_slugify()`: the
 * unstripped name (so "The Family" keeps something readable rather than
 * losing its whole name to the strip), then the constant.
 */
export function householdSlugify(name: string | null | undefined): string {
  const raw = name ?? "";
  const candidates = [slugify(stripHouseholdFiller(raw)), slugify(raw)];

  for (const candidate of candidates) {
    const trimmed = candidate.slice(0, SLUG_MAX).replace(/-+$/, "");
    if (trimmed.length >= SLUG_MIN) return trimmed;
  }
  return SLUG_FALLBACK;
}

/** Is this something the database will accept in the slug column? */
export function isValidHouseholdSlug(value: string): boolean {
  return (
    SLUG_RE.test(value) &&
    value.length >= SLUG_MIN &&
    value.length <= SLUG_MAX &&
    !RESERVED_SLUGS.has(value)
  );
}

export function isValidSuffix(value: string): boolean {
  return SUFFIX_RE.test(value);
}

/**
 * A fresh suffix.
 *
 * `crypto.getRandomValues`, not `Math.random()`: this is the credential that
 * stands between a guessed surname and a household's guest list. Rejection
 * sampling rather than `% 32` on a byte — 256 is a multiple of 32 so the
 * modulo would in fact be unbiased here, but writing it this way means the
 * next person to change the alphabet length does not silently introduce a
 * bias.
 *
 * Only used by the reissue path; every other suffix is drawn by the database
 * trigger, so a household created outside the app still has one.
 */
export function generateSuffix(): string {
  const max = Math.floor(256 / SUFFIX_ALPHABET.length) * SUFFIX_ALPHABET.length;
  let out = "";
  while (out.length < SUFFIX_LENGTH) {
    const bytes = new Uint8Array(SUFFIX_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (out.length === SUFFIX_LENGTH) break;
      if (byte < max) out += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
    }
  }
  return out;
}

export type HouseholdAddress = { slug: string; suffix: string };

/** `okonkwo-4f7ak` — one URL segment, which is how it arrives from the router. */
export function formatAddress({ slug, suffix }: HouseholdAddress): string {
  return `${slug}-${suffix}`;
}

/**
 * Split a URL segment back into its two halves.
 *
 * The split is on the LAST hyphen, because the readable half may contain any
 * number of them (`priya-dev-raman-7t3mq`). Returns null for anything that is
 * not shaped like an address, so the resolver can refuse it before it reaches
 * the database and before it costs a throttle slot.
 */
export function parseAddress(segment: string): HouseholdAddress | null {
  const cut = segment.lastIndexOf("-");
  if (cut <= 0) return null;

  const slug = segment.slice(0, cut);
  const suffix = segment.slice(cut + 1);

  if (!isValidSuffix(suffix)) return null;
  // Reserved words are allowed through here: a stored slug that predates a
  // route being added should keep resolving rather than 404 for its household.
  if (!SLUG_RE.test(slug) || slug.length < SLUG_MIN || slug.length > SLUG_MAX) return null;

  return { slug, suffix };
}

/** The path a household's page lives at. Relative — callers make it absolute. */
export function householdPath(weddingSlug: string, address: HouseholdAddress): string {
  return `/w/${weddingSlug}/${formatAddress(address)}`;
}
