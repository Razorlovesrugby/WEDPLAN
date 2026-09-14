/**
 * Converting between a wall-clock time and an instant.
 *
 * A `datetime-local` input has no timezone: it yields "2027-06-12T13:00" and
 * nothing else. That string means 13:00 at the venue — not 13:00 wherever the
 * person typing happens to be sitting. Getting this backwards puts the
 * ceremony an hour out for a couple planning from abroad, and an hour out is
 * exactly the size of error nobody notices until the day.
 */

/** The zone's offset from UTC, in milliseconds, at a given instant. */
function offsetAt(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const asIfUtc = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
  );
  return asIfUtc - instantMs;
}

/**
 * "2027-06-12T13:00" in a named zone → the ISO instant it refers to.
 *
 * Two passes. The offset depends on the instant, and the instant is what we
 * are solving for, so the first pass uses the offset at the naive guess and
 * the second corrects it. That second pass is what makes a time on the
 * morning of a clock change come out right.
 */
export function zonedInputToUtc(localInput: string, timeZone: string): string | null {
  // Shape-check first. Date.parse is lenient enough to turn "not-a-date:00Z"
  // into the year 2000 rather than NaN, so it cannot be the validator.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(localInput ?? "");
  if (!match) return null;

  const naiveMs = Date.parse(`${match[1]}T${match[2]}:00Z`);
  if (Number.isNaN(naiveMs)) return null;

  let instant = naiveMs - offsetAt(naiveMs, timeZone);
  instant = naiveMs - offsetAt(instant, timeZone);
  return new Date(instant).toISOString();
}

/** The inverse: an instant → the "YYYY-MM-DDTHH:mm" a datetime-local expects. */
export function utcToZonedInput(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
