/**
 * Pulling the couple out of a wedding's name, for the monogram (spec 14 §5).
 *
 * `weddings.name` is free text a planner typed — "Alex & Sam", "Alex and Sam",
 * "Sam + Alex's wedding", "The Okonkwo–Baptiste Wedding". The monogram wants
 * two initials out of that, and the honest answer for anything it cannot split
 * is *no monogram*: a lone "T" for "The Wedding" is worse than the ampersand
 * rule the theme falls back to.
 */

const JOINERS = /\s+(?:&|\+|and|og|et|y|e)\s+|\s*&\s*|\s*\+\s*/i;

const NOISE = /\b(?:the|our|a)\b|\bwedding\b|['’]s\b/gi;

function firstLetter(part: string): string | null {
  // Match the first letter of any alphabet, not just A–Z: a guest list is not
  // always Latin, and taking [A-Z] would silently drop Å, Ø, Ż and everything
  // non-Latin to the fallback.
  const match = part.match(/\p{L}/u);
  return match ? match[0].toUpperCase() : null;
}

export type Monogram = { left: string; right: string };

/**
 * Two initials, or null when the name will not yield them.
 *
 * Null is a real answer and the caller renders nothing — see the module note.
 */
export function monogramFromName(name: string | null | undefined): Monogram | null {
  if (!name) return null;

  const cleaned = name.replace(NOISE, " ").trim();
  if (cleaned === "") return null;

  const parts = cleaned
    .split(JOINERS)
    .map((part) => part.trim())
    .filter((part) => part !== "");

  if (parts.length < 2) return null;

  const left = firstLetter(parts[0] ?? "");
  const right = firstLetter(parts[1] ?? "");
  if (!left || !right) return null;

  return { left, right };
}
