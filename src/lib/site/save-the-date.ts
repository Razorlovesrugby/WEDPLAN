import { householdPath, type HouseholdAddress } from "./household-slug";
import { PALETTE_IDS, type PaletteId } from "@/lib/theme/presets";
import type { SiteAssetKind } from "@/lib/types/database";

/**
 * The save-the-date page: `/w/<wedding>/<household>/save-the-date`.
 *
 * Per household, not one shared link, because the planner wants to see who
 * opened it — and a shared URL can only ever say how many times. It hangs off
 * the household's own address, so the five-character suffix is the credential
 * here exactly as it is for the invitation.
 */
export function saveTheDatePath(weddingSlug: string, address: HouseholdAddress): string {
  return `${householdPath(weddingSlug, address)}/save-the-date`;
}

// ---------------------------------------------------------------------------
// What the planner designs
// ---------------------------------------------------------------------------
// Stored as one `site_content` row under this key, like the theme: it is one
// small piece of configuration, not a list of things, and a table for it would
// be a table with one row per wedding.

export const SAVE_THE_DATE_BLOCK_KEY = "save_the_date";

export const SAVE_THE_DATE_LAYOUTS = ["cover", "editorial", "postcard"] as const;
export type SaveTheDateLayout = (typeof SAVE_THE_DATE_LAYOUTS)[number];

export const SAVE_THE_DATE_LAYOUT_LABELS: Record<
  SaveTheDateLayout,
  { label: string; description: string }
> = {
  cover: {
    label: "Cover",
    description: "Your lead photo edge to edge, names set over it.",
  },
  editorial: {
    label: "Editorial",
    description: "Names first, very large, the photos beneath.",
  },
  postcard: {
    label: "Postcard",
    description: "Centred and framed, like the card on the mantelpiece.",
  },
};

/** How many photographs the page shows at most. One lead, then a row beneath. */
export const SAVE_THE_DATE_PHOTO_LIMIT = 6;

export const SAVE_THE_DATE_TEXT_LIMITS = {
  eyebrow: 40,
  headline: 120,
  dateLabel: 80,
  location: 120,
  message: 600,
} as const;

export const DEFAULT_SAVE_THE_DATE_MESSAGE =
  "Nothing to do yet — just keep the day free. The invitation, with all the details, follows nearer the time.";

export type SaveTheDateContent = {
  eyebrow: string;
  /** Null means "the wedding's name". */
  headline: string | null;
  /** Null means "the wedding date, written out". */
  dateLabel: string | null;
  location: string | null;
  message: string;
  /**
   * The photographs, in order. **Null is not the same as empty**: null means
   * "never chosen, pick from my site photos", and an empty list means the
   * couple chose none — a type-only save-the-date is a real design.
   */
  photoIds: string[] | null;
  layout: SaveTheDateLayout;
  /** "site" follows the site's own palette, so the two stay related. */
  palette: "site" | PaletteId;
  /** "For the Okonkwos" — the household's name, above the names. */
  showGreeting: boolean;
  showCountdown: boolean;
  showCalendar: boolean;
};

export const DEFAULT_SAVE_THE_DATE: SaveTheDateContent = {
  eyebrow: "Save the date",
  headline: null,
  dateLabel: null,
  location: null,
  message: DEFAULT_SAVE_THE_DATE_MESSAGE,
  photoIds: null,
  layout: "cover",
  palette: "site",
  showGreeting: true,
  showCountdown: false,
  showCalendar: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the stored payload. Never throws, and every field falls back on its
 * own — the same rule `resolveTheme` follows, for the same reason: a guest
 * must never get a broken page because one key was renamed.
 */
export function resolveSaveTheDate(payload: unknown): SaveTheDateContent {
  if (!isRecord(payload)) return DEFAULT_SAVE_THE_DATE;
  const d = DEFAULT_SAVE_THE_DATE;
  const L = SAVE_THE_DATE_TEXT_LIMITS;

  const rawPhotos = payload["photo_ids"];
  const photoIds = Array.isArray(rawPhotos)
    ? [
        ...new Set(rawPhotos.filter((id): id is string => typeof id === "string" && UUID.test(id))),
      ].slice(0, SAVE_THE_DATE_PHOTO_LIMIT)
    : null;

  const layout = payload["layout"];
  const palette = payload["palette"];
  const bool = (key: string, fallback: boolean) =>
    typeof payload[key] === "boolean" ? (payload[key] as boolean) : fallback;

  return {
    eyebrow: optionalString(payload["eyebrow"], L.eyebrow) ?? d.eyebrow,
    headline: optionalString(payload["headline"], L.headline),
    dateLabel: optionalString(payload["date_label"], L.dateLabel),
    location: optionalString(payload["location"], L.location),
    message: optionalString(payload["message"], L.message) ?? d.message,
    photoIds,
    layout: (SAVE_THE_DATE_LAYOUTS as readonly unknown[]).includes(layout)
      ? (layout as SaveTheDateLayout)
      : d.layout,
    palette:
      palette === "site" || (PALETTE_IDS as readonly unknown[]).includes(palette)
        ? (palette as SaveTheDateContent["palette"])
        : d.palette,
    showGreeting: bool("show_greeting", d.showGreeting),
    showCountdown: bool("show_countdown", d.showCountdown),
    showCalendar: bool("show_calendar", d.showCalendar),
  };
}

/** The inverse, for the action that stores it. */
export function saveTheDatePayload(content: SaveTheDateContent): Record<string, unknown> {
  return {
    eyebrow: content.eyebrow,
    headline: content.headline,
    date_label: content.dateLabel,
    location: content.location,
    message: content.message,
    photo_ids: content.photoIds,
    layout: content.layout,
    palette: content.palette,
    show_greeting: content.showGreeting,
    show_countdown: content.showCountdown,
    show_calendar: content.showCalendar,
  };
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

type PhotoCandidate = {
  id: string;
  kind: SiteAssetKind;
  sort_order: number;
  uploaded_by_household: string | null;
};

const KIND_ORDER: Partial<Record<SiteAssetKind, number>> = {
  hero: 0,
  story: 1,
  gallery: 2,
};

/**
 * The automatic choice, used until the couple picks their own.
 *
 * The couple's own only. A guest's upload to the gallery is theirs to share on
 * the wedding site after the fact; it is not something to put on the card that
 * announces the wedding to everyone else. The hero leads, because it is the
 * photograph the couple already chose to open with.
 */
export function pickSaveTheDatePhotos<T extends PhotoCandidate>(
  rows: readonly T[],
  limit = SAVE_THE_DATE_PHOTO_LIMIT,
): T[] {
  return rows
    .filter((row) => row.uploaded_by_household === null && KIND_ORDER[row.kind] !== undefined)
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.sort_order - b.sort_order,
    )
    .slice(0, limit);
}

/** Put fetched rows back into the order the couple chose, dropping any that vanished. */
export function orderByIds<T extends { id: string }>(
  rows: readonly T[],
  ids: readonly string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

// ---------------------------------------------------------------------------
// What the guest reads
// ---------------------------------------------------------------------------

/** A `date` column as its three parts, or null. Never through `new Date()`. */
export function parseWeddingDate(value: string | null): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * "14 March 2027", from the date's own parts.
 *
 * Not `formatDate(value, timezone)`: a `date` column is a calendar day, not an
 * instant, and turning "2027-03-14" into midnight UTC and then into a timezone
 * west of Greenwich prints the 13th — on the one card whose whole job is the
 * date.
 */
export function writeOutDate(value: string | null): string | null {
  const parts = parseWeddingDate(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type SaveTheDateDisplay = {
  eyebrow: string;
  headline: string;
  dateLabel: string | null;
  location: string | null;
  message: string;
};

/** The words on the page, with every blank filled from the wedding itself. */
export function saveTheDateDisplay(
  content: SaveTheDateContent,
  wedding: { name: string; wedding_date: string | null },
): SaveTheDateDisplay {
  return {
    eyebrow: content.eyebrow,
    headline: content.headline ?? wedding.name,
    dateLabel: content.dateLabel ?? writeOutDate(wedding.wedding_date),
    location: content.location,
    message: content.message,
  };
}

// ---------------------------------------------------------------------------
// Add to calendar
// ---------------------------------------------------------------------------
// A save-the-date's whole job is getting the day into a calendar before
// somebody books a holiday over it, so the card does it in one tap: an .ics
// for Apple and Outlook, and a link for Google, which does not open .ics files
// on Android.

function compactDate(parts: { y: number; m: number; d: number }): string {
  return `${parts.y}${String(parts.m).padStart(2, "0")}${String(parts.d).padStart(2, "0")}`;
}

/** The day after, for an all-day event's exclusive end. */
export function nextDay(parts: { y: number; m: number; d: number }) {
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + 1));
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

export function allDayRange(weddingDate: string | null): { start: string; end: string } | null {
  const parts = parseWeddingDate(weddingDate);
  if (!parts) return null;
  return { start: compactDate(parts), end: compactDate(nextDay(parts)) };
}

/**
 * What the entry is called in somebody's calendar. "Ray & Olivia" alone, seen
 * a year from now in a month view, could be dinner; the word "wedding" makes
 * it unmistakable. Left alone when the couple already wrote it themselves.
 */
export function calendarEventTitle(headline: string): string {
  return /wedding/i.test(headline) ? headline : `${headline}'s wedding`;
}

export function googleCalendarUrl(options: {
  title: string;
  weddingDate: string | null;
  location: string | null;
  details: string | null;
}): string | null {
  const range = allDayRange(options.weddingDate);
  if (!range) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: options.title,
    dates: `${range.start}/${range.end}`,
  });
  if (options.details) params.set("details", options.details);
  if (options.location) params.set("location", options.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function saveTheDateIcsPath(weddingSlug: string): string {
  return `/api/public/save-the-date/${weddingSlug}`;
}
