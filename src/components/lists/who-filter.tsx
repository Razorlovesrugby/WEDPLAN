"use client";

import { useRouter } from "next/navigation";

/**
 * The Who choice beside the All tasks view (spec 56 §7). The person is in the
 * address (`?who=`), so the filtered view can be linked to from Settings.
 */
export function WhoFilter({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Who
      <select
        className="field w-auto"
        value={value}
        onChange={(e) => router.replace(e.target.value ? `/lists?view=all&who=${encodeURIComponent(e.target.value)}` : "/lists?view=all")}
      >
        <option value="">Everyone</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
