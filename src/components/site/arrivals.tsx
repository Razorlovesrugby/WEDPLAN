import { Label } from "./section";
import {
  arrivalHeading,
  formatCostRange,
  formatDuration,
  groupByArrival,
  type ArrivalPoint,
  type TransportLeg,
} from "@/lib/site/travel";

/**
 * Getting here, as arrival points with typed legs under them (spec 25 §5).
 *
 * `0017_public_site.sql` refused cost and duration columns because a wedding
 * people drive to would show five empty ones. Every figure here is optional
 * and every missing one is simply not drawn, so that wedding renders exactly
 * what it rendered before: a sentence and a phone number.
 */
export function Arrivals({
  points,
  legs,
}: {
  points: ArrivalPoint[];
  legs: TransportLeg[];
}) {
  const { grouped, loose } = groupByArrival(points, legs);
  if (grouped.length === 0 && loose.length === 0) return null;

  return (
    <div className="space-y-12">
      {grouped.map(({ point, legs: pointLegs }) => {
        const { code, rest } = arrivalHeading(point);
        const toVenue = formatDuration(point.minutes_to_venue);
        return (
          <section key={point.id}>
            {code ? (
              <p className="font-serif text-4xl tracking-wide text-accent">{code}</p>
            ) : null}
            {toVenue ? (
              <p className="mt-1">
                <Label>{toVenue} to the venue</Label>
              </p>
            ) : null}
            <p className="mt-2 font-serif text-xl text-ink">{rest}</p>
            <Legs legs={pointLegs} />
          </section>
        );
      })}

      {/* Parking is not how you get to the country — it is what you do when
          you arrive, so it hangs off no arrival point and renders plainly. */}
      {loose.length > 0 ? (
        <section>
          <Legs legs={loose} />
        </section>
      ) : null}
    </div>
  );
}

function Legs({ legs }: { legs: TransportLeg[] }) {
  if (legs.length === 0) return null;

  return (
    <ul className="mt-5 divide-y divide-line border-t border-line">
      {legs.map((leg) => {
        const duration = formatDuration(leg.duration_minutes);
        const cost = formatCostRange(leg.cost_low, leg.cost_high);
        return (
          <li key={leg.id} className="grid gap-x-5 gap-y-1 py-4 sm:grid-cols-[6rem_1fr_auto]">
            <div>
              <Label>{leg.kind}</Label>
            </div>
            <div>
              <p className="text-[1.0625rem] text-ink">
                {leg.url ? (
                  <a
                    className="text-accent underline underline-offset-2"
                    href={leg.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {leg.name}
                  </a>
                ) : (
                  leg.name
                )}
              </p>
              {leg.detail ? (
                <p className="mt-1 whitespace-pre-line text-[0.95rem] italic text-muted">
                  {leg.detail}
                </p>
              ) : null}
            </div>
            {/* The whole column disappears when neither figure is set, rather
                than leaving an empty cell where a number should be. */}
            {duration || cost ? (
              <div className="sm:text-right">
                {duration ? <Label>{duration}</Label> : null}
                {cost ? (
                  <p>
                    <Label>{cost}</Label>
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
