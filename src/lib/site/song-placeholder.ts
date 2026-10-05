/**
 * What the song box says in grey before anyone has typed (spec 28 §6.3).
 *
 * The planner writes their own in the Song requests block; until they do the
 * box carries a joke, because a wedding's song box is the one place on the page
 * where a guest is invited to be funny and a placeholder that shows how is half
 * the prompt. It is a placeholder — a hint in an empty field, never submitted.
 * The artist box says nothing by default.
 */
export const DEFAULT_SONG_PLACEHOLDER = "Anything but Wonderwall";

function written(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function songPlaceholders(payload: unknown): { song: string; artist: string | undefined } {
  return {
    song: written(payload, "placeholder_song") ?? DEFAULT_SONG_PLACEHOLDER,
    artist: written(payload, "placeholder_artist") ?? undefined,
  };
}
