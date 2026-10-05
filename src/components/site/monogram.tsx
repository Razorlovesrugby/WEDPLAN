import { firstNamesFromName, monogramFromName } from "@/lib/site/names";

/**
 * The monogram (spec 14 §5): two initials and an ampersand, drawn as type
 * rather than uploaded as an image, so it themes with the palette and stays
 * sharp at any size.
 *
 * Renders nothing when the name will not yield two initials — see
 * `monogramFromName`. A half monogram is worse than none.
 */
export function Monogram({ name, className }: { name: string | null; className?: string }) {
  const mono = monogramFromName(name);
  if (!mono) return null;

  return (
    <span
      className={`inline-flex items-baseline gap-[0.1em] font-script leading-none ${className ?? ""}`}
      // The initials are decorative: the couple's names are already the page's
      // h1 directly beneath. Announcing "A ampersand S" before them is noise.
      aria-hidden="true"
    >
      <span>{mono.left}</span>
      <span className="text-[0.75em] opacity-70">&amp;</span>
      <span>{mono.right}</span>
    </span>
  );
}

/**
 * The left edge of the top bar (spec 28 §5.1): the initials, or — when the
 * wedding's name gives none — the two first names in small caps. Always
 * something, because the bar's left edge is also the way back to the top.
 */
export function NavMark({ name }: { name: string | null }) {
  if (monogramFromName(name)) return <Monogram name={name} className="text-xl" />;

  const names = firstNamesFromName(name);
  return names ? (
    <span className="text-[0.78rem] uppercase tracking-[0.14em]" aria-hidden="true">
      {names}
    </span>
  ) : null;
}
