"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_TIME_ZONE, timeZoneOptions, utcOffsetLabel } from "@/lib/onboarding";

/**
 * A real timezone picker (spec 40 §7.1): Pacific/Auckland first, then the
 * browser's own zone and the current value, then everything else, each with
 * its offset today. `detect` pre-selects the browser's zone when there is no
 * value yet (the /start form).
 */
export function TimeZoneSelect({
  name,
  timeZones,
  defaultValue,
  detect = false,
  id,
}: {
  name: string;
  timeZones: readonly string[];
  defaultValue?: string | null;
  detect?: boolean;
  id?: string;
}) {
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  // Offsets are added after mount: the server's and the browser's timezone
  // data can disagree, and a label that differs between them breaks hydration.
  const [now, setNow] = useState<Date | null>(null);
  const [value, setValue] = useState(defaultValue ?? DEFAULT_TIME_ZONE);

  useEffect(() => {
    setNow(new Date());
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    setBrowserZone(zone);
    if (detect && !defaultValue && (timeZones.length === 0 || timeZones.includes(zone))) setValue(zone);
  }, [detect, defaultValue, timeZones]);

  const options = useMemo(() => {
    return timeZoneOptions(timeZones, [browserZone, defaultValue, value]).map((tz) => {
      let label = tz.replace(/_/g, " ");
      if (now) {
        try {
          label = `${label} (${utcOffsetLabel(tz, now)})`;
        } catch {
          // an unknown zone shows without its offset
        }
      }
      return { tz, label };
    });
  }, [timeZones, browserZone, defaultValue, value, now]);

  return (
    <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} className="field" required>
      {options.map(({ tz, label }) => (
        <option key={tz} value={tz}>
          {label}
        </option>
      ))}
    </select>
  );
}
