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
