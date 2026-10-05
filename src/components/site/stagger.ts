import type { CSSProperties } from "react";

/**
 * A list item's position, for the "lists stagger in" effect (spec 27 §6).
 *
 * `globals.css` turns `--i` into a later `animation-range` per row, which is
 * how a stagger is done under a scroll timeline (an `animation-delay` means
 * nothing there). The class goes on the list, this goes on each child, and
 * with the effect off both are inert — they are a class and a custom property,
 * not behaviour.
 */
export function stagger(index: number): CSSProperties {
  return { ["--i" as string]: index };
}
