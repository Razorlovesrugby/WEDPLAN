/**
 * iCalendar (RFC 5545) serialisation for the schedule's "Add to calendar"
 * links (spec 14 §6).
 *
 * Small, but three of these rules fail silently and only on somebody else's
 * phone, which is why they live here with tests rather than inline in a route:
 * an unescaped comma truncates a venue, an unfolded long line is rejected
 * outright by stricter clients, and LF-only output is refused by several.
 */

/** UTC as YYYYMMDDTHHMMSSZ, with no punctuation. */
export function icsStamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 §3.3.11. Backslash, semicolon and comma are escaped; newlines
 * become a literal `\n`.
 *
 * Without this a venue called "The Swan, Wells" silently truncates at the
 * comma in most clients, because a comma separates values in the grammar.
 */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: content lines are folded at 75 octets and continuations
 * begin with a single space.
 *
 * Octets, not characters — the limit is on bytes, and an address with an
 * accent in it reaches 75 bytes before it reaches 75 characters. A fold that
 * lands mid-character produces invalid UTF-8, so the split backs off to a
 * character boundary.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // 74 on continuation lines: the leading space counts toward the 75.
    const limit = start === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end -= 1;
    parts.push((start === 0 ? "" : " ") + bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n");
}

export type IcsEvent = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  description: string | null;
};

/** Default length when an event has no end time. */
export const DEFAULT_EVENT_MINUTES = 60;

export function buildIcs(event: IcsEvent, now: Date = new Date()): string {
  // A zero-length event renders as a dot in most calendars; an hour is what
  // clients assume anyway when asked to guess.
  const end =
    event.endsAt ??
    new Date(new Date(event.startsAt).getTime() + DEFAULT_EVENT_MINUTES * 60_000).toISOString();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wedding//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@wedding`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(event.startsAt)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(event.name)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : null,
    event.description ? `DESCRIPTION:${icsText(event.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  // CRLF, not LF: required by the spec, and several clients reject LF-only.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * An all-day event — the save-the-date's "keep the day free".
 *
 * `VALUE=DATE` rather than a timed event: nobody knows the ceremony time yet,
 * and a 00:00–01:00 block reads as a real appointment at midnight. The end is
 * exclusive (RFC 5545 §3.6.1), so a one-day event ends on the next day.
 */
export function buildAllDayIcs(
  event: {
    id: string;
    name: string;
    start: string;
    end: string;
    location: string | null;
    description: string | null;
  },
  now: Date = new Date(),
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wedding//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@wedding`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART;VALUE=DATE:${event.start}`,
    `DTEND;VALUE=DATE:${event.end}`,
    `SUMMARY:${icsText(event.name)}`,
    "TRANSP:OPAQUE",
    event.location ? `LOCATION:${icsText(event.location)}` : null,
    event.description ? `DESCRIPTION:${icsText(event.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
