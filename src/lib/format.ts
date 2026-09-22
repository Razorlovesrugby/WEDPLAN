/**
 * Display formatting.
 *
 * Everything is stored as timestamptz and rendered in the wedding's timezone,
 * never the viewer's. A couple planning a wedding in Bath from a laptop in
 * Lisbon must not see the ceremony an hour out.
 */

export function formatDate(
  value: string | Date | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, timeZone: string): string {
  return formatDate(value, timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date | null | undefined, timeZone: string): string {
  return formatDate(value, timeZone, { hour: "2-digit", minute: "2-digit" });
}

/** "in 8 months", "3 days ago" — for send and response timestamps. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600_000],
    ["month", 30 * 24 * 3600_000],
    ["week", 7 * 24 * 3600_000],
    ["day", 24 * 3600_000],
    ["hour", 3600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return "just now";
}

/** Whole days until a date, floored. Negative once it has passed. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
}

/**
 * How long until a moment, as the biggest unit that still says something
 * useful (spec 25 §7, extended for Editorial's hero counter).
 *
 * `daysUntil` counts whole days and nothing else, which is right for a
 * section in the middle of a page and wrong for the corner of a hero on the
 * morning of the wedding — "0 days to go" is the one day it most needs to be
 * more specific. Inside the last day this drops to hours, and inside the last
 * hour it says the day has arrived.
 *
 * Null once the moment has passed: the hero renders nothing rather than a
 * negative count.
 *
 * `now` is injectable so this is testable without freezing the clock.
 */
export type TimeLeft = { value: number; unit: "days" | "hours" | "now" };

export function timeLeft(
  value: string | null | undefined,
  now: number = Date.now(),
): TimeLeft | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;

  const ms = target - now;
  if (ms < 0) return null;

  if (ms >= 86_400_000) return { value: Math.ceil(ms / 86_400_000), unit: "days" };
  const hours = Math.floor(ms / 3_600_000);
  return hours === 0 ? { value: 0, unit: "now" } : { value: hours, unit: "hours" };
}

/** `timeLeft` as the words the hero prints. */
export function timeLeftLabel(left: TimeLeft | null): string | null {
  if (!left) return null;
  if (left.unit === "now") return "Today";
  const noun = left.unit === "days" ? "day" : "hour";
  return `${left.value} ${left.value === 1 ? noun : `${noun}s`} to go`;
}

/** Minor units (cents) to an NZD string — every wedding is NZD only (spec 18), e.g. formatMoney(460000) -> "$4,600.00". */
export function formatMoney(minorUnits: number | null | undefined): string {
  if (minorUnits === null || minorUnits === undefined) return "—";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(minorUnits / 100);
}

/**
 * Money for the guest site, where cents are noise.
 *
 * `formatMoney` is the planner's formatter and keeps its cents, because a
 * budget that rounds is a budget that stops reconciling. A gift fund reading
 * "$1,200" rather than "$1,200.00" is the same number with less to read, and
 * a fund that genuinely sits at $1,200.50 still says so.
 */
export function formatMoneyShort(minorUnits: number | null | undefined): string {
  if (minorUnits === null || minorUnits === undefined) return "—";
  const whole = minorUnits % 100 === 0;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minorUnits / 100);
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "Chidi Okonkwo", preferring what they actually go by. */
export function guestName(guest: {
  first_name: string;
  last_name?: string | null;
  preferred_name?: string | null;
}): string {
  const first = guest.preferred_name?.trim() || guest.first_name;
  return [first, guest.last_name].filter(Boolean).join(" ");
}

/**
 * "Ray" / "Olivia" — a guest's `side` labelled with the couple's own names
 * (spec 20), reusing the collaborator display names spec 15 already added
 * for task assignment rather than a second settings field. `partner_a` is
 * the owner collaborator, `partner_b` the other one; either falls back to
 * "Partner A"/"Partner B" until a name is set under Settings → Names.
 */
export function sideLabel(
  side: "partner_a" | "partner_b" | "both" | "other" | null | undefined,
  collaborators: { role: "owner" | "partner"; display_name: string | null }[],
): string {
  if (!side) return "—";
  if (side === "both") return "Both";
  if (side === "other") return "Other";
  const wantsOwner = side === "partner_a";
  const collaborator = collaborators.find((c) => (c.role === "owner") === wantsOwner);
  return collaborator?.display_name || (wantsOwner ? "Partner A" : "Partner B");
}
