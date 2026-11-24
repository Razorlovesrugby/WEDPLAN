/** "Aroha & Sam" → "A&S"; "Alex and Sam's wedding" → "A&S". Up to two names, falling back to the first two letters. */
export function initialsOf(weddingName: string): string {
  const cleaned = weddingName.replace(/['’]s\b.*$/i, "").replace(/\b(wedding|and)\b/gi, "&");
  const names = cleaned
    .split(/[&+,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const letters = names.slice(0, 2).map((n) => n[0]!.toUpperCase());
  if (letters.length === 2) return `${letters[0]}&${letters[1]}`;
  const only = (names[0] ?? weddingName).replace(/[^A-Za-z]/g, "");
  return (only.slice(0, 2) || "WP").toUpperCase();
}
