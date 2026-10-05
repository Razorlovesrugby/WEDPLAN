import {
  BLOCK_ALIGNS,
  BLOCK_BACKGROUNDS,
  BLOCK_WIDTHS,
  IMAGE_SHAPES,
  type BlockStyle,
} from "./blocks";

/**
 * The planner's words for the style controls (spec 24 §7, answered in spec 27).
 *
 * The stored values do not change — `paper`, `tinted`, `ink`, `contained`,
 * `natural` are what is in every existing row and every published revision.
 * This is a label map, so there is no migration and no rewrite.
 *
 * It is typed over each enum so adding a member without a label is a
 * compile error, and `style-labels.test.ts` checks the same at runtime.
 */

export const WIDTH_LABEL: Record<(typeof BLOCK_WIDTHS)[number], string> = {
  contained: "Normal",
  wide: "Wide",
  full: "Edge to edge",
};

export const BACKGROUND_LABEL: Record<(typeof BLOCK_BACKGROUNDS)[number], string> = {
  paper: "Plain",
  tinted: "Tinted",
  ink: "Dark",
  photograph: "Photograph",
};

export const ALIGN_LABEL: Record<(typeof BLOCK_ALIGNS)[number], string> = {
  left: "Left",
  centre: "Centred",
};

export const SHAPE_LABEL: Record<(typeof IMAGE_SHAPES)[number], string> = {
  natural: "As taken",
  square: "Square",
  portrait: "Tall",
  wide: "Wide",
};

/** The heading above each control — the key is schema, this is English. */
export const STYLE_TITLE: Partial<Record<keyof BlockStyle, string>> = {
  width: "Width",
  align: "Alignment",
  shape: "Photo shape",
};

/** Option lists in display order, keyed by the style they belong to. */
export const STYLE_CHOICES = {
  width: BLOCK_WIDTHS.map((value) => ({ value, label: WIDTH_LABEL[value] })),
  align: BLOCK_ALIGNS.map((value) => ({ value, label: ALIGN_LABEL[value] })),
  shape: IMAGE_SHAPES.map((value) => ({ value, label: SHAPE_LABEL[value] })),
} as const;

const IRREGULAR: Record<string, string> = { person: "people", child: "children" };

/**
 * "question" → "Questions", "person" → "People".
 *
 * The repeat-group heading used to print the payload key, so the FAQ editor
 * had a section headed "items". Every form already carries a `noun` for its
 * "Add a …" button; the heading is that, pluralised.
 */
export function repeatHeading(noun: string): string {
  const trimmed = noun.trim();
  if (trimmed === "") return "";
  const plural = IRREGULAR[trimmed.toLowerCase()] ?? `${trimmed}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}
