/**
 * Where the registry's Contribute block goes (spec 38). Pure, so the rule is
 * tested here and not inferred from the markup.
 */

export const CONTRIBUTE_POSITIONS = ["off", "above", "below"] as const;
export type ContributePosition = (typeof CONTRIBUTE_POSITIONS)[number];

export function isContributePosition(value: unknown): value is ContributePosition {
  return typeof value === "string" && (CONTRIBUTE_POSITIONS as readonly string[]).includes(value);
}

/** Anything unrecognised reads as off: a stray value must never show bank details. */
export function resolveContributePosition(value: unknown): ContributePosition {
  return isContributePosition(value) ? value : "off";
}

export const CONTRIBUTE_LABELS: Record<ContributePosition, string> = {
  off: "Off",
  above: "Above the gifts",
  below: "Below the gifts",
};

const DEFAULT_HEADING: Record<"above" | "below", string> = {
  above: "Prefer to contribute?",
  below: "Or give towards something bigger",
};

export type ContributeInput = {
  position: ContributePosition;
  heading: string | null;
  text: string | null;
  buttonOnly: boolean;
  fundCount: number;
  hasBank: boolean;
  hasOnlineLink: boolean;
};

export type ContributeSection = {
  position: "above" | "below";
  heading: string;
  text: string | null;
  /** False: show the heading and the Contribute button, not the list of funds. */
  listFunds: boolean;
};

/**
 * The section to draw, or null when there is nothing to draw — off, or nothing
 * behind the button. A button-only section needs somewhere for the button to go.
 */
export function contributeSection(input: ContributeInput): ContributeSection | null {
  if (input.position === "off") return null;
  const canContribute = input.hasBank || input.hasOnlineLink;
  const hasContent = input.buttonOnly ? canContribute : input.fundCount > 0 || canContribute;
  if (!hasContent) return null;
  return {
    position: input.position,
    heading: input.heading?.trim() || DEFAULT_HEADING[input.position],
    text: input.text?.trim() || null,
    listFunds: !input.buttonOnly,
  };
}

/** What the settings screen should tell the couple about the section as it stands. */
export function contributeHint(input: ContributeInput): string | null {
  if (input.position === "off") return null;
  if (input.buttonOnly && !(input.hasBank || input.hasOnlineLink)) {
    return "“Just the button” has nothing behind it yet — add your bank details or an online link.";
  }
  if (contributeSection(input) === null) return "Nothing to show yet — add your bank details.";
  return null;
}
