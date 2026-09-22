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

/**
 * A headline split around its joiner — "Ray", "&", "Olivia".
 *
 * Editorial sets the names at up to 150px, where two of them on one line is
 * either unreadable or not a line at all. The ampersand drops to its own row
 * at 0.42em, so the split has to happen somewhere; it happens here rather than
 * in the hero because "what counts as a joiner" is the same question
 * `monogramFromName` already answers, and two regexes for one rule is how one
 * of them quietly stops matching "og".
 *
 * Null when the name will not split — "The Okonkwo Wedding" has no two halves,
 * and the hero sets it as one run rather than inventing a break.
 */
export type Headline = { left: string; joiner: string; right: string };

export function splitHeadline(name: string | null | undefined): Headline | null {
  if (!name) return null;

  // The same joiners as the monogram, captured rather than discarded: the
  // couple wrote "and" or "+" on purpose and the hero should say it back.
  const match = /^(.+?)\s+(&|\+|and|og|et|y|e)\s+(.+)$/i.exec(name.trim());
  if (!match) return null;

  const [, left, joiner, right] = match;
  if (!left?.trim() || !right?.trim()) return null;

  return { left: left.trim(), joiner: joiner!, right: right.trim() };
}
