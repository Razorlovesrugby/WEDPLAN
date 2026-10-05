import { listNames } from "@/lib/invites";

/**
 * The line addressed to a household at the top of their page (spec 27 §5,
 * "The greeting").
 *
 * It is the planner's wording, not ours: a short template with two tokens the
 * renderer fills in.
 *
 *   {names}      the household's first names, joined — "Chidi, Ada and Zara"
 *   {household}  the household's display name, already editable in Guests
 *
 * so "For {names}", "Dear {names}", "Welcome, {household}" and plain "Just for
 * you" are all valid. Choosing between first names and the household name is
 * choosing a token, not a second setting.
 *
 * **Plain text, always.** It is rendered as a React text node, so a `<script>`
 * typed into it is displayed as the characters it is — but the validation still
 * runs on the way in, because the way a template goes wrong is not HTML, it is
 * `{nickname}` rendered literally at the top of a hundred guests' pages.
 *
 * It only ever renders on a household's own page. Nothing here knows about
 * pages; the caller decides, and never calls it for the shared site, a link
 * preview or any metadata (the household link's preview names the couple and
 * the date and nothing else — that discipline is the privacy model).
 */

export const GREETING_TOKENS = ["names", "household"] as const;
export type GreetingToken = (typeof GREETING_TOKENS)[number];

export const DEFAULT_GREETING = "For {names}";
export const GREETING_MAX_LENGTH = 80;

/**
 * More first names than this and `{names}` stops being a greeting and becomes a
 * sentence — "For Chidi, Ada, Zara, Ruth, Tobi, Kemi and Femi" — so it falls
 * back to the household name. One constant, as the spec says.
 */
export const GREETING_MAX_NAMES = 5;

const TOKEN = /\{([^{}]*)\}/g;

export type GreetingCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Whether a template may be saved. Empty is valid and means "use the default".
 *
 * Unknown tokens are refused with the allowed ones named, and so are stray
 * braces: `{names` would otherwise render with its brace, which looks like a
 * bug on every guest's phone.
 */
export function validateGreeting(raw: string): GreetingCheck {
  const value = raw.trim();
  if (value.length > GREETING_MAX_LENGTH) {
    return { ok: false, error: `Keep it to ${GREETING_MAX_LENGTH} characters or fewer` };
  }

  const allowed = GREETING_TOKENS.map((token) => `{${token}}`).join(" or ");
  for (const match of value.matchAll(TOKEN)) {
    if (!(GREETING_TOKENS as readonly string[]).includes(match[1] ?? "")) {
      return { ok: false, error: `${match[0]} isn't something we can fill in. Use ${allowed}.` };
    }
  }

  // Whatever is left once the whole tokens are gone must contain no braces.
  if (/[{}]/.test(value.replace(TOKEN, ""))) {
    return { ok: false, error: `There's a stray { or } in that. Use ${allowed}.` };
  }
  return { ok: true, value };
}

export type GreetingInput = {
  /** The planner's template. Null or empty means the default. */
  template: string | null | undefined;
  /** The household's members' first names, already chosen (preferred over legal). */
  firstNames: readonly string[];
  householdName: string;
};

/**
 * The words to show, or null for nothing.
 *
 * Never throws and never returns a half-filled template: a template that fails
 * validation (it was saved by an older version, or edited by hand in the
 * database) falls back to the default rather than putting `{what}` on a page.
 */
export function renderGreeting({ template, firstNames, householdName }: GreetingInput): string | null {
  const chosen = template?.trim() ? template.trim() : DEFAULT_GREETING;
  const checked = validateGreeting(chosen);
  const source = checked.ok ? checked.value : DEFAULT_GREETING;

  const household = householdName.trim();
  const names = firstNames.map((name) => name.trim()).filter(Boolean);
  // No named guests, or too many: the household's own name is the honest answer.
  const namesText = names.length === 0 || names.length > GREETING_MAX_NAMES ? household : listNames(names);

  const text = source
    .replace(TOKEN, (_whole, token: string) => (token === "names" ? namesText : household))
    .replace(/\s+/g, " ")
    .trim();

  // A template that renders to nothing — "{names}" for a household with no name
  // and no guests — hides the line rather than leaving its space.
  return text === "" ? null : text;
}
