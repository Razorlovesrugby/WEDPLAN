"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateWeddingSettings } from "@/server/actions/settings";
import { utcToZonedInput } from "@/lib/timezone";
import type { WeddingRow } from "@/lib/types/database";

/**
 * One form, one save: name, date, timezone, invite send date, RSVP lock,
 * and the reminder digest's urgency window. All six are columns that
 * already existed except reminder_window_days (0007_settings.sql) — see
 * docs/specs/03-settings-calendar-mobile.md.
 */
export function WeddingBasicsForm({
  wedding,
  timeZones,
}: {
  wedding: WeddingRow;
  timeZones: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const fields = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));

    startTransition(async () => {
      const result = await updateWeddingSettings(fields);
      if (result.ok) {
        setError(null);
        setFieldErrors({});
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setSaved(false);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="space-y-4"
    >
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">Wedding name</span>
          <input name="name" defaultValue={wedding.name} required className="field" />
          {fieldErrors.name ? <p className="mt-1 text-xs text-red-700">{fieldErrors.name[0]}</p> : null}
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">Wedding date</span>
          <input
            type="date"
            name="wedding_date"
            defaultValue={wedding.wedding_date ?? ""}
            className="field"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">Timezone</span>
          <input
            name="timezone"
            list="timezone-options"
            defaultValue={wedding.timezone}
            required
            className="field"
            placeholder="Europe/London"
          />
          <datalist id="timezone-options">
            {timeZones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          {fieldErrors.timezone ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.timezone[0]}</p>
          ) : null}
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">Invitations go out</span>
          <input
            type="date"
            name="invite_send_on"
            defaultValue={wedding.invite_send_on ?? ""}
            className="field"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">RSVP lock date</span>
          <input
            type="datetime-local"
            name="rsvp_lock_at"
            defaultValue={utcToZonedInput(wedding.rsvp_lock_at, wedding.timezone)}
            className="field"
          />
          <p className="mt-1 text-xs text-muted">In the wedding&rsquo;s own timezone, above.</p>
          {fieldErrors.rsvp_lock_at ? (
            <p className="mt-1 text-xs text-red-700">{fieldErrors.rsvp_lock_at[0]}</p>
          ) : null}
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">Reminder digest window (days)</span>
          <input
            type="number"
            name="reminder_window_days"
            min={1}
            max={90}
            defaultValue={wedding.reminder_window_days}
            className="field"
          />
          <p className="mt-1 text-xs text-muted">
            &ldquo;Overdue, plus due within this many days&rdquo; on the dashboard, the calendar,
            and the weekly email. The send day itself (Tuesdays, 10:00 UTC) is set in the app&rsquo;s
            deployment config, not here — changing this number changes what counts as urgent, not
            when the email arrives.
          </p>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          Save
        </button>
        {saved && !pending ? <span className="text-sm text-muted">Saved.</span> : null}
      </div>
    </form>
  );
}
