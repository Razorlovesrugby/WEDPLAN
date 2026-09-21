import { formatMoney } from "@/lib/format";

/**
 * Arrival points and typed legs (spec 25 §5).
 *
 * `0017_public_site.sql` deliberately gave `transport_options` no cost and no
 * duration:
 *
 *   "At this distance a guest wants a sentence and a phone number; the
 *    comparison table a destination wedding needs would be five empty columns
 *    here."
 *
 * That reasoning was scoped to a wedding people drive to, and it still holds
 * for one. So everything here is nullable and every formatter returns null
 * rather than a placeholder — a wedding down the road renders exactly what it
 * rendered before, with no empty columns anywhere near it.
 */

export type ArrivalPoint = {
  id: string;
  code: string | null;
  name: string;
  region: string | null;
  minutes_to_venue: number | null;
  sort_order: number;
};

export type TransportLeg = {
  id: string;
  arrival_point_id: string | null;
  kind: string;
  name: string;
  detail: string | null;
  url: string | null;
  duration_minutes: number | null;
  cost_low: number | null;
  cost_high: number | null;
  sort_order: number;
};

/**
 * "3 HOURS TO THE VENUE", "2 HOURS 30", "45 MINUTES".
 *
 * Whole hours drop the minutes rather than printing "3 HOURS 0". Null in,
 * null out — the caller omits the line instead of drawing "— MINUTES".
 */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes === 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} ${rest === 1 ? "minute" : "minutes"}`;
  const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest}`;
}

/**
 * "$45.00–$85.00", or one figure when both match, or null when neither is set.
 *
 * A range with only one end filled prints that end with "from" or "up to",
 * because "$45.00–" is a typo and "$45.00" alone would claim a precision
 * nobody entered.
 */
export function formatCostRange(
  low: number | null | undefined,
  high: number | null | undefined,
): string | null {
  const l = typeof low === "number" && Number.isFinite(low) ? low : null;
  const h = typeof high === "number" && Number.isFinite(high) ? high : null;

  if (l === null && h === null) return null;
  if (l !== null && h === null) return `from ${formatMoney(l)}`;
  if (l === null && h !== null) return `up to ${formatMoney(h)}`;
  if (l === h) return formatMoney(l);
  return `${formatMoney(l)}–${formatMoney(h)}`;
}

export type ArrivalGroup = {
  point: ArrivalPoint;
  legs: TransportLeg[];
};

/**
 * Legs grouped under the arrival point they start from, plus the ones that
 * belong to no point at all.
 *
 * Parking is the obvious loose leg: it is not how you get to the country, it
 * is what you do when you arrive. Those render as a plain list under the
 * grouped ones, exactly as `transport_options` rendered before this existed.
 */
export function groupByArrival(
  points: ArrivalPoint[],
  legs: TransportLeg[],
): { grouped: ArrivalGroup[]; loose: TransportLeg[] } {
  const byOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
    a.sort_order - b.sort_order;

  const known = new Set(points.map((point) => point.id));
  const byPoint = new Map<string, TransportLeg[]>();
  const loose: TransportLeg[] = [];

  for (const leg of legs) {
    // A leg pointing at an arrival point that no longer exists is loose rather
    // than lost. The FK nulls on delete, but a stale read between the two is
    // not a reason to drop somebody's taxi number off the page.
    if (leg.arrival_point_id && known.has(leg.arrival_point_id)) {
      const list = byPoint.get(leg.arrival_point_id);
      if (list) list.push(leg);
      else byPoint.set(leg.arrival_point_id, [leg]);
    } else {
      loose.push(leg);
    }
  }

  const grouped = [...points]
    .sort(byOrder)
    .map((point) => ({ point, legs: (byPoint.get(point.id) ?? []).slice().sort(byOrder) }))
    // An arrival point with no legs is a heading with nothing under it.
    .filter((group) => group.legs.length > 0);

  return { grouped, loose: loose.sort(byOrder) };
}

/** "MXP · Milan Malpensa · Italy", dropping whatever is not set. */
export function arrivalHeading(point: ArrivalPoint): { code: string | null; rest: string } {
  const rest = [point.name, point.region].filter((part) => part && part.trim()).join(" · ");
  return { code: point.code?.trim() || null, rest };
}
