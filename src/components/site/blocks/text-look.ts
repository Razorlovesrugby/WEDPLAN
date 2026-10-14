import type { BlockStyle } from "@/lib/site/blocks";
import { siteTokens, type SiteTheme } from "@/lib/theme/presets";
import { blockTextStyle, resolveBlockText } from "@/lib/theme/text-style";

/**
 * What one block's own text colour and font add to its wrapper (spec 31).
 *
 * Pure and React-free so the rules are unit-tested rather than inferred from
 * markup. Nothing here for a block that has no choices of its own, and nothing
 * at all while the theme's "same in every section" switch is on — block values
 * are *ignored* then (and cleared at the moment the switch is turned on).
 */
export type BlockTextLook = {
  style: Record<string, string> | undefined;
  /** Own text colour on paper or a tint: the wrapper needs `text-ink` to adopt it. */
  ownInk: boolean;
  /** Own text colour over a photograph: replaces the fixed `onphoto` cream. */
  photoColour: boolean;
  /** Own font: the wrapper sets its family from `--font-body`. */
  ownFont: boolean;
};

export const NO_TEXT_LOOK: BlockTextLook = { style: undefined, ownInk: false, photoColour: false, ownFont: false };

export function blockTextLook(
  style: BlockStyle,
  theme: SiteTheme,
  /** False when the photograph asset is missing — the block then draws as paper. */
  hasPhoto: boolean,
): BlockTextLook {
  if (theme.textStyle.matchAll) return NO_TEXT_LOOK;

  const background = style.background === "photograph" && !hasPhoto ? "paper" : style.background;
  const result = resolveBlockText(
    { background, textColour: style.textColour, mutedColour: style.mutedColour },
    siteTokens(theme),
  );
  const css = blockTextStyle(result, background);
  if (style.bodyFont) css["--font-body"] = `var(--face-${style.bodyFont})`;
  if (Object.keys(css).length === 0) return NO_TEXT_LOOK;

  return {
    style: css,
    ownInk: Boolean(result.text) && (background ?? "paper") !== "ink" && background !== "photograph",
    photoColour: Boolean(result.text) && background === "photograph",
    ownFont: Boolean(style.bodyFont),
  };
}
