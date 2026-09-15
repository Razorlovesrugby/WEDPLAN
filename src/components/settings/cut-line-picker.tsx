"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCutLine } from "@/server/actions/rank";
import type { HouseholdView } from "@/lib/types/database";

/**
 * The numeric/typed alternative to dragging on /guests/rank — spec 03
 * section 7, decision 3. Deliberately a picker, not a rank text field: the
 * cut line is a fractional-index rank string (COLLATE "C", never ending in
 * "0" — docs/HANDOFF.md section 5, points 2-3), and a client-typed string
 * could violate either rule. setCutLine() already reads the chosen
 * household's own rank server-side rather than accepting one from the
 * client, so this component only ever sends a household id.
 */
export function CutLinePicker({
  households,
  cutRank,
  tierBRank,
}: {
  households: HouseholdView[];
  cutRank: string | null;
  tierBRank: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(which: "a" | "b", householdId: string) {
    startTransition(async () => {
      const result = await setCutLine(householdId || null, which);
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const currentA = households.find((h) => h.rank === cutRank)?.id ?? "";
  const currentB = households.find((h) => h.rank === tierBRank)?.id ?? "";

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">Cut line A (invited / waitlist)</span>
          <select
            className="field"
            value={currentA}
            disabled={pending}
            onChange={(e) => save("a", e.target.value)}
          >
            <option value="">No cut — everyone above the line</option>
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                Last invited: {h.display_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium">Cut line B (waitlist tiers)</span>
          <select
            className="field"
            value={currentB}
            disabled={pending}
            onChange={(e) => save("b", e.target.value)}
          >
            <option value="">One undivided waitlist</option>
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                Last in tier B: {h.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-muted">
        Same as dragging on{" "}
        <a href="/guests/rank" className="underline">
          the ranking screen
        </a>{" "}
        — this just sets the line directly instead of dragging to it.
      </p>
    </div>
  );
}
