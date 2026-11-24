/**
 * What a chair in the room shows (spec 57 A.2): initials at 100% zoom, the
 * first name from 150%, a bare tag when zoomed far out; a red dot for a
 * dietary need and a dashed outline for a guest who can't come any more. Pure.
 */

import type { SeatingGuest } from "./model";

export type ChairDetail = "dot" | "initials" | "name";

/** Below this the names would be a smear (spec 57 §18: "dots below 60% zoom"). */
export const DOT_BELOW = 0.6;
/** From this up there is room to write a first name beside the chair. */
export const NAME_FROM = 1.5;

/** `zoom` is 1 when the whole room fits the screen ("100%"), 2 when twice as close. */
export function chairDetail(zoom: number): ChairDetail {
  if (zoom < DOT_BELOW) return "dot";
  if (zoom >= NAME_FROM) return "name";
  return "initials";
}

/** "AN" for Aroha Ngata; one letter for one name; "" for nobody. */
export function initials(g: Pick<SeatingGuest, "firstName" | "lastName" | "preferredName">): string {
  const first = (g.preferredName || g.firstName || "").trim();
  const last = (g.lastName ?? "").trim();
  const a = [...first][0] ?? "";
  const b = [...last][0] ?? "";
  return (a + b).toUpperCase();
}

/** The name a chair shows at the closest zoom. */
export function chairFirstName(g: Pick<SeatingGuest, "firstName" | "preferredName">): string {
  return (g.preferredName || g.firstName || "").trim();
}

export type ChairMarks = {
  /** Any dietary note: a red dot on the chair. */
  dietary: boolean;
  /** Told us they can't come, or replied No, and still in a chair: a dashed orange outline. */
  declined: boolean;
};

export function chairMarks(g: Pick<SeatingGuest, "dietary" | "excluded" | "rsvp">): ChairMarks {
  return {
    dietary: (g.dietary ?? "").trim() !== "",
    declined: g.excluded || g.rsvp === "no",
  };
}

/** Black or white writing for a chair of this colour (`#rrggbb`), whichever reads better. */
export function readableText(hex: string): "#1a1a1a" | "#ffffff" {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#1a1a1a";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? "#1a1a1a" : "#ffffff";
}
