import { z } from "zod";

/**
 * Guest list filters.
 *
 * Filters live in the URL, not in component state. That makes a filtered list
 * a link: "here are the twelve people who haven't answered" is something you
 * send to your partner, not something you describe to them. It also makes the
 * dashboard's click-through work with no extra machinery — a stat tile is
 * just a link carrying the filter that produced the number.
 */

export const guestFilterSchema = z.object({
  /** Free text over name and email. */
  q: z.string().trim().max(120).optional(),
  tag: z.string().uuid().optional(),
  /** A cut_lines.label — validated against the wedding's actual configured labels at query time, not a compile-time enum (spec 5, part A). */
  tier: z.string().trim().min(1).max(60).optional(),
  rsvp: z.enum(["yes", "no", "maybe", "pending"]).optional(),
  age: z.enum(["adult", "child", "infant"]).optional(),
  side: z.enum(["partner_a", "partner_b", "both", "other"]).optional(),
  /** Rows with a gap you need to fill before the caterer asks. */
  missing: z.enum(["email", "dietary", "address"]).optional(),
  /** Narrow the RSVP filter to one event rather than any event. */
  event: z.string().uuid().optional(),
  sort: z.enum(["name", "household", "rank"]).catch("name").default("name"),
});

export type GuestFilters = z.infer<typeof guestFilterSchema>;

/**
 * Parse untrusted search params. Unknown or malformed values are dropped
 * rather than throwing — a stale bookmark should show an unfiltered list, not
 * an error page.
 */
export function parseGuestFilters(params: Record<string, string | string[] | undefined>): GuestFilters {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single !== "") flat[key] = single;
  }

  const parsed = guestFilterSchema.safeParse(flat);
  if (parsed.success) return parsed.data;

  // Keep whatever survived; drop the rest.
  const salvaged: Record<string, string> = {};
  for (const [key, value] of Object.entries(flat)) {
    const single = guestFilterSchema.shape[key as keyof GuestFilters];
    if (single && single.safeParse(value).success) salvaged[key] = value;
  }
  return guestFilterSchema.parse(salvaged);
}

/** Serialise filters back to a query string, omitting defaults. */
export function guestFiltersToQuery(filters: Partial<GuestFilters>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (key === "sort" && value === "name")) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function countActiveFilters(filters: GuestFilters): number {
  return (["q", "tag", "tier", "rsvp", "age", "side", "missing", "event"] as const).filter(
    (key) => filters[key] !== undefined,
  ).length;
}
